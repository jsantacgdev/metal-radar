import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
};

const TRIBUTE_KEYWORDS =
  /\b(tribute|tributo|homenaje|cover|vs\.?|versus|experience|story of|by candlelight|reimagined|symphonic)\b/i;

const VIP_KEYWORDS = /\b(vip packages?|paquetes? vip|hospitality|meet [&y] greet)\b/i;

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
    }[];
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const staleSince = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const { data: userBands, error: ubError } = await admin
      .from('user_bands')
      .select('band_id, bands(id, name, spotify_id, ticketmaster_id, last_concerts_sync_at)')
      .eq('user_id', user.id);

    if (ubError) throw ubError;
    if (!userBands || userBands.length === 0) {
      return new Response(JSON.stringify({ synced: 0, discarded: 0, bands: 0, bands_skipped: 0 }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let totalConcerts = 0;
    let discardedConcerts = 0;
    let bandsSkipped = 0;
    let bandsProcessed = 0;

    for (const ub of userBands) {
      const band = (ub as any).bands;
      if (!band?.name) continue;

      // Saltar si se sincronizó recientemente
      if (band.last_concerts_sync_at && band.last_concerts_sync_at > staleSince) {
        bandsSkipped++;
        continue;
      }

      bandsProcessed++;

      try {
        // 1. Conseguir attractionId
        let attractionId: string | null = band.ticketmaster_id;

        if (!attractionId) {
          const attrUrl =
            `https://app.ticketmaster.com/discovery/v2/attractions.json?` +
            `keyword=${encodeURIComponent(band.name)}` +
            `&classificationName=music&size=5` +
            `&apikey=${TICKETMASTER_API_KEY}`;

          const attrRes = await fetch(attrUrl);
          if (!attrRes.ok) {
            console.warn(`Ticketmaster attractions error for ${band.name}: ${attrRes.status}`);
            continue;
          }

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
            console.warn(`No attraction match for "${band.name}", skipping`);
            // Marcamos como sincronizada para no reintentar cada vez
            await admin
              .from('bands')
              .update({ last_concerts_sync_at: new Date().toISOString() })
              .eq('id', band.id);
            continue;
          }

          attractionId = matched.id;
          await admin.from('bands').update({ ticketmaster_id: attractionId }).eq('id', band.id);
        }

        // 2. Eventos por attractionId
        const tmUrl =
          `https://app.ticketmaster.com/discovery/v2/events.json?` +
          `attractionId=${attractionId}` +
          `&size=20&sort=date,asc` +
          `&apikey=${TICKETMASTER_API_KEY}`;

        const tmRes = await fetch(tmUrl);
        if (!tmRes.ok) {
          console.warn(`Ticketmaster events error for ${band.name}: ${tmRes.status}`);
          continue;
        }

        const tmData = await tmRes.json();
        const events: TmEvent[] = tmData._embedded?.events ?? [];

        for (const ev of events) {
          if (TRIBUTE_KEYWORDS.test(ev.name) || VIP_KEYWORDS.test(ev.name)) {
            discardedConcerts++;
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
              discardedConcerts++;
              continue;
            }
            lat = geo.lat;
            lng = geo.lng;
          }

          if (lat == null || lng == null) {
            discardedConcerts++;
            continue;
          }

          const { data: venueRow, error: venueError } = await admin
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

          if (venueError || !venueRow) {
            console.warn('Venue upsert error:', venueError?.message);
            continue;
          }

          const priceRange = ev.priceRanges?.[0];
          const { data: concertRow, error: concertError } = await admin
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

          if (concertError || !concertRow) {
            console.warn('Concert upsert error:', concertError?.message);
            continue;
          }

          // Guardar TODAS las attractions del evento como bandas del cartel
          const attractions = ev._embedded?.attractions ?? [];

          if (attractions.length === 0) {
            // Fallback: si no hay attractions, al menos asociamos la banda que sincronizamos
            await admin
              .from('concert_bands')
              .upsert(
                { concert_id: concertRow.id, band_id: band.id, is_headliner: true },
                { onConflict: 'concert_id,band_id' },
              );
          } else {
            for (let idx = 0; idx < attractions.length; idx++) {
              const attr = attractions[idx];
              if (!attr.name) continue;

              // Buscar o crear banda en BD
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

          totalConcerts++;
        }

        // Marcar banda como sincronizada
        await admin
          .from('bands')
          .update({ last_concerts_sync_at: new Date().toISOString() })
          .eq('id', band.id);
      } catch (err) {
        console.warn(`Error processing band ${band.name}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        synced: totalConcerts,
        discarded: discardedConcerts,
        bands: userBands.length,
        bands_processed: bandsProcessed,
        bands_skipped: bandsSkipped,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
