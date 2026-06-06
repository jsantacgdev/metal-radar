import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

// Cache simple del token en memoria (vive mientras la función esté caliente)
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
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
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresca 1 min antes
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
      return new Response(
        JSON.stringify({ error: 'Query must be at least 2 characters' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = await getSpotifyToken();
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=10`;

    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!searchRes.ok) {
      throw new Error(`Spotify search error: ${searchRes.status}`);
    }

    const data = await searchRes.json();

    // Filtramos a bandas con género rock/metal y simplificamos respuesta
    const bands = data.artists.items
      .map((artist: any) => ({
        spotify_id: artist.id,
        name: artist.name,
        image_url: artist.images?.[0]?.url ?? null,
        genres: artist.genres ?? [],
        popularity: artist.popularity,
      }))
      .filter((b: any) => {
        // Si no tiene géneros declarados, lo dejamos pasar (Spotify a veces no los devuelve)
        if (b.genres.length === 0) return true;
        // Si tiene géneros, al menos uno debe ser heavy
        return b.genres.some((g: string) =>
          /metal|rock|hardcore|punk|metalcore|deathcore|grunge|emo|screamo/i.test(g)
        );
      });

    return new Response(JSON.stringify({ bands }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});