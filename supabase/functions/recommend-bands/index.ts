import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedSpotifyToken: {
  value: string;
  expiresAt: number;
} | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedSpotifyToken && cachedSpotifyToken.expiresAt > Date.now()) {
    return cachedSpotifyToken.value;
  }
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
  cachedSpotifyToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedSpotifyToken.value;
}

async function getSimilarFromLastfm(artistName: string): Promise<string[]> {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.similarartists?.artist ?? []).map((a: any) => a.name);
}

type BandData = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

async function searchSpotifyArtist(
  name: string,
  token: string,
  admin: any,
  retryCount = 0,
): Promise<BandData | null> {
  // 1. Buscar primero en BD (case-insensitive con ilike)
  const { data: existing } = await admin
    .from('bands')
    .select('spotify_id, name, image_url, genres')
    .ilike('name', name)
    .not('spotify_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      spotify_id: existing.spotify_id,
      name: existing.name,
      image_url: existing.image_url,
      genres: existing.genres ?? [],
    };
  }

  // 2. Si no está en BD, consultar Spotify
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429 && retryCount < 2) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
    // Si el bloqueo es muy largo (>60s), abortamos para no quedarnos colgados
    if (retryAfter > 60) {
      console.log(`Spotify 429 for "${name}", retry too long (${retryAfter}s), skipping`);
      return null;
    }
    console.log(`Spotify 429 for "${name}", retrying after ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, (retryAfter + 0.5) * 1000));
    return searchSpotifyArtist(name, token, admin, retryCount + 1);
  }

  if (!res.ok) {
    console.log(`Spotify search "${name}" → ${res.status}`);
    return null;
  }

  const data = await res.json();
  const artist = data.artists?.items?.[0];
  if (!artist) {
    console.log(`Spotify no result for "${name}"`);
    return null;
  }
  if (artist.name.toLowerCase() !== name.toLowerCase()) {
    return null;
  }
  return {
    spotify_id: artist.id,
    name: artist.name,
    image_url: artist.images?.[0]?.url ?? null,
    genres: artist.genres ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: CORS_HEADERS,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Bandas seguidas
    const { data: userBands, error: ubError } = await admin
      .from('user_bands')
      .select('band:bands(id, name)')
      .eq('user_id', user.id);
    if (ubError) throw ubError;

    const followedNames = new Set(
      (userBands ?? []).map((ub: any) => ub.band?.name?.toLowerCase()).filter(Boolean),
    );

    console.log(`userBands count: ${userBands?.length ?? 0}`);
    console.log(`followedNames: ${Array.from(followedNames).slice(0, 5).join(', ')}...`);

    if (followedNames.size === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    const followedArr = Array.from(followedNames) as string[];

    // 2. Last.fm en paralelo
    const allSimilarLists = await Promise.all(
      followedArr.map((name) => getSimilarFromLastfm(name)),
    );
    console.log(`Last.fm results per band: ${allSimilarLists.map((l) => l.length).join(', ')}`);

    // 3. Agregar y puntuar candidatos
    const candidateScores = new Map<string, number>();
    for (const similar of allSimilarLists) {
      for (const s of similar) {
        const key = s.toLowerCase();
        if (followedNames.has(key)) continue;
        candidateScores.set(key, (candidateScores.get(key) ?? 0) + 1);
      }
    }

    // 4. Top 15 candidatos
    const topCandidatesWithScore = Array.from(candidateScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    const topCandidates = topCandidatesWithScore.map(([name]) => name);
    const scoresByName = new Map(topCandidatesWithScore);

    console.log(
      `Total candidates: ${candidateScores.size}, top: ${topCandidates.slice(0, 5).join(', ')}`,
    );

    if (topCandidates.length === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    // 5. Buscar en caché (tabla bands) por nombre lowercase
    const { data: cachedBands, error: cacheError } = await admin
      .from('bands')
      .select('spotify_id, name, image_url, genres')
      .in('name', topCandidates) // matches case-sensitive
      .not('spotify_id', 'is', null);

    if (cacheError) {
      console.warn('Cache lookup error:', cacheError.message);
    }

    // También probar match case-insensitive: traer todas y filtrar en memoria
    // Solo si lo anterior no encontró todo. Para simplificar, lo hacemos siempre:
    const { data: allCandidateMatches } = await admin
      .from('bands')
      .select('spotify_id, name, image_url, genres')
      .not('spotify_id', 'is', null)
      .filter(
        'name',
        'in',
        `(${topCandidates.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')})`,
      );

    // Mapa de cacheadas por nombre normalizado
    const cachedByName = new Map<string, BandData>();
    for (const row of cachedBands ?? []) {
      cachedByName.set(row.name.toLowerCase(), row as BandData);
    }
    for (const row of allCandidateMatches ?? []) {
      cachedByName.set(row.name.toLowerCase(), row as BandData);
    }

    // 6. Separar: cacheadas vs por buscar
    const fromCache: BandData[] = [];
    const toFetch: string[] = [];
    for (const candidate of topCandidates) {
      const cached = cachedByName.get(candidate.toLowerCase());
      if (cached) fromCache.push(cached);
      else toFetch.push(candidate);
    }

    console.log(`fromCache: ${fromCache.length}, toFetch: ${toFetch.length}`);

    // 7. Buscar los que faltan en Spotify (paralelo)
    let fromSpotify: BandData[] = [];
    if (toFetch.length > 0) {
      const spotifyToken = await getSpotifyToken();
      const spotifyResults: (BandData | null)[] = [];
      const BATCH_SIZE = 3;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((c) => searchSpotifyArtist(c, spotifyToken, admin)),
        );
        spotifyResults.push(...batchResults);
        if (i + BATCH_SIZE < toFetch.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      fromSpotify = spotifyResults.filter((r): r is BandData => r !== null);

      // Cachear en BD para futuros usuarios
      if (fromSpotify.length > 0) {
        const { error: insertError } = await admin.from('bands').upsert(
          fromSpotify.map((b) => ({
            spotify_id: b.spotify_id,
            name: b.name,
            image_url: b.image_url,
            genres: b.genres,
          })),
          { onConflict: 'spotify_id' },
        );
        if (insertError) console.warn('Cache write error:', insertError.message);
      }
    }

    const recommendations = [...fromCache, ...fromSpotify].map((b) => {
      const score = scoresByName.get(b.name.toLowerCase()) ?? 1;
      const affinity = Math.min(95, 75 + score * 6);
      return { ...b, affinity };
    });

    return new Response(
      JSON.stringify({
        recommendations,
        cached: fromCache.length,
        fetched: fromSpotify.length,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: (err as Error).message,
      }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
