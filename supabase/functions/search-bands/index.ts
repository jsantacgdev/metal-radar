import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

// Cache simple del token en memoria (vive mientras la función esté caliente)
let cachedToken: {
  value: string;
  expiresAt: number;
} | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
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

  if (!res.ok) {
    throw new Error(`Spotify token error: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query must be at least 2 characters' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar primero en BD
    const { data: cached } = await admin
      .from('bands')
      .select('spotify_id, name, image_url, genres')
      .ilike('name', `${query}%`)
      .not('spotify_id', 'is', null)
      .limit(10);

    const cachedBands = (cached ?? []).map((b: any) => ({
      spotify_id: b.spotify_id,
      name: b.name,
      image_url: b.image_url,
      genres: b.genres ?? [],
    }));

    // Si ya hay 5+ cacheados, no necesitamos llamar a Spotify
    if (cachedBands.length >= 5) {
      return new Response(JSON.stringify({ bands: cachedBands, source: 'cache' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Complementar con Spotify
    try {
      const token = await getSpotifyToken();
      const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=10`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        const spotifyBands = data.artists.items
          .map((artist: any) => ({
            spotify_id: artist.id,
            name: artist.name,
            image_url: artist.images?.[0]?.url ?? null,
            genres: artist.genres ?? [],
            popularity: artist.popularity,
          }))
          .filter((b: any) => {
            if (b.genres.length === 0) return true;
            return b.genres.some((g: string) =>
              /metal|rock|hardcore|punk|metalcore|deathcore|grunge|emo|screamo/i.test(g),
            );
          });

        // Cachear lo nuevo en BD para futuras búsquedas
        if (spotifyBands.length > 0) {
          await admin.from('bands').upsert(
            spotifyBands.map((b: any) => ({
              spotify_id: b.spotify_id,
              name: b.name,
              image_url: b.image_url,
              genres: b.genres,
            })),
            { onConflict: 'spotify_id' },
          );
        }

        // Combinar caché + Spotify, deduplicando por spotify_id
        const combined = new Map<string, any>();
        for (const b of cachedBands) combined.set(b.spotify_id, b);
        for (const b of spotifyBands) {
          if (!combined.has(b.spotify_id)) combined.set(b.spotify_id, b);
        }

        return new Response(
          JSON.stringify({ bands: Array.from(combined.values()), source: 'mixed' }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    } catch (err) {
      console.log('Spotify search error, using cache only:', err);
    }

    // Fallback: solo caché
    return new Response(JSON.stringify({ bands: cachedBands, source: 'cache_fallback' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
