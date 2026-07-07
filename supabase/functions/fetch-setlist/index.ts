import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SETLISTFM_API_KEY = Deno.env.get('SETLISTFM_API_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETLISTFM_DELAY_MS = 600; // 2 req/s con margen
const SPOTIFY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(isoDate: string): string {
  // setlist.fm quiere DD-MM-YYYY
  const d = new Date(isoDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Convierte DD-MM-YYYY (formato setlist.fm) → YYYY-MM-DD (formato Postgres DATE) */
function setlistfmDateToISO(ddmmyyyy: string): string | null {
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}

/** Quita un año al final del tour name si está presente. "From Zero World Tour 2026" → "From Zero World Tour" */
function stripTrailingYear(tour: string): string {
  return tour.replace(/\s+\d{4}$/, '').trim();
}

type SetlistfmSong = { name: string; cover?: { name: string }; tape?: boolean };
type SetlistfmSet = { name?: string; encore?: number; song: SetlistfmSong[] };
type SetlistfmSetlist = {
  id: string;
  artist: { name: string };
  venue: { name: string; city: { name: string; country: { code: string } } };
  sets: { set: SetlistfmSet[] };
  eventDate: string; // DD-MM-YYYY
  tour?: { name: string };
};

type Song = {
  name: string;
  position: number;
  encore: boolean;
  cover_of: string | null;
  is_tape: boolean;
  duration_ms: number | null;
};

/** Busca el setlist del PROPIO evento (artist + date). Comportamiento original. */
async function searchSetlistfmByDate(
  artistName: string,
  date: string,
  cityName?: string | null,
): Promise<SetlistfmSetlist | null> {
  const url =
    `https://api.setlist.fm/rest/1.0/search/setlists?` +
    `artistName=${encodeURIComponent(artistName)}&date=${formatDate(date)}`;

  const res = await fetch(url, {
    headers: {
      'x-api-key': SETLISTFM_API_KEY,
      Accept: 'application/json',
    },
  });

  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('SETLISTFM_RATE_LIMITED');
  if (!res.ok) {
    console.log(`[setlistfm] HTTP ${res.status} for "${artistName}" ${date}`);
    return null;
  }

  const data = await res.json();
  const setlists: SetlistfmSetlist[] = data.setlist ?? [];
  if (setlists.length === 0) return null;
  if (setlists.length === 1) return setlists[0];

  if (cityName) {
    const targetCity = normalizeName(cityName);
    const cityMatch = setlists.find(
      (s) => s.venue?.city?.name && normalizeName(s.venue.city.name) === targetCity,
    );
    if (cityMatch) return cityMatch;
  }

  return setlists[0];
}

/**
 * Llama al endpoint search/setlists filtrando por mbid (+ tourName si se indica).
 * Devuelve el setlist más reciente con canciones, o null si no hay ninguno.
 */
async function fetchTourSetlistRaw(
  artistMbid: string,
  tourName?: string,
): Promise<SetlistfmSetlist | null> {
  const url =
    `https://api.setlist.fm/rest/1.0/search/setlists?` +
    `artistMbid=${encodeURIComponent(artistMbid)}` +
    (tourName ? `&tourName=${encodeURIComponent(tourName)}` : '');

  const res = await fetch(url, {
    headers: {
      'x-api-key': SETLISTFM_API_KEY,
      Accept: 'application/json',
    },
  });

  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('SETLISTFM_RATE_LIMITED');
  if (!res.ok) {
    console.log(`[setlistfm] tour HTTP ${res.status} mbid=${artistMbid} tour="${tourName ?? ''}"`);
    return null;
  }

  const data = await res.json();
  const setlists: SetlistfmSetlist[] = data.setlist ?? [];
  if (setlists.length === 0) return null;

  // Ordenar por fecha descendente
  const withDate = setlists
    .map((s) => ({ s, t: setlistfmDateToISO(s.eventDate) }))
    .filter((x) => x.t)
    .sort((a, b) => (a.t! < b.t! ? 1 : -1));

  // Coger el primero con canciones
  for (const { s } of withDate) {
    const total = (s.sets?.set ?? []).reduce((acc, set) => acc + (set.song?.length ?? 0), 0);
    if (total > 0) return s;
  }
  return null;
}

/**
 * Busca un setlist "de predicción" para un headliner con mbid. Si hay tour_name,
 * intenta primero con el nombre exacto y luego sin el año al final ("Tour Name 2026"
 * → "Tour Name"). Si no hay tour_name (Ticketmaster no siempre lo incluye en el
 * título del evento, sobre todo en giras grandes) o ninguno de esos intentos
 * encuentra nada, cae de vuelta al setlist más reciente conocido del artista
 * (sin filtrar por gira) como última alternativa.
 */
async function searchSetlistfmByTour(
  artistMbid: string,
  tourName: string | null,
): Promise<SetlistfmSetlist | null> {
  if (tourName) {
    let setlist = await fetchTourSetlistRaw(artistMbid, tourName);
    if (setlist) return setlist;
    await sleep(SETLISTFM_DELAY_MS);

    const cleaned = stripTrailingYear(tourName);
    if (cleaned && cleaned !== tourName) {
      setlist = await fetchTourSetlistRaw(artistMbid, cleaned);
      if (setlist) return setlist;
      await sleep(SETLISTFM_DELAY_MS);
    }
  }

  return fetchTourSetlistRaw(artistMbid);
}

function flattenSongs(setlist: SetlistfmSetlist): Song[] {
  const songs: Song[] = [];
  let pos = 0;
  const sets = setlist.sets?.set ?? [];

  for (const set of sets) {
    const isEncore = (set.encore ?? 0) > 0;
    for (const s of set.song) {
      if (!s.name || s.name.trim() === '') continue;
      pos++;
      songs.push({
        name: s.name,
        position: pos,
        encore: isEncore,
        cover_of: s.cover?.name ?? null,
        is_tape: s.tape === true,
        duration_ms: null,
      });
    }
  }
  return songs;
}

// Spotify token
let cachedToken: { value: string; expiresAt: number } | null = null;
async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token error: ${res.status}`);
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

async function enrichSongDuration(
  song: Song,
  artistName: string,
  token: string,
): Promise<number | null> {
  const searchArtist = song.cover_of ?? artistName;
  const q = `track:"${song.name}" artist:"${searchArtist}"`;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const track = data.tracks?.items?.[0];
    return track?.duration_ms ?? null;
  } catch {
    return null;
  }
}

type BandToProcess = {
  id: string;
  name: string;
  mbid: string | null;
  isHeadliner: boolean;
};

async function processConcertBand(
  admin: any,
  concertId: string,
  band: BandToProcess,
  eventDate: string,
  cityName: string | null,
  tourName: string | null,
  spotifyToken: string,
) {
  console.log(`[fetch-setlist] processing "${band.name}" @ ${eventDate}`);

  // 1. Intentar setlist del propio evento
  let setlist = await searchSetlistfmByDate(band.name, eventDate, cityName);
  await sleep(SETLISTFM_DELAY_MS);

  let source: 'event' | 'tour' = 'event';
  let sourceEventDate: string | null = null;

  // 2. Si no hay y la banda es headliner con mbid → buscar por gira (o, si no hay
  // tour_name / no hay match, el setlist más reciente conocido del artista)
  if (!setlist && band.isHeadliner && band.mbid) {
    console.log(
      `[fetch-setlist] no event setlist for "${band.name}", trying tour fallback` +
        (tourName ? ` "${tourName}"` : ' (sin tour_name)'),
    );
    setlist = await searchSetlistfmByTour(band.mbid, tourName);
    await sleep(SETLISTFM_DELAY_MS);
    if (setlist) {
      source = 'tour';
      sourceEventDate = setlistfmDateToISO(setlist.eventDate);
    }
  }

  if (!setlist) {
    await admin.from('setlists').upsert(
      {
        concert_id: concertId,
        band_id: band.id,
        not_found: true,
        songs: [],
        source: 'event',
        source_event_date: null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'concert_id,band_id' },
    );
    return { band: band.name, found: false };
  }

  // 3. Aplanar canciones
  const songs = flattenSongs(setlist);

  if (songs.length === 0) {
    await admin.from('setlists').upsert(
      {
        concert_id: concertId,
        band_id: band.id,
        setlistfm_id: setlist.id,
        not_found: true,
        songs: [],
        source,
        source_event_date: sourceEventDate,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'concert_id,band_id' },
    );
    return { band: band.name, found: false, source };
  }

  // 4. Enriquecer duración con Spotify
  for (let i = 0; i < songs.length; i++) {
    songs[i].duration_ms = await enrichSongDuration(songs[i], band.name, spotifyToken);
    if (i < songs.length - 1) await sleep(SPOTIFY_DELAY_MS);
  }

  const totalDurationMs = songs.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
  const totalMinutes = totalDurationMs > 0 ? Math.round(totalDurationMs / 60000) : null;
  const encoreCount = songs.filter((s) => s.encore).length;

  // 5. Guardar
  await admin.from('setlists').upsert(
    {
      concert_id: concertId,
      band_id: band.id,
      setlistfm_id: setlist.id,
      songs,
      total_duration_minutes: totalMinutes,
      song_count: songs.length,
      encore_count: encoreCount,
      not_found: false,
      source,
      source_event_date: sourceEventDate,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'concert_id,band_id' },
  );

  return { band: band.name, found: true, source, songs: songs.length, duration: totalMinutes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { concertId, bandId, force } = await req.json();
    if (!concertId) {
      return new Response(JSON.stringify({ error: 'concertId is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Datos del concierto (incluyendo tour_name y mbid + is_headliner por banda)
    const { data: concert, error: cErr } = await admin
      .from('concerts')
      .select(
        `
        id, event_date, tour_name,
        venue:venues!inner ( city ),
        concert_bands ( is_headliner, band:bands!inner ( id, name, musicbrainz_mbid ) )
      `,
      )
      .eq('id', concertId)
      .single();

    if (cErr || !concert) {
      return new Response(JSON.stringify({ error: 'Concert not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const c: any = concert;
    const cityName = c.venue?.city ?? null;
    const tourName: string | null = c.tour_name ?? null;

    const allBands: BandToProcess[] = c.concert_bands.map((cb: any) => ({
      id: cb.band.id,
      name: cb.band.name,
      mbid: cb.band.musicbrainz_mbid ?? null,
      isHeadliner: !!cb.is_headliner,
    }));

    // Filtrar por bandId si se pidió
    const bandsToProcess = bandId ? allBands.filter((b) => b.id === bandId) : allBands;

    if (bandsToProcess.length === 0) {
      return new Response(JSON.stringify({ error: 'No bands to process' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Si no es force, saltar las que ya tenemos
    let pendingBands = bandsToProcess;
    if (!force) {
      const { data: existing } = await admin
        .from('setlists')
        .select('band_id')
        .eq('concert_id', concertId);
      const existingIds = new Set((existing ?? []).map((r: any) => r.band_id));
      pendingBands = bandsToProcess.filter((b) => !existingIds.has(b.id));
    }

    if (pendingBands.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Setlists already fetched', skipped: bandsToProcess.length }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Token Spotify
    const spotifyToken = await getSpotifyToken();

    // 4. Procesar cada banda
    const results = [];
    for (const band of pendingBands) {
      try {
        const r = await processConcertBand(
          admin,
          concertId,
          band,
          c.event_date,
          cityName,
          tourName,
          spotifyToken,
        );
        results.push(r);
      } catch (err) {
        const msg = (err as Error).message;
        console.warn(`Error procesando "${band.name}":`, msg);
        results.push({ band: band.name, error: msg });
        if (msg === 'SETLISTFM_RATE_LIMITED') break;
      }
    }

    return new Response(
      JSON.stringify({
        concert_id: concertId,
        processed: results.length,
        results,
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
