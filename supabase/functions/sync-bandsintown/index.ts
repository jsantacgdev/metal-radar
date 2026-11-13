import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Conciertos en Europa de las bandas SEGUIDAS, leídos de su página pública de
// Bandsintown (los datos estructurados schema.org MusicEvent que la página
// publica). Uso personal, a bajo volumen: cada banda como mucho una vez al día.
//
//   * Artista de Bandsintown: se saca de los enlaces de MusicBrainz
//     (bands.musicbrainz_mbid), sin usar el buscador de Bandsintown.
//   * Se pide la página con un User-Agent identificable y sin esquivar
//     ninguna protección: si responde con un bloqueo (403/429/503 o página de
//     comprobación), la ejecución se para y lo indica en la respuesta.
//   * Se omiten las actuaciones en festivales (los festivales se cargan a mano
//     con su cartel) y lo que esté fuera de Europa.
//   * Duplicados con Ticketmaster/manuales: find_matching_concert.
// Programada con pg_cron (supabase/scripts/schedule-sync-bandsintown.sql).
//
// Parámetro opcional (pruebas): ?band_id=<uuid> para procesar solo esa banda.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const USER_AGENT = 'MetalRadar/1.0 (uso personal; contacto: jsantacgdev@gmail.com)';
const MAX_BANDS_PER_RUN = 10;
const TIME_BUDGET_MS = 90_000;
const RESYNC_HOURS = 24;
const MUSICBRAINZ_RECHECK_DAYS = 30;
// Europa (aprox.): de Canarias/Azores a Escandinavia y de Islandia a Georgia.
const EUROPE = { minLat: 27, maxLat: 72, minLng: -32, maxLng: 45 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------ zonas horarias

// Bandsintown da la hora LOCAL sin zona. Desfase estándar respecto a UTC de los
// países europeos que no usan la hora central (CET, +1); el resto, +1.
const ZONE_OFFSET: Record<string, number> = {
  GB: 0,
  IE: 0,
  PT: 0,
  IS: 0,
  FO: 0,
  FI: 2,
  EE: 2,
  LV: 2,
  LT: 2,
  RO: 2,
  BG: 2,
  GR: 2,
  CY: 2,
  UA: 2,
  MD: 2,
  TR: 3,
  BY: 3,
  RU: 3,
  GE: 4,
  AM: 4,
  AZ: 4,
};
const NO_DST = new Set(['IS', 'TR', 'BY', 'RU', 'GE', 'AM', 'AZ']);

// Para recintos ya guardados con el nombre del país (Ticketmaster: "Spain").
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united kingdom': 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'reino unido': 'GB',
  ireland: 'IE',
  irlanda: 'IE',
  portugal: 'PT',
  iceland: 'IS',
  islandia: 'IS',
  finland: 'FI',
  finlandia: 'FI',
  estonia: 'EE',
  latvia: 'LV',
  letonia: 'LV',
  lithuania: 'LT',
  lituania: 'LT',
  romania: 'RO',
  rumania: 'RO',
  bulgaria: 'BG',
  greece: 'GR',
  grecia: 'GR',
  cyprus: 'CY',
  chipre: 'CY',
  ukraine: 'UA',
  ucrania: 'UA',
  moldova: 'MD',
  turkey: 'TR',
  turkiye: 'TR',
  turquia: 'TR',
  belarus: 'BY',
  russia: 'RU',
  rusia: 'RU',
  georgia: 'GE',
  armenia: 'AM',
  azerbaijan: 'AZ',
};

function countryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const c = country.trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return COUNTRY_NAME_TO_CODE[normalizeName(c)] ?? null;
}

// Último domingo de un mes (UTC).
function lastSunday(year: number, month0: number): number {
  const d = new Date(Date.UTC(year, month0 + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

// Hora local de Bandsintown → ISO UTC, con el horario de verano europeo
// (último domingo de marzo a último domingo de octubre, a la 01:00 UTC).
function localToUtc(local: string, cc: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(
    Number,
  );
  const base = cc && cc in ZONE_OFFSET ? ZONE_OFFSET[cc] : 1;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset = base;
  if (!cc || !NO_DST.has(cc)) {
    const approxUtc = asUtc - base * 3_600_000;
    const dstStart = lastSunday(y, 2) + 3_600_000;
    const dstEnd = lastSunday(y, 9) + 3_600_000;
    if (approxUtc >= dstStart && approxUtc < dstEnd) offset += 1;
  }
  return new Date(asUtc - offset * 3_600_000).toISOString();
}

// ----------------------------------------------------------------- fuentes

async function bandsintownIdFromMusicBrainz(mbid: string): Promise<string | null> {
  const res = await fetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  for (const rel of data.relations ?? []) {
    const m = /bandsintown\.com\/(?:[a-z]{2}\/)?a\/(\d+)/i.exec(rel.url?.resource ?? '');
    if (m) return m[1];
  }
  return null;
}

type BitEvent = {
  name?: string;
  description?: string;
  startDate?: string;
  url?: string;
  eventStatus?: string;
  location?: {
    name?: string;
    geo?: { latitude?: number | string; longitude?: number | string };
  };
  offers?: { url?: string } | { url?: string }[];
};

function parseEvents(html: string): BitEvent[] {
  const out: BitEvent[] = [];
  const collect = (x: any) => {
    if (Array.isArray(x)) x.forEach(collect);
    else if (x && typeof x === 'object') {
      if (x['@graph']) collect(x['@graph']);
      if (x['@type'] === 'MusicEvent') out.push(x);
    }
  };
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collect(JSON.parse(m[1]));
    } catch {
      // bloque JSON-LD mal formado: se ignora
    }
  }
  return out;
}

// Actuación en un festival: la descripción es el nombre del festival (con año
// o palabras típicas) en vez del de la banda o la gira.
function isFestivalAppearance(e: BitEvent, bandName: string): boolean {
  const desc = (e.description ?? '').trim();
  const place = e.location?.name ?? '';
  if (/festival|\bfest\b|open ?air/i.test(place)) return true;
  if (!desc || normalizeName(desc) === normalizeName(bandName)) return false;
  return (
    /\b(19|20)\d{2}\b/.test(desc) ||
    /festival|fest\b|open ?air|weekend|metal ?days|meeting|summer breeze|hellfest|wacken/i.test(
      desc,
    )
  );
}

// ------------------------------------------------------------------ venues

type VenueInfo = { id: string; city: string | null; countryCode: string | null };

async function findOrCreateVenue(
  admin: any,
  name: string,
  lat: number,
  lng: number,
  cache: Map<string, VenueInfo>,
  stats: { venues_created: number },
): Promise<VenueInfo | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // Recinto ya guardado a menos de ~200 m (por Ticketmaster u otra banda).
  const { data: nearby } = await admin
    .from('venues')
    .select('id, name, city, country, lat, lng')
    .gte('lat', lat - 0.002)
    .lte('lat', lat + 0.002)
    .gte('lng', lng - 0.003)
    .lte('lng', lng + 0.003)
    .limit(10);
  if (nearby && nearby.length > 0) {
    const target = normalizeName(name);
    const best =
      nearby.find((v: any) => normalizeName(v.name ?? '') === target) ??
      [...nearby].sort(
        (a: any, b: any) =>
          Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng),
      )[0];
    const info = { id: best.id, city: best.city ?? null, countryCode: countryCode(best.country) };
    cache.set(key, info);
    return info;
  }

  // Nuevo: ciudad y país por geocodificación inversa (Bandsintown no los da).
  let city: string | null = null;
  let country: string | null = null;
  let cc: string | null = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=en`,
      { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) },
    );
    if (res.ok) {
      const a = (await res.json()).address ?? {};
      city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
      country = a.country ?? null;
      cc = a.country_code ? String(a.country_code).toUpperCase() : null;
    }
  } catch {
    // Sin ciudad: el recinto se guarda igual con sus coordenadas.
  }
  await sleep(1100);

  const { data: created, error } = await admin
    .from('venues')
    .insert({ name, city, country, lat, lng })
    .select('id')
    .single();
  if (error || !created) return null;
  stats.venues_created++;
  const info = { id: created.id, city, countryCode: cc };
  cache.set(key, info);
  return info;
}

async function linkBand(admin: any, concertId: string, bandId: string, isHeadliner: boolean) {
  await admin
    .from('concert_bands')
    .upsert(
      { concert_id: concertId, band_id: bandId, is_headliner: isHeadliner },
      { onConflict: 'concert_id,band_id', ignoreDuplicates: true },
    );
}

// ----------------------------------------------------------------- handler

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const startedAt = Date.now();
  const onlyBandId = new URL(req.url).searchParams.get('band_id');

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: followed, error: fErr } = await admin
      .from('user_bands')
      .select(
        'band:bands!inner(id, name, musicbrainz_mbid, bandsintown_id, bandsintown_checked_at, bandsintown_synced_at)',
      );
    if (fErr) throw fErr;

    const unique = new Map<string, any>();
    for (const row of followed ?? []) {
      const b = (row as any).band;
      if (b?.id && !unique.has(b.id)) unique.set(b.id, b);
    }
    const staleBefore = new Date(Date.now() - RESYNC_HOURS * 3_600_000).toISOString();
    const queue = [...unique.values()]
      .filter((b) =>
        onlyBandId
          ? b.id === onlyBandId
          : !b.bandsintown_synced_at || b.bandsintown_synced_at < staleBefore,
      )
      .sort((a, b) => (a.bandsintown_synced_at ?? '').localeCompare(b.bandsintown_synced_at ?? ''));

    const stats = {
      bands_followed: unique.size,
      bands_pending: queue.length,
      bands_processed: 0,
      no_bandsintown_link: 0,
      events_seen: 0,
      new_concerts: 0,
      merged_with_existing: 0,
      already_known: 0,
      skipped_festival: 0,
      skipped_outside_europe: 0,
      skipped_cancelled: 0,
      venues_created: 0,
      blocked: null as null | { status: number; band: string },
      errors: [] as string[],
      push: null as unknown,
    };
    const venueCache = new Map<string, VenueInfo>();
    const newConcertIds: string[] = [];
    const recheckBefore = new Date(
      Date.now() - MUSICBRAINZ_RECHECK_DAYS * 86_400_000,
    ).toISOString();

    for (const band of queue) {
      if (stats.bands_processed >= MAX_BANDS_PER_RUN || Date.now() - startedAt > TIME_BUDGET_MS) {
        break;
      }
      stats.bands_processed++;
      const now = new Date().toISOString();

      try {
        // 1) Artista de Bandsintown vía MusicBrainz.
        let bitId: string | null = band.bandsintown_id;
        if (
          !bitId &&
          band.musicbrainz_mbid &&
          (!band.bandsintown_checked_at || band.bandsintown_checked_at < recheckBefore)
        ) {
          await sleep(1100); // MusicBrainz: 1 petición por segundo
          bitId = await bandsintownIdFromMusicBrainz(band.musicbrainz_mbid);
          await admin
            .from('bands')
            .update({ bandsintown_id: bitId, bandsintown_checked_at: now })
            .eq('id', band.id);
        }
        if (!bitId) {
          stats.no_bandsintown_link++;
          await admin.from('bands').update({ bandsintown_synced_at: now }).eq('id', band.id);
          continue;
        }

        // 2) Página pública del artista.
        const res = await fetch(`https://www.bandsintown.com/a/${bitId}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
          redirect: 'follow',
          signal: AbortSignal.timeout(20_000),
        });
        const html = res.ok ? await res.text() : '';
        const challenged =
          res.ok &&
          !/application\/ld\+json/i.test(html) &&
          /just a moment|attention required|cf-chl/i.test(html);
        if ([403, 429, 503].includes(res.status) || challenged) {
          // Bloqueado: no se insiste ni se esquiva.
          stats.blocked = { status: res.status, band: band.name };
          break;
        }
        if (!res.ok) {
          stats.errors.push(`${band.name}: HTTP ${res.status}`);
          await admin.from('bands').update({ bandsintown_synced_at: now }).eq('id', band.id);
          continue;
        }

        const events = parseEvents(html);
        stats.events_seen += events.length;

        for (const e of events) {
          if (/cancel/i.test(e.eventStatus ?? '')) {
            stats.skipped_cancelled++;
            continue;
          }
          if (isFestivalAppearance(e, band.name)) {
            stats.skipped_festival++;
            continue;
          }
          const lat = Number(e.location?.geo?.latitude);
          const lng = Number(e.location?.geo?.longitude);
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < EUROPE.minLat ||
            lat > EUROPE.maxLat ||
            lng < EUROPE.minLng ||
            lng > EUROPE.maxLng
          ) {
            stats.skipped_outside_europe++;
            continue;
          }
          const eventId = /\/e\/(\d+)/.exec(e.url ?? '')?.[1];
          if (!eventId || !e.startDate) continue;

          // Ya importado antes.
          const { data: known } = await admin
            .from('concerts')
            .select('id')
            .eq('bandsintown_id', eventId)
            .maybeSingle();
          if (known) {
            await linkBand(admin, known.id, band.id, true);
            stats.already_known++;
            continue;
          }

          const venue = await findOrCreateVenue(
            admin,
            e.location?.name ?? 'Recinto',
            lat,
            lng,
            venueCache,
            stats,
          );
          if (!venue) continue;
          const eventDate = localToUtc(e.startDate, venue.countryCode);
          if (!eventDate) continue;

          // Mismo concierto ya guardado por Ticketmaster o a mano: se enlaza.
          const { data: matches } = await admin.rpc('find_matching_concert', {
            p_band_ids: [band.id],
            p_event_date: eventDate,
            p_lat: lat,
            p_lng: lng,
            p_city: venue.city,
          });
          const match = matches?.[0];
          if (match) {
            if (!match.bandsintown_id) {
              await admin.from('concerts').update({ bandsintown_id: eventId }).eq('id', match.id);
            }
            await linkBand(admin, match.id, band.id, false);
            stats.merged_with_existing++;
            continue;
          }

          const offers = Array.isArray(e.offers) ? e.offers[0] : e.offers;
          const { data: inserted, error: insErr } = await admin
            .from('concerts')
            .insert({
              bandsintown_id: eventId,
              venue_id: venue.id,
              event_date: eventDate,
              ticket_url: offers?.url ?? e.url ?? null,
              source: 'bandsintown',
              last_synced_at: now,
            })
            .select('id')
            .single();
          if (insErr || !inserted) {
            stats.errors.push(`${band.name} ${eventId}: ${insErr?.message ?? 'sin id'}`);
            continue;
          }
          await linkBand(admin, inserted.id, band.id, true);
          newConcertIds.push(inserted.id);
          stats.new_concerts++;
        }

        await admin.from('bands').update({ bandsintown_synced_at: now }).eq('id', band.id);
      } catch (err) {
        stats.errors.push(`${band.name}: ${(err as Error).message}`);
      }
    }

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
