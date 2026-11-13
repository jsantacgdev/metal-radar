import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Conciertos de metal de Ticketmaster en 18 países europeos, sigas o no a la
// banda (descubrimiento; el mapa los muestra con el filtro "Todos").
// cron-sync-all solo trae los de las bandas seguidas.
//
// Cada ejecución procesa una página de 50 eventos de un país (los países en
// curso primero, luego el que lleve más tiempo sin completarse) y guarda el
// avance en ticketmaster_europe_sync. La página solo avanza si se procesó
// entera: si se corta por tiempo, se repite y los conciertos ya guardados se
// reconocen al instante. Duplicados con otras fuentes: find_matching_concert.
// Programada con pg_cron (supabase/scripts/schedule-sync-ticketmaster-europe.sql).

const TICKETMASTER_API_KEY = Deno.env.get('TICKETMASTER_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const NOMINATIM_HEADERS = {
  'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)',
};

// Clasificación de Ticketmaster. 'hard rock' añadiría ~400 eventos más.
const CLASSIFICATION = 'metal';
const PAGE_SIZE = 50;
// Ticketmaster no deja paginar más allá de 1000 resultados.
const MAX_PAGE = Math.floor(1000 / PAGE_SIZE) - 1;
const MAX_PAGES_PER_RUN = 3;
// 2 s de CPU y 150 s por petición: no se empieza un evento nuevo pasado esto.
const TIME_BUDGET_MS = 90_000;

const TRIBUTE_KEYWORDS =
  /\b(tribute|tributo|homenaje|cover|vs\.?|versus|experience|story of|by candlelight|reimagined|symphonic)\b/i;

const VIP_KEYWORDS = /\b(vip packages?|paquetes? vip|hospitality|meet [&y] greet)\b/i;

const NON_BAND_NAME =
  /\b(festival|fest\b|bluesfest|tour|experience|tributo|tribute|concert\s+series|hospitality|vip|stage|ticketmaster\s+suite|ball\s+arena|club\s+level)\b/i;

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

// Caché de recintos: ticketmaster_id → venues.id (null = su geocodificación ya
// falló en esta ejecución). Igual que en cron-sync-all.
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
    console.warn('No se pudo cargar la caché de venues:', error.message);
    return;
  }
  for (const v of data ?? []) cache.set(v.ticketmaster_id, v.id);
}

// Venue del evento: de la caché o creado (validando el país de Ticketmaster
// con Nominatim, como cron-sync-all). null = no se pudo ubicar.
async function resolveVenue(
  admin: any,
  venue: NonNullable<NonNullable<TmEvent['_embedded']>['venues']>[number],
  cache: VenueCache,
  stats: { venues_cached: number; venues_geocoded: number },
): Promise<string | null> {
  const cached = cache.get(venue.id);
  if (cached === null) return null;
  if (cached) {
    stats.venues_cached++;
    return cached;
  }

  stats.venues_geocoded++;
  const declaredCountry = normalizeCountry(venue.country?.name);
  let lat: number | null = venue.location ? parseFloat(venue.location.latitude) : null;
  let lng: number | null = venue.location ? parseFloat(venue.location.longitude) : null;

  let needsForwardGeocode = false;
  if (lat != null && lng != null && declaredCountry) {
    const realCountry = await reverseGeocode(lat, lng);
    await sleep(1100);
    if (realCountry && realCountry !== declaredCountry) needsForwardGeocode = true;
  } else if (lat == null || lng == null) {
    needsForwardGeocode = true;
  }

  if (needsForwardGeocode) {
    const query = [venue.name, venue.city?.name, venue.country?.name].filter(Boolean).join(', ');
    const geo = await forwardGeocode(query);
    await sleep(1100);
    if (!geo) {
      cache.set(venue.id, null);
      return null;
    }
    lat = geo.lat;
    lng = geo.lng;
  }
  if (lat == null || lng == null) {
    cache.set(venue.id, null);
    return null;
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
  if (!venueRow) return null;
  cache.set(venue.id, venueRow.id);
  return venueRow.id;
}

function isRealBand(attr: any): boolean {
  if (!attr.name) return false;
  if (NON_BAND_NAME.test(attr.name)) return false;
  const cls = attr.classifications?.[0];
  if (!cls) return true;
  if (cls.segment?.name && cls.segment.name !== 'Music') return false;
  if (cls.subType?.name === 'Festival') return false;
  if (cls.type?.name === 'Event Style') {
    return !!cls.genre?.name && cls.genre.name !== 'Undefined';
  }
  return true;
}

// Banda de la BD para un artista de Ticketmaster (la crea si no existe).
async function resolveBand(admin: any, attr: any): Promise<string | null> {
  const { data: existingBand } = await admin
    .from('bands')
    .select('id')
    .or(`ticketmaster_id.eq.${attr.id},name.ilike.${String(attr.name).replace(/,/g, '')}`)
    .limit(1)
    .maybeSingle();
  if (existingBand?.id) return existingBand.id;

  const { data: newBand } = await admin
    .from('bands')
    .upsert(
      { name: attr.name, ticketmaster_id: attr.id, image_url: attr.images?.[0]?.url ?? null },
      { onConflict: 'ticketmaster_id' },
    )
    .select('id')
    .single();
  return newBand?.id ?? null;
}

// Igual que en cron-sync-all/sync-band/sync-concerts: no duplicar un concierto
// que ya existe por otra fuente (find_matching_concert).
async function upsertTicketmasterConcert(
  admin: any,
  ev: TmEvent,
  bandIds: string[],
  row: Record<string, unknown>,
): Promise<{ id: string; isNew: boolean; merged?: boolean } | null> {
  const { data: existing } = await admin
    .from('concerts')
    .select('id')
    .eq('ticketmaster_id', ev.id)
    .maybeSingle();
  if (existing) {
    await admin.from('concerts').update(row).eq('id', existing.id);
    return { id: existing.id, isNew: false };
  }

  const venue = ev._embedded?.venues?.[0];
  const lat = venue?.location ? parseFloat(venue.location.latitude) : NaN;
  const lng = venue?.location ? parseFloat(venue.location.longitude) : NaN;
  const { data: matches } = await admin.rpc('find_matching_concert', {
    p_band_ids: bandIds,
    p_event_date: row.event_date,
    p_lat: Number.isFinite(lat) ? lat : null,
    p_lng: Number.isFinite(lng) ? lng : null,
    p_city: venue?.city?.name ?? null,
  });
  const match = matches?.[0];
  if (match) {
    if (!match.ticketmaster_id) {
      await admin
        .from('concerts')
        .update({ ...row, ticketmaster_id: ev.id })
        .eq('id', match.id);
    }
    return { id: match.id, isNew: false, merged: true };
  }

  const { data: inserted } = await admin
    .from('concerts')
    .insert({ ...row, ticketmaster_id: ev.id, source: 'ticketmaster' })
    .select('id')
    .single();
  return inserted ? { id: inserted.id, isNew: true } : null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > TIME_BUDGET_MS;

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: states, error: stErr } = await admin
      .from('ticketmaster_europe_sync')
      .select('country_code, next_page, last_full_sync_at');
    if (stErr) throw stErr;
    // Primero los países a medias; luego el que lleve más tiempo sin completarse.
    const queue = [...(states ?? [])].sort(
      (a: any, b: any) =>
        Number(b.next_page > 0) - Number(a.next_page > 0) ||
        (a.last_full_sync_at ?? '').localeCompare(b.last_full_sync_at ?? ''),
    );

    const stats = {
      pages: [] as string[],
      events_seen: 0,
      synced: 0,
      discarded: 0,
      new_concerts: 0,
      duplicates_linked: 0,
      venues_cached: 0,
      venues_geocoded: 0,
      stopped_by_time_budget: false,
      push: null as unknown,
    };
    const knownVenues: VenueCache = new Map();
    const newConcertIds: string[] = [];
    // Ticketmaster exige el formato sin milisegundos.
    const startDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    for (const state of queue) {
      if (stats.pages.length >= MAX_PAGES_PER_RUN || outOfTime()) break;
      const page = Math.min(state.next_page ?? 0, MAX_PAGE);

      const tmUrl =
        `https://app.ticketmaster.com/discovery/v2/events.json?` +
        `classificationName=${encodeURIComponent(CLASSIFICATION)}` +
        `&countryCode=${state.country_code}` +
        `&startDateTime=${startDateTime}` +
        `&size=${PAGE_SIZE}&page=${page}&sort=date,asc` +
        `&apikey=${TICKETMASTER_API_KEY}`;
      const tmRes = await fetch(tmUrl);
      if (!tmRes.ok) {
        stats.pages.push(`${state.country_code}#${page}: HTTP ${tmRes.status}`);
        continue;
      }
      const tmData = await tmRes.json();
      const events: TmEvent[] = tmData._embedded?.events ?? [];
      const totalPages: number = tmData.page?.totalPages ?? 0;
      stats.events_seen += events.length;
      await loadKnownVenues(admin, events, knownVenues);

      let completed = true;
      for (const ev of events) {
        if (outOfTime()) {
          completed = false;
          stats.stopped_by_time_budget = true;
          break;
        }
        if (TRIBUTE_KEYWORDS.test(ev.name) || VIP_KEYWORDS.test(ev.name)) {
          stats.discarded++;
          continue;
        }
        const venue = ev._embedded?.venues?.[0];
        const eventDate = ev.dates.start.dateTime ?? ev.dates.start.localDate;
        const attractions = (ev._embedded?.attractions ?? []).filter(isRealBand);
        // Sin banda reconocible no se puede enlazar a nada.
        if (!venue || !eventDate || attractions.length === 0) {
          stats.discarded++;
          continue;
        }

        try {
          const venueId = await resolveVenue(admin, venue, knownVenues, stats);
          if (!venueId) {
            stats.discarded++;
            continue;
          }

          const bandIds: string[] = [];
          for (const attr of attractions) {
            const id = await resolveBand(admin, attr);
            if (id && !bandIds.includes(id)) bandIds.push(id);
          }
          if (bandIds.length === 0) {
            stats.discarded++;
            continue;
          }

          const priceRange = ev.priceRanges?.[0];
          const concert = await upsertTicketmasterConcert(admin, ev, bandIds, {
            venue_id: venueId,
            event_date: eventDate,
            ticket_url: ev.url,
            price_min: priceRange?.min ?? null,
            price_max: priceRange?.max ?? null,
            currency: priceRange?.currency ?? null,
            last_synced_at: new Date().toISOString(),
          });
          if (!concert) {
            stats.discarded++;
            continue;
          }
          if (concert.isNew) {
            newConcertIds.push(concert.id);
            stats.new_concerts++;
          }
          if (concert.merged) stats.duplicates_linked++;

          for (let idx = 0; idx < bandIds.length; idx++) {
            await admin
              .from('concert_bands')
              .upsert(
                { concert_id: concert.id, band_id: bandIds[idx], is_headliner: idx === 0 },
                { onConflict: 'concert_id,band_id', ignoreDuplicates: !concert.isNew },
              );
          }
          stats.synced++;
        } catch (err) {
          console.warn(`Error con el evento ${ev.id}:`, (err as Error).message);
        }
      }

      stats.pages.push(`${state.country_code}#${page}/${Math.max(totalPages, 1)}`);
      if (completed) {
        const isLast = page + 1 >= totalPages || page + 1 > MAX_PAGE;
        await admin
          .from('ticketmaster_europe_sync')
          .update(
            isLast
              ? { next_page: 0, last_full_sync_at: new Date().toISOString() }
              : { next_page: page + 1 },
          )
          .eq('country_code', state.country_code);
      }
    }

    // Avisos de conciertos nuevos: send-push decide a quién (seguidores de la
    // banda, según su radio), así que no hay avisos de bandas que no sigues.
    if (newConcertIds.length > 0) {
      try {
        const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ concertIds: newConcertIds }),
        });
        stats.push = await pushRes.json();
      } catch (err) {
        console.warn('Error invocando send-push:', (err as Error).message);
      }
    }

    return json(stats);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
