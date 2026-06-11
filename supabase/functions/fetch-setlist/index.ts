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

const COVER_REGEX = /\(([^)]+)\s+cover\)/i;
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

type SetlistfmSong = { name: string; cover?: { name: string }; tape?: boolean };
type SetlistfmSet = { name?: string; encore?: number; song: SetlistfmSong[] };
type SetlistfmSetlist = {
  id: string;
  artist: { name: string };
  venue: { name: string; city: { name: string; country: { code: string } } };
  sets: { set: SetlistfmSet[] };
  eventDate: string;
};

type Song = {
  name: string;
  position: number;
  encore: boolean;
  cover_of: string | null;
  is_tape: boolean;
  duration_ms: number | null;
};

async function searchSetlistfm(
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
  if (res.status === 429) throw new Error(`SETLISTFM_RATE_LIMITED`);
  if (!res.ok) {
    console.log(`[setlistfm] HTTP ${res.status} for "${artistName}" ${date}`);
    return null;
  }

  const data = await res.json();
  const setlists: SetlistfmSetlist[] = data.setlist ?? [];
  if (setlists.length === 0) return null;

  // Si solo hay uno, ese
  if (setlists.length === 1) return setlists[0];

  // Si hay varios, preferir el de misma ciudad
  if (cityName) {
    const targetCity = normalizeName(cityName);
    const cityMatch = setlists.find(
      (s) => s.venue?.city?.name && normalizeName(s.venue.city.name) === targetCity,
    );
    if (cityMatch) return cityMatch;
  }

  // Si no, el primero
  return setlists[0];
}

function flattenSongs(setlist: SetlistfmSetlist): Song[] {
  const songs: Song[] = [];
  let pos = 0;
  const sets = setlist.sets?.set ?? [];

  for (const set of sets) {
    const isEncore = (set.encore ?? 0) > 0;
    for (const s of set.song) {
      if (!s.name || s.name.trim() === '') {
        // setlist.fm a veces tiene placeholders vacíos (Drum solo, etc.)
        continue;
      }
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
  // Si es cover, busca con el artista original
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

async function processConcertBand(
  admin: any,
  concertId: string,
  bandId: string,
  bandName: string,
  eventDate: string,
  cityName: string | null,
  spotifyToken: string,
) {
  console.log(`[fetch-setlist] processing "${bandName}" @ ${eventDate}`);

  // 1. Buscar en setlist.fm
  const setlist = await searchSetlistfm(bandName, eventDate, cityName);
  await sleep(SETLISTFM_DELAY_MS);

  if (!setlist) {
    // Marcar como not_found
    await admin.from('setlists').upsert(
      {
        concert_id: concertId,
        band_id: bandId,
        not_found: true,
        songs: [],
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'concert_id,band_id' },
    );
    return { band: bandName, found: false };
  }

  // 2. Aplanar canciones
  let songs = flattenSongs(setlist);

  if (songs.length === 0) {
    await admin.from('setlists').upsert(
      {
        concert_id: concertId,
        band_id: bandId,
        setlistfm_id: setlist.id,
        not_found: true,
        songs: [],
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'concert_id,band_id' },
    );
    return { band: bandName, found: false };
  }

  // 3. Enriquecer con duración (en paralelo limitado)
  for (let i = 0; i < songs.length; i++) {
    songs[i].duration_ms = await enrichSongDuration(songs[i], bandName, spotifyToken);
    if (i < songs.length - 1) await sleep(SPOTIFY_DELAY_MS);
  }

  const totalDurationMs = songs.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
  const totalMinutes = totalDurationMs > 0 ? Math.round(totalDurationMs / 60000) : null;
  const encoreCount = songs.filter((s) => s.encore).length;

  // 4. Guardar
  await admin.from('setlists').upsert(
    {
      concert_id: concertId,
      band_id: bandId,
      setlistfm_id: setlist.id,
      songs,
      total_duration_minutes: totalMinutes,
      song_count: songs.length,
      encore_count: encoreCount,
      not_found: false,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'concert_id,band_id' },
  );

  return { band: bandName, found: true, songs: songs.length, duration: totalMinutes };
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

    // 1. Datos del concierto
    const { data: concert, error: cErr } = await admin
      .from('concerts')
      .select(
        `
        id, event_date,
        venue:venues!inner ( city ),
        concert_bands ( band:bands!inner ( id, name ) )
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
    const allBands: { id: string; name: string }[] = c.concert_bands.map((cb: any) => cb.band);

    // Filtrar por bandId si se pidió
    const bandsToProcess = bandId ? allBands.filter((b) => b.id === bandId) : allBands;

    if (bandsToProcess.length === 0) {
      return new Response(JSON.stringify({ error: 'No bands to process' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Si no es force, ignorar las que ya tenemos
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
          band.id,
          band.name,
          c.event_date,
          cityName,
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
