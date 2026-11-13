import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const unauthorized = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
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

function extractTourName(eventName: string, attractionName: string): string | null {
  if (!eventName || !attractionName) return null;

  const eventLower = eventName.toLowerCase().trim();
  const artistLower = attractionName.toLowerCase().trim();

  if (!eventLower.startsWith(artistLower)) return null;

  const rest = eventName.slice(attractionName.length).trimStart();
  const separators = [' - ', ' – ', ' — ', ': ', '- ', '– ', '— ', ':'];

  for (const sep of separators) {
    if (rest.startsWith(sep)) {
      const tour = rest.slice(sep.length).trim();
      return tour.length > 0 ? tour : null;
    }
  }

  if (rest.length > 0 && rest !== eventName) {
    return rest;
  }
  return null;
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

// Caché de recintos para no repetir Nominatim: ticketmaster_id → venues.id
// (null = su geocodificación ya falló en esta ejecución). Las coordenadas
// guardadas ya pasaron la validación de país al crearse, así que un recinto
// conocido no se vuelve a geocodificar en cada sincronización.
type VenueCache = Map<string, string | null>;

async function loadKnownVenues(admin: any, events: TmEvent[], cache: VenueCache) {
  const ids = [
    ...new Set(
      events
        .map((ev) => ev._embedded?.venues?.[0]?.id)
        .filter((id): id is string => !!id && !cache.has(id)),
    ),
  ];
  if (ids.length === 0) return;

  const { data, error } = await admin
    .from('venues')
    .select('id, ticketmaster_id')
    .in('ticketmaster_id', ids)
    .not('lat', 'is', null)
    .not('lng', 'is', null);
  if (error) {
    // Sin caché se geocodifica como antes: más lento, pero la sincronización sigue.
    console.warn('No se pudo cargar la caché de venues:', error.message);
    return;
  }
  for (const v of data ?? []) cache.set(v.ticketmaster_id, v.id);
}

type TmAttraction = {
  id: string;
  name: string;
  images?: { url: string }[];
  externalLinks?: {
    musicbrainz?: { id: string; url?: string }[];
    spotify?: { url: string }[];
  };
};

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
    attractions?: TmAttraction[];
  };
};

async function inferLineupFromTour(
  admin: any,
  concertId: string,
  tourName: string,
): Promise<number> {
  const { data: referenceConcerts } = await admin
    .from('concerts')
    .select(
      `
      id,
      concert_bands ( band_id, is_headliner )
    `,
    )
    .eq('tour_name', tourName)
    .neq('id', concertId)
    .order('last_synced_at', { ascending: false })
    .limit(10);

  if (!referenceConcerts || referenceConcerts.length === 0) return 0;

  const reference = (referenceConcerts as any[]).find((c) => (c.concert_bands ?? []).length > 1);
  if (!reference) return 0;

  const refBands = (reference.concert_bands ?? []) as {
    band_id: string;
    is_headliner: boolean;
  }[];

  const { data: existing } = await admin
    .from('concert_bands')
    .select('band_id')
    .eq('concert_id', concertId);

  const existingIds = new Set((existing ?? []).map((r: any) => r.band_id));

  let added = 0;
  for (const rb of refBands) {
    if (existingIds.has(rb.band_id)) continue;
    const { error } = await admin.from('concert_bands').upsert(
      {
        concert_id: concertId,
        band_id: rb.band_id,
        is_headliner: false,
      },
      { onConflict: 'concert_id,band_id', ignoreDuplicates: true },
    );
    if (!error) added++;
  }

  return added;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return unauthorized();

    const { band_id, force } = await req.json();
    if (!band_id) throw new Error('Falta band_id');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: ub } = await admin
      .from('user_bands')
      .select('band:bands(id, name, ticketmaster_id, last_concerts_sync_at)')
      .eq('user_id', user.id)
      .eq('band_id', band_id)
      .maybeSingle();

    const band: any = (ub as any)?.band;
    if (!band) throw new Error('Banda no encontrada o no seguida por el usuario');

    const STALE_HOURS = 12;
    const staleSince = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();
    if (!force && band.last_concerts_sync_at && band.last_concerts_sync_at > staleSince) {
      return new Response(
        JSON.stringify({ synced: 0, discarded: 0, skipped: true, band: band.name }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    let synced = 0;
    let discarded = 0;
    let inferredLineups = 0;
    let venuesCached = 0;
    let venuesGeocoded = 0;

    let attractionId: string | null = band.ticketmaster_id;

    if (!attractionId) {
      const attrUrl =
        `https://app.ticketmaster.com/discovery/v2/attractions.json?` +
        `keyword=${encodeURIComponent(band.name)}` +
        `&classificationName=music&size=5` +
        `&apikey=${TICKETMASTER_API_KEY}`;

      const attrRes = await fetch(attrUrl);
      if (!attrRes.ok) {
        return new Response(
          JSON.stringify({ synced: 0, discarded: 0, reason: 'attractions_error' }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
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
        await admin
          .from('bands')
          .update({ last_concerts_sync_at: new Date().toISOString() })
          .eq('id', band.id);

        return new Response(JSON.stringify({ synced: 0, discarded: 0, reason: 'no_match' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      attractionId = matched.id;
      const matchedMbid: string | null = matched.externalLinks?.musicbrainz?.[0]?.id ?? null;

      const updatePayload: Record<string, unknown> = { ticketmaster_id: attractionId };
      if (matchedMbid) updatePayload.musicbrainz_mbid = matchedMbid;

      await admin.from('bands').update(updatePayload).eq('id', band.id);
    }

    const tmUrl =
      `https://app.ticketmaster.com/discovery/v2/events.json?` +
      `attractionId=${attractionId}` +
      `&size=20&sort=date,asc` +
      `&apikey=${TICKETMASTER_API_KEY}`;

    const tmRes = await fetch(tmUrl);
    if (!tmRes.ok) {
      return new Response(JSON.stringify({ synced: 0, discarded: 0, reason: 'events_error' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const tmData = await tmRes.json();
    const events: TmEvent[] = tmData._embedded?.events ?? [];
    const knownVenues: VenueCache = new Map();
    await loadKnownVenues(admin, events, knownVenues);

    for (const ev of events) {
      if (TRIBUTE_KEYWORDS.test(ev.name) || VIP_KEYWORDS.test(ev.name)) {
        discarded++;
        continue;
      }

      const venue = ev._embedded?.venues?.[0];
      if (!venue) continue;

      const eventDate = ev.dates.start.dateTime ?? ev.dates.start.localDate;
      if (!eventDate) continue;

      const headlinerName = ev._embedded?.attractions?.[0]?.name ?? band.name;
      const tourName = extractTourName(ev.name, headlinerName);

      const cachedVenueId = knownVenues.get(venue.id);
      if (cachedVenueId === null) {
        discarded++;
        continue;
      }

      let venueId: string;
      if (cachedVenueId) {
        venueId = cachedVenueId;
        venuesCached++;
      } else {
        venuesGeocoded++;
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
            knownVenues.set(venue.id, null);
            discarded++;
            continue;
          }
          lat = geo.lat;
          lng = geo.lng;
        }

        if (lat == null || lng == null) {
          knownVenues.set(venue.id, null);
          discarded++;
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
        venueId = venueRow.id;
        knownVenues.set(venue.id, venueId);
      }

      const priceRange = ev.priceRanges?.[0];
      const { data: concertRow } = await admin
        .from('concerts')
        .upsert(
          {
            ticketmaster_id: ev.id,
            venue_id: venueId,
            event_date: eventDate,
            ticket_url: ev.url,
            price_min: priceRange?.min ?? null,
            price_max: priceRange?.max ?? null,
            currency: priceRange?.currency ?? null,
            tour_name: tourName,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'ticketmaster_id' },
        )
        .select('id')
        .single();

      if (!concertRow) continue;

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
          if (!attr.name) continue;

          const attrMbid: string | null = attr.externalLinks?.musicbrainz?.[0]?.id ?? null;

          const { data: existingBand } = await admin
            .from('bands')
            .select('id, musicbrainz_mbid')
            .or(`ticketmaster_id.eq.${attr.id},name.ilike.${attr.name.replace(/,/g, '')}`)
            .limit(1)
            .maybeSingle();

          let bandIdInDb = existingBand?.id;

          if (!bandIdInDb) {
            const imageUrl = attr.images?.[0]?.url ?? null;
            const insertPayload: Record<string, unknown> = {
              name: attr.name,
              ticketmaster_id: attr.id,
              image_url: imageUrl,
            };
            if (attrMbid) insertPayload.musicbrainz_mbid = attrMbid;

            const { data: newBand } = await admin
              .from('bands')
              .upsert(insertPayload, { onConflict: 'ticketmaster_id' })
              .select('id')
              .single();
            bandIdInDb = newBand?.id;
          } else if (attrMbid && !existingBand?.musicbrainz_mbid) {
            await admin.from('bands').update({ musicbrainz_mbid: attrMbid }).eq('id', bandIdInDb);
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

      if (tourName && attractions.length <= 1) {
        const added = await inferLineupFromTour(admin, concertRow.id, tourName);
        if (added > 0) {
          inferredLineups++;
          console.log(
            `[sync-band] inferred ${added} bands for concert ${concertRow.id} (tour: ${tourName})`,
          );
        }
      }

      synced++;
    }

    await admin
      .from('bands')
      .update({ last_concerts_sync_at: new Date().toISOString() })
      .eq('id', band.id);

    return new Response(
      JSON.stringify({
        synced,
        discarded,
        inferredLineups,
        venues_cached: venuesCached,
        venues_geocoded: venuesGeocoded,
        band: band.name,
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
