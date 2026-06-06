import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get(
  'LASTFM_API_KEY',
)!;
const SPOTIFY_CLIENT_ID = Deno.env.get(
  'SPOTIFY_CLIENT_ID',
)!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get(
  'SPOTIFY_CLIENT_SECRET',
)!;
const SUPABASE_URL = Deno.env.get(
  'SUPABASE_URL',
)!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  'SUPABASE_SERVICE_ROLE_KEY',
)!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

let cachedSpotifyToken: {
  value: string;
  expiresAt: number;
} | null = null;

async function getSpotifyToken(): Promise<string> {
  if (
    cachedSpotifyToken &&
    cachedSpotifyToken.expiresAt > Date.now()
  ) {
    return cachedSpotifyToken.value;
  }
  const credentials = btoa(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
  );
  const res = await fetch(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
  );
  if (!res.ok)
    throw new Error(
      `Spotify token error: ${res.status}`,
    );
  const data = await res.json();
  cachedSpotifyToken = {
    value: data.access_token,
    expiresAt:
      Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedSpotifyToken.value;
}

async function getSimilarFromLastfm(
  artistName: string,
): Promise<string[]> {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.similarartists?.artist ?? []).map(
    (a: any) => a.name,
  );
}

type SpotifyArtistData = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

async function searchSpotifyArtist(
  name: string,
  token: string,
): Promise<SpotifyArtistData | null> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const artist = data.artists?.items?.[0];
  if (!artist) return null;
  if (
    artist.name.toLowerCase() !==
    name.toLowerCase()
  )
    return null;
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
    const authHeader = req.headers.get(
      'Authorization',
    );
    if (!authHeader)
      throw new Error(
        'Falta Authorization header',
      );

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user)
      throw new Error('Usuario no autenticado');

    const admin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    // 1. Bandas seguidas
    const { data: userBands, error: ubError } =
      await admin
        .from('user_bands')
        .select('band:bands(id, name)')
        .eq('user_id', user.id);
    if (ubError) throw ubError;

    const followedNames = new Set(
      (userBands ?? [])
        .map((ub: any) =>
          ub.band?.name?.toLowerCase(),
        )
        .filter(Boolean),
    );

    if (followedNames.size === 0) {
      return new Response(
        JSON.stringify({ recommendations: [] }),
        {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const followedArr = Array.from(
      followedNames,
    ) as string[];

    // 2. Last.fm en paralelo: todas las bandas a la vez
    const allSimilarLists = await Promise.all(
      followedArr.map((name) =>
        getSimilarFromLastfm(name),
      ),
    );

    // 3. Agregar y puntuar candidatos
    const candidateScores = new Map<
      string,
      number
    >();
    for (const similar of allSimilarLists) {
      for (const s of similar) {
        const key = s.toLowerCase();
        if (followedNames.has(key)) continue;
        candidateScores.set(
          key,
          (candidateScores.get(key) ?? 0) + 1,
        );
      }
    }

    // 4. Top 15 candidatos por score
    const topCandidates = Array.from(
      candidateScores.entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    // 5. Enriquecer con Spotify en paralelo
    const spotifyToken = await getSpotifyToken();
    const spotifyResults = await Promise.all(
      topCandidates.map((c) =>
        searchSpotifyArtist(c, spotifyToken),
      ),
    );

    const recommendations = spotifyResults.filter(
      (r): r is SpotifyArtistData => r !== null,
    );

    return new Response(
      JSON.stringify({ recommendations }),
      {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      },
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
