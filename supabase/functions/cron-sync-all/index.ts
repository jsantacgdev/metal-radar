import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: tu@email.com)',
};

const TRIBUTE_KEYWORDS =
  /\b(tribute|tributo|homenaje|cover|vs\.?|versus|experience|story of|by candlelight|reimagined|symphonic)\b/i;

const VIP_KEYWORDS = /\b(vip packages?|paquetes? vip|hospitality|meet [&y] greet)\b/i;

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
  };
};

Deno.serve(async (req) => {
  // Validar que la petición viene del cron y no de fuera
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obtener TODAS las bandas seguidas por al menos un usuario (deduplicadas)
    const { data: allBands, error: bandsError } = await admin
      .from('user_bands')
      .select('band:bands!inner(id, name, ticketmaster_id)');

    if (bandsError) throw bandsError;

    const uniqueBands = new Map<
      string,
      { id: string; name: string; ticketmaster_id: string | null }
    >();
    for (const ub of allBands ?? []) {
      const b: any = (ub as any).band;
      if (b?.id && !uniqueBands.has(b.id)) {
        uniqueBands.set(b.id, b);
      }
    }

    let totalSynced = 0;
    let totalDiscarded = 0;

    // 2. Por cada banda única, sincronizar conciertos
    for (const band of uniqueBands.values()) {
      try {
        // Conseguir attractionId (cacheado o nuevo)
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

          if (!matched) continue;
          attractionId = matched.id;

          await admin.from('bands').update({ ticketmaster_id: attractionId }).eq('id', band.id);
        }

        // Eventos por attractionId
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

          await admin.from('concert_bands').upsert(
            {
              concert_id: concertRow.id,
              band_id: band.id,
              is_headliner: true,
            },
            { onConflict: 'concert_id,band_id' },
          );

          totalSynced++;
        }
      } catch (err) {
        console.warn(`Error processing band ${band.name}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        synced: totalSynced,
        discarded: totalDiscarded,
        bands_processed: uniqueBands.size,
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
