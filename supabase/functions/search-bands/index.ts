import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HEAVY_GENRE_REGEX =
  /metal|rock|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

let cachedToken: { value: string; expiresAt: number } | null = null;

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
  if (!res.ok) throw new Error(`Spotify token error: ${res.status}`);
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

// Obtener top tags de Last.fm para una banda
async function getLastfmTags(artistName: string): Promise<string[]> {
  try {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags` +
      `&artist=${encodeURIComponent(artistName)}` +
      `&api_key=${LASTFM_API_KEY}` +
      `&format=json&autocorrect=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.toptags?.tag ?? []).slice(0, 5).map((t: any) => t.name.toLowerCase());
  } catch {
    return [];
  }
}

function isHeavyByGenres(genres: string[]): boolean {
  if (genres.length === 0) return false;
  return genres.some((g) => HEAVY_GENRE_REGEX.test(g));
}

type Band = {
  spotify_id: string | null;
  name: string;
  image_url: string | null;
  genres: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'min 2 chars' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar primero en BD
    const { data: dbBands } = await admin
      .from('bands')
      .select('spotify_id, name, image_url, genres')
      .ilike('name', `${query}%`)
      .limit(20);

    // Deduplicar por nombre, preferir las que tienen spotify_id
    const dedup = new Map<string, Band>();
    for (const b of dbBands ?? []) {
      const key = b.name.toLowerCase();
      const existing = dedup.get(key);
      if (!existing || (!existing.spotify_id && b.spotify_id)) {
        dedup.set(key, b);
      }
    }
    const cachedBands = Array.from(dedup.values());

    // Si ya tenemos 5+ con spotify_id, basta con BD
    const withSpotifyId = cachedBands.filter((b) => b.spotify_id);
    if (withSpotifyId.length >= 5) {
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
        const queryLower = query.toLowerCase();

        // Filtrado preliminar: relevancia textual + top 5
        const candidates: Band[] = data.artists.items
          .map((artist: any) => ({
            spotify_id: artist.id,
            name: artist.name,
            image_url: artist.images?.[0]?.url ?? null,
            genres: artist.genres ?? [],
          }))
          .filter((b: Band) => {
            const nameLower = b.name.toLowerCase();
            return (
              nameLower.startsWith(queryLower) ||
              nameLower.includes(` ${queryLower}`) ||
              queryLower.startsWith(nameLower)
            );
          })
          .slice(0, 5);

        // 3. Cross-check con Last.fm para los que no tienen género heavy claro
        const validated = await Promise.all(
          candidates.map(async (cand) => {
            // Si Spotify ya nos dice que es heavy, aceptamos directo
            if (isHeavyByGenres(cand.genres)) {
              return cand;
            }

            // Si no, preguntamos a Last.fm
            const lastfmTags = await getLastfmTags(cand.name);

            // Combinar tags de Spotify + Last.fm para cacheo
            const allGenres = Array.from(new Set([...cand.genres, ...lastfmTags]));

            if (allGenres.some((g) => HEAVY_GENRE_REGEX.test(g))) {
              return { ...cand, genres: allGenres };
            }

            // Descartar: no es rock/metal/punk/etc
            console.log(`Descartado "${cand.name}": tags = ${JSON.stringify(allGenres)}`);
            return null;
          }),
        );

        const spotifyBands = validated.filter((b): b is Band => b !== null);

        // Mergear con BD
        for (const sb of spotifyBands) {
          const key = sb.name.toLowerCase();
          const existing = dedup.get(key);
          if (existing) {
            // Banda ya en cache, enriquecer con datos nuevos si los tenemos
            dedup.set(key, {
              ...existing,
              spotify_id: existing.spotify_id ?? sb.spotify_id,
              image_url: existing.image_url ?? sb.image_url,
              // Si los géneros nuevos son más completos, usarlos
              genres: sb.genres.length > existing.genres.length ? sb.genres : existing.genres,
            });
          } else {
            dedup.set(key, sb);
          }
        }

        // Cachear en BD las nuevas (con géneros enriquecidos)
        const toCache = spotifyBands.filter((b) => b.spotify_id);
        if (toCache.length > 0) {
          for (const b of toCache) {
            const { data: existing } = await admin
              .from('bands')
              .select('id, genres')
              .ilike('name', b.name)
              .maybeSingle();

            if (existing) {
              const mergedGenres = Array.from(new Set([...(existing.genres ?? []), ...b.genres]));
              await admin
                .from('bands')
                .update({
                  spotify_id: b.spotify_id,
                  image_url: b.image_url,
                  genres: mergedGenres,
                })
                .eq('id', existing.id);
            } else {
              await admin.from('bands').insert({
                spotify_id: b.spotify_id,
                name: b.name,
                image_url: b.image_url,
                genres: b.genres,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Spotify enrichment failed:', (err as Error).message);
    }

    return new Response(JSON.stringify({ bands: Array.from(dedup.values()), source: 'mixed' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
