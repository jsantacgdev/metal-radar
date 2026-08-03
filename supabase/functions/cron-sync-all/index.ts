import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
};

const TRIBUTE_KEYWORDS =
  /\b(tribute|tributo|homenaje|cover|vs\.?|versus|experience|story of|by candlelight|reimagined|symphonic)\b/i;

const VIP_KEYWORDS = /\b(vip packages?|paquetes? vip|hospitality|meet [&y] greet)\b/i;

const NON_BAND_NAME =
  /\b(festival|fest\b|bluesfest|tour|experience|tributo|tribute|concert\s+series|hospitality|vip|stage|ticketmaster\s+suite|ball\s+arena|club\s+level)\b/i;

const STALE_THRESHOLD_HOURS = 12;

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCountry(name?: string): string | null {
  if (!name) return null;
  return name.toLowerCase().trim();
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=3`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeCountry(data.address?.country);
  } catch {
    return null;
  }
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRealBand(attr: any): boolean {
  if (!attr.name) return false;
  if (NON_BAND_NAME.test(attr.name)) return false;

  const cls = attr.classifications?.[0];
  if (!cls) return true;

  if (cls.segment?.name && cls.segment.name !== 'Music') return false;
  if (cls.subType?.name === 'Festival') return false;

  if (cls.type?.name === 'Event Style') {
    const hasMusicGenre = !!cls.genre?.name && cls.genre.name !== 'Undefined';
    return hasMusicGenre;
  }

  return true;
}

type TmEvent = {
  id: string;
  name: string;
  url: string;
  dates: { start: { dateTime?: string; localDate?: string } };
  priceRanges?: { min: number; max: number; currency: string }[];
  _embedded?: {
    venues?: {
      id: string;
      name: string;
      city?: { name: string };
      country?: { name: string };
      location?: { latitude: string; longitude: string };
    }[];
    attractions?: {
      id: string;
      name: string;
      images?: { url: string }[];
      classifications?: {
        segment?: { name: string };
        genre?: { name: string };
        subGenre?: { name: string };
        type?: { name: string };
        subType?: { name: string };
      }[];
    }[];
  };
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const newConcertIds: string[] = [];

  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const staleSince = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const { data: allBands, error: bandsError } = await admin
      .from('user_bands')
      .select('band:bands!inner(id, name, ticketmaster_id, last_concerts_sync_at)');

    if (bandsError) throw bandsError;

    const uniqueBands = new Map<
      string,
      {
        id: string;
        name: string;
        ticketmaster_id: string | null;
        last_concerts_sync_at: string | null;
      }
    >();
    for (const ub of allBands ?? []) {
      const b: any = (ub as any).band;
      if (b?.id && !uniqueBands.has(b.id)) {
        uniqueBands.set(b.id, b);
      }
    }

    let totalSynced = 0;
    let totalDiscarded = 0;
    let bandsSkipped = 0;
    let bandsProcessed = 0;
    let attractionsSkipped = 0;

    for (const band of uniqueBands.values()) {
      if (band.last_concerts_sync_at && band.last_concerts_sync_at > staleSince) {
        bandsSkipped++;
        continue;
      }

      bandsProcessed++;

      try {
        let attractionId: string | null = band.ticketmaster_id;

        if (!attractionId) {
          const attrUrl =
            `https://app.ticketmaster.com/discovery/v2/attractions.json?` +
            `keyword=${encodeURIComponent(band.name)}` +
            `&classificationName=music&size=5` +
            `&apikey=${TICKETMASTER_API_KEY}`;

          const attrRes = await fetch(attrUrl);
          if (!attrRes.ok) continue;

          const attrData = await attrRes.json();
          const attractions = attrData._embedded?.attractions ?? [];

          const target = normalizeName(band.name);
          let matched = attractions.find((a: any) => normalizeName(a.name) === target);
          if (!matched) {
            matched = attractions.find((a: any) => {
              const candidate = normalizeName(a.name);
              return candidate.includes(target) || target.includes(candidate);
            });
          }

          if (!matched) {
            await admin
              .from('bands')
              .update({ last_concerts_sync_at: new Date().toISOString() })
              .eq('id', band.id);
            continue;
          }
          attractionId = matched.id;
          await admin.from('bands').update({ ticketmaster_id: attractionId }).eq('id', band.id);
        }

        const tmUrl =
          `https://app.ticketmaster.com/discovery/v2/events.json?` +
          `attractionId=${attractionId}` +
          `&size=20&sort=date,asc` +
          `&apikey=${TICKETMASTER_API_KEY}`;

        const tmRes = await fetch(tmUrl);
        if (!tmRes.ok) continue;

        const tmData = await tmRes.json();
        const events: TmEvent[] = tmData._embedded?.events ?? [];

        for (const ev of events) {
          if (TRIBUTE_KEYWORDS.test(ev.name) || VIP_KEYWORDS.test(ev.name)) {
            totalDiscarded++;
            continue;
          }

          const venue = ev._embedded?.venues?.[0];
          if (!venue) continue;

          const eventDate = ev.dates.start.dateTime ?? ev.dates.start.localDate;
          if (!eventDate) continue;

          const declaredCountry = normalizeCountry(venue.country?.name);
          let lat: number | null = venue.location ? parseFloat(venue.location.latitude) : null;
          let lng: number | null = venue.location ? parseFloat(venue.location.longitude) : null;

          let needsForwardGeocode = false;
          if (lat != null && lng != null && declaredCountry) {
            const realCountry = await reverseGeocode(lat, lng);
            await sleep(1100);
            if (realCountry && realCountry !== declaredCountry) {
              needsForwardGeocode = true;
            }
          } else if (lat == null || lng == null) {
            needsForwardGeocode = true;
          }

          if (needsForwardGeocode) {
            const query = [venue.name, venue.city?.name, venue.country?.name]
              .filter(Boolean)
              .join(', ');
            const geo = await forwardGeocode(query);
            await sleep(1100);
            if (!geo) {
              totalDiscarded++;
              continue;
            }
            lat = geo.lat;
            lng = geo.lng;
          }

          if (lat == null || lng == null) {
            totalDiscarded++;
            continue;
          }

          const { data: venueRow } = await admin
            .from('venues')
            .upsert(
              {
                ticketmaster_id: venue.id,
                name: venue.name,
                city: venue.city?.name,
                country: venue.country?.name,
                lat,
                lng,
              },
              { onConflict: 'ticketmaster_id' },
            )
            .select('id')
            .single();

          if (!venueRow) continue;

          const priceRange = ev.priceRanges?.[0];
          const { data: existing } = await admin
            .from('concerts')
            .select('id')
            .eq('ticketmaster_id', ev.id)
            .maybeSingle();

          const { data: concertRow } = await admin
            .from('concerts')
            .upsert(
              {
                ticketmaster_id: ev.id,
                venue_id: venueRow.id,
                event_date: eventDate,
                ticket_url: ev.url,
                price_min: priceRange?.min ?? null,
                price_max: priceRange?.max ?? null,
                currency: priceRange?.currency ?? null,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: 'ticketmaster_id' },
            )
            .select('id')
            .single();

          if (!concertRow) continue;

          if (!existing) {
            newConcertIds.push(concertRow.id);
          }

          const attractions = ev._embedded?.attractions ?? [];

          if (attractions.length === 0) {
            await admin
              .from('concert_bands')
              .upsert(
                { concert_id: concertRow.id, band_id: band.id, is_headliner: true },
                { onConflict: 'concert_id,band_id' },
              );
          } else {
            for (let idx = 0; idx < attractions.length; idx++) {
              const attr = attractions[idx];

              if (!isRealBand(attr)) {
                console.log(
                  `[skip-attraction] "${attr.name}" type=${attr.classifications?.[0]?.type?.name}`,
                );
                attractionsSkipped++;
                continue;
              }

              const { data: existingBand } = await admin
                .from('bands')
                .select('id')
                .or(`ticketmaster_id.eq.${attr.id},name.ilike.${attr.name.replace(/,/g, '')}`)
                .limit(1)
                .maybeSingle();

              let bandIdInDb = existingBand?.id;

              if (!bandIdInDb) {
                const imageUrl = attr.images?.[0]?.url ?? null;
                const { data: newBand } = await admin
                  .from('bands')
                  .upsert(
                    {
                      name: attr.name,
                      ticketmaster_id: attr.id,
                      image_url: imageUrl,
                    },
                    { onConflict: 'ticketmaster_id' },
                  )
                  .select('id')
                  .single();
                bandIdInDb = newBand?.id;
              }

              if (bandIdInDb) {
                await admin.from('concert_bands').upsert(
                  {
                    concert_id: concertRow.id,
                    band_id: bandIdInDb,
                    is_headliner: idx === 0,
                  },
                  { onConflict: 'concert_id,band_id' },
                );
              }
            }
          }

          totalSynced++;
        }

        await admin
          .from('bands')
          .update({ last_concerts_sync_at: new Date().toISOString() })
          .eq('id', band.id);
      } catch (err) {
        console.warn(`Error processing band ${band.name}:`, err);
      }
    }

    let pushResults = null;
    if (newConcertIds.length > 0) {
      try {
        const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ concertIds: newConcertIds }),
        });
        pushResults = await pushRes.json();
      } catch (err) {
        console.warn('Error invocando send-push:', (err as Error).message);
      }
    }

    return new Response(
      JSON.stringify({
        synced: totalSynced,
        discarded: totalDiscarded,
        attractions_skipped: attractionsSkipped,
        bands_total: uniqueBands.size,
        bands_processed: bandsProcessed,
        bands_skipped: bandsSkipped,
        new_concerts: newConcertIds.length,
        push: pushResults,
        timestamp: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
