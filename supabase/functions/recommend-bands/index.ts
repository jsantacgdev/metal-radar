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
const MAX_GUARANTEED = 8;
const POOL_SIZE = 50;
const MEMBERS_CACHE_TTL_DAYS = 180;

const SIMILAR_SCORE = 6;
const TAG_SCORE = 3;

const GENERIC_TAGS = new Set([
  'rock',
  'metal',
  'alternative',
  'alternative rock',
  'hard rock',
  'heavy metal',
  'music',
  'pop',
  'indie',
  '00s',
  '90s',
  '80s',
  '70s',
  'seen live',
  'american',
  'british',
  'female vocalists',
  'male vocalists',
  'classic rock',
  'classic',
  'soundtrack',
  'instrumental',
]);

const TOP_TAGS_TO_USE = 5;

const ARTISTS_PER_TAG = 50;

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

async function getTopArtistsFromTag(tag: string): Promise<string[]> {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists` +
    `&tag=${encodeURIComponent(tag)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json&limit=${ARTISTS_PER_TAG}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.topartists?.artist ?? []).map((a: any) => a.name);
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
    if (retryAfter > 60) return null;
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

function triggerPrewarm(bandIds: string[], authHeader: string) {
  if (bandIds.length === 0) return;
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

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
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

    const { data: userBands, error: ubError } = await admin
      .from('user_bands')
      .select('band:bands(id, name, musicbrainz_mbid, member_names, members_fetched_at, genres)')
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
      member_names: string[] | null;
      members_fetched_at: string | null;
      genres: string[] | null;
    }[];

    const memberExclusions = new Set<string>();
    const needsPrewarm: string[] = [];
    const ttlMs = MEMBERS_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    for (const b of followedBands) {
      if (b.member_names && b.members_fetched_at) {
        const ageMs = Date.now() - new Date(b.members_fetched_at).getTime();
        if (ageMs < ttlMs) {
          for (const m of b.member_names) {
            if (typeof m === 'string' && m.trim().length > 0) {
              memberExclusions.add(m.toLowerCase().trim());
            }
          }
          continue;
        }
      }
      needsPrewarm.push(b.id);
    }

    const tagFreq = new Map<string, number>();
    for (const b of followedBands) {
      for (const g of b.genres ?? []) {
        const tag = g.toLowerCase().trim();
        if (!tag || GENERIC_TAGS.has(tag)) continue;
        tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
      }
    }

    const topTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_TAGS_TO_USE)
      .map(([tag]) => tag);

    console.log(`Top tags: ${topTags.join(', ')}`);

    const [allSimilarLists, allTagLists] = await Promise.all([
      Promise.all(followedArr.map((name) => getSimilarFromLastfm(name))),
      Promise.all(topTags.map((tag) => getTopArtistsFromTag(tag))),
    ]);

    if (needsPrewarm.length > 0) {
      triggerPrewarm(needsPrewarm, authHeader);
    }

    const candidateScores = new Map<string, number>();

    for (const similar of allSimilarLists) {
      for (const s of similar) {
        const key = s.toLowerCase();
        if (followedNames.has(key) || memberExclusions.has(key)) continue;
        candidateScores.set(key, (candidateScores.get(key) ?? 0) + SIMILAR_SCORE);
      }
    }

    for (const topArtists of allTagLists) {
      for (const a of topArtists) {
        const key = a.toLowerCase();
        if (followedNames.has(key) || memberExclusions.has(key)) continue;
        candidateScores.set(key, (candidateScores.get(key) ?? 0) + TAG_SCORE);
      }
    }

    const topTagsSet = new Set(topTags);

    const candidateNames = Array.from(candidateScores.keys());
    const { data: candidateBands } = await admin
      .from('bands')
      .select('name, genres')
      .in('name', candidateNames);

    const genresByName = new Map<string, string[]>();
    for (const b of candidateBands ?? []) {
      genresByName.set(
        b.name.toLowerCase(),
        (b.genres ?? []).map((g: string) => g.toLowerCase()),
      );
    }

    for (const [name, score] of candidateScores.entries()) {
      const genres = genresByName.get(name) ?? [];
      if (genres.length === 0) continue;

      const matchingTags = genres.filter((g) => topTagsSet.has(g)).length;

      if (matchingTags > 0) {
        candidateScores.set(name, score + matchingTags * 3);
      } else {
        candidateScores.set(name, Math.floor(score * 0.5));
      }
    }

    if (candidateScores.size === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

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

    const guaranteedArray = Array.from(guaranteed)
      .map((name) => ({ name, score: candidateScores.get(name) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_GUARANTEED)
      .map((x) => x.name);

    const guaranteedFinal = new Set(guaranteedArray);

    const poolEntries = Array.from(candidateScores.entries())
      .filter(([name]) => !guaranteedFinal.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, POOL_SIZE);

    const slotsLeft = Math.max(TARGET_RECOMMENDATIONS - guaranteedFinal.size, 0);
    const sampled = weightedSample(
      poolEntries.map(([name, score]) => ({ item: name, weight: score })),
      slotsLeft,
    );

    const finalCandidates = [...guaranteedArray, ...sampled].slice(0, TARGET_RECOMMENDATIONS);
    const scoresByName = new Map(Array.from(candidateScores.entries()));

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

    const all = [...fromCache, ...fromSpotify];
    const maxScore = Math.max(...Array.from(scoresByName.values()), 1);
    let recommendations = all
      .map((b) => {
        const score = scoresByName.get(b.name.toLowerCase()) ?? 1;
        const normalized = score / maxScore;
        const affinity = Math.min(95, 70 + Math.round(normalized * 25));
        return { ...b, affinity };
      })
      .sort((a, b) => b.affinity - a.affinity);

    const TOP_SHUFFLE_SIZE = 10;
    const top = recommendations.slice(0, TOP_SHUFFLE_SIZE);
    const rest = recommendations.slice(TOP_SHUFFLE_SIZE);
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    recommendations = [...top, ...rest];

    return new Response(
      JSON.stringify({
        recommendations,
        cached: fromCache.length,
        fetched: fromSpotify.length,
        guaranteed: guaranteedFinal.size,
        topTags,
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
