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

const TARGET_RECOMMENDATIONS = 20;
const PER_BAND_QUOTA = 1;
const POOL_SIZE = 50;
const MEMBERS_CACHE_TTL_DAYS = 180;

let cachedSpotifyToken: { value: string; expiresAt: number } | null = null;

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
    `&format=json&limit=15`;
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

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429 && retryCount < 2) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
    if (retryAfter > 60) {
      console.log(`Spotify 429 for "${name}", retry too long (${retryAfter}s), skipping`);
      return null;
    }
    await new Promise((r) => setTimeout(r, (retryAfter + 0.5) * 1000));
    return searchSpotifyArtist(name, token, admin, retryCount + 1);
  }

  if (!res.ok) return null;
  const data = await res.json();
  const artist = data.artists?.items?.[0];
  if (!artist) return null;
  if (artist.name.toLowerCase() !== name.toLowerCase()) return null;

  return {
    spotify_id: artist.id,
    name: artist.name,
    image_url: artist.images?.[0]?.url ?? null,
    genres: artist.genres ?? [],
  };
}

function weightedSample<T>(items: { item: T; weight: number }[], count: number): T[] {
  const result: T[] = [];
  const pool = [...items];
  while (result.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((acc, x) => acc + x.weight, 0);
    let r = Math.random() * totalWeight;
    let picked = -1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        picked = i;
        break;
      }
    }
    if (picked === -1) picked = pool.length - 1;
    result.push(pool[picked].item);
    pool.splice(picked, 1);
  }
  return result;
}

/**
 * Lanza pre-warming en background para bandas sin caché de miembros.
 * Fire-and-forget: no espera el resultado.
 */
function triggerPrewarm(bandIds: string[], authHeader: string) {
  if (bandIds.length === 0) return;

  // EdgeRuntime.waitUntil permite que la función siga ejecutando
  // tras enviar la respuesta al cliente
  const task = fetch(`${SUPABASE_URL}/functions/v1/prewarm-band-members`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ band_ids: bandIds }),
  }).catch((err) => {
    console.warn('Prewarm trigger error:', err);
  });

  // @ts-ignore - EdgeRuntime es global en Supabase Edge Functions
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  }
}

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

    // 1. Bandas seguidas (incluyendo cache de miembros)
    const { data: userBands, error: ubError } = await admin
      .from('user_bands')
      .select('band:bands(id, name, musicbrainz_mbid, members, members_fetched_at)')
      .eq('user_id', user.id);
    if (ubError) throw ubError;

    const followedNames = new Set(
      (userBands ?? []).map((ub: any) => ub.band?.name?.toLowerCase()).filter(Boolean),
    );

    if (followedNames.size === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const followedArr = Array.from(followedNames) as string[];

    const followedBands = (userBands ?? []).map((ub: any) => ub.band).filter(Boolean) as {
      id: string;
      name: string;
      musicbrainz_mbid: string | null;
      members: string[] | null;
      members_fetched_at: string | null;
    }[];

    // 2. Recolectar miembros SOLO desde caché. No bloquear nunca con MusicBrainz.
    //    Las bandas sin caché se anotarán para hacer pre-warming en background.
    const memberExclusions = new Set<string>();
    const needsPrewarm: string[] = [];

    const ttlMs = MEMBERS_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    for (const b of followedBands) {
      if (b.members && b.members_fetched_at) {
        const ageMs = Date.now() - new Date(b.members_fetched_at).getTime();
        if (ageMs < ttlMs) {
          for (const m of b.members) {
            memberExclusions.add(m.toLowerCase());
          }
          continue;
        }
      }
      needsPrewarm.push(b.id);
    }

    console.log(
      `Member exclusions: ${memberExclusions.size}. Bands needing prewarm: ${needsPrewarm.length}`,
    );

    // 3. Last.fm en paralelo (la parte lenta es Spotify y la teníamos ya bien)
    const allSimilarLists = await Promise.all(
      followedArr.map((name) => getSimilarFromLastfm(name)),
    );

    // 4. Disparar pre-warming en background (no bloquea)
    if (needsPrewarm.length > 0) {
      triggerPrewarm(needsPrewarm, authHeader);
    }

    // 5. Scoring de candidatos
    const candidateScores = new Map<string, number>();
    for (const similar of allSimilarLists) {
      for (const s of similar) {
        const key = s.toLowerCase();
        if (followedNames.has(key)) continue;
        if (memberExclusions.has(key)) continue;
        candidateScores.set(key, (candidateScores.get(key) ?? 0) + 1);
      }
    }

    if (candidateScores.size === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 6. Cuota por banda + muestreo ponderado (igual que antes)
    const guaranteed = new Set<string>();
    for (const similarList of allSimilarLists) {
      let added = 0;
      for (const similar of similarList) {
        if (added >= PER_BAND_QUOTA) break;
        const key = similar.toLowerCase();
        if (followedNames.has(key) || guaranteed.has(key)) continue;
        if (memberExclusions.has(key)) continue;
        guaranteed.add(key);
        added++;
      }
    }

    const poolEntries = Array.from(candidateScores.entries())
      .filter(([name]) => !guaranteed.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, POOL_SIZE);

    const slotsLeft = Math.max(TARGET_RECOMMENDATIONS - guaranteed.size, 0);
    const sampled = weightedSample(
      poolEntries.map(([name, score]) => ({ item: name, weight: score })),
      slotsLeft,
    );

    const finalCandidates = [...Array.from(guaranteed), ...sampled].slice(
      0,
      TARGET_RECOMMENDATIONS,
    );
    const scoresByName = new Map(Array.from(candidateScores.entries()));

    // 7. Resolver desde cache de BD (una sola query, no dos)
    const { data: cachedBands } = await admin
      .from('bands')
      .select('spotify_id, name, image_url, genres')
      .in('name', finalCandidates)
      .not('spotify_id', 'is', null);

    const cachedByName = new Map<string, BandData>();
    for (const row of cachedBands ?? []) {
      cachedByName.set(row.name.toLowerCase(), row as BandData);
    }

    const fromCache: BandData[] = [];
    const toFetch: string[] = [];
    for (const candidate of finalCandidates) {
      const cached = cachedByName.get(candidate.toLowerCase());
      if (cached) fromCache.push(cached);
      else toFetch.push(candidate);
    }

    // 8. Buscar las que falten en Spotify
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

    // 9. Calcular affinity y ordenar
    const all = [...fromCache, ...fromSpotify];
    const recommendations = all
      .map((b) => {
        const score = scoresByName.get(b.name.toLowerCase()) ?? 1;
        const affinity = Math.min(95, 75 + score * 6);
        return { ...b, affinity };
      })
      .sort((a, b) => b.affinity - a.affinity);

    return new Response(
      JSON.stringify({
        recommendations,
        cached: fromCache.length,
        fetched: fromSpotify.length,
        guaranteed: guaranteed.size,
        prewarmTriggered: needsPrewarm.length,
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
