import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const HEAVY_GENRE_REGEX =
  /metal|rock|ska|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

const BATCH_SIZE = 150;
const SPOTIFY_DELAY_MS = 200;

let cachedToken: { value: string; expiresAt: number } | null = null;

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita diacríticos
    .replace(/[^\w\s]/g, '') // quita símbolos ($, ', ., etc.)
    .replace(/\s+/g, ' ')
    .trim();
}

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

async function searchSpotifyArtist(name: string, token: string) {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    throw new Error(`SPOTIFY_RATE_LIMITED:${retryAfter}`);
  }
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.artists?.items ?? [];
  const target = normalizeName(name);
  const exact = items.find((a: any) => normalizeName(a.name) === target);
  if (!exact) return null;
  return {
    spotify_id: exact.id,
    image_url: exact.images?.[0]?.url ?? null,
    genres: exact.genres ?? [],
  };
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pending } = await admin
      .from('bands')
      .select('id, name, spotify_id, genres')
      .is('image_url', null)
      .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`)
      .limit(BATCH_SIZE);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ message: 'Sin bandas pendientes', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = await getSpotifyToken();
    const results = {
      total: pending.length,
      enriched: 0,
      not_found: 0,
      rejected_genre: 0,
      errors: 0,
      rate_limited: false,
    };

    for (const band of pending) {
      if (results.rate_limited) break;

      try {
        const spotifyData = await searchSpotifyArtist(band.name, token);

        if (!spotifyData) {
          await admin
            .from('bands')
            .update({
              enrichment_attempted_at: new Date().toISOString(),
              enrichment_found: false,
            })
            .eq('id', band.id);
          results.not_found++;
          await sleep(SPOTIFY_DELAY_MS);
          continue;
        }

        let finalGenres = spotifyData.genres;
        const spotifyIsHeavy =
          finalGenres.length > 0 && finalGenres.some((g: string) => HEAVY_GENRE_REGEX.test(g));

        if (!spotifyIsHeavy) {
          const lastfmTags = await getLastfmTags(band.name);
          const allGenres = Array.from(new Set([...spotifyData.genres, ...lastfmTags]));
          const passesGenre = allGenres.some((g) => HEAVY_GENRE_REGEX.test(g));

          if (!passesGenre) {
            await admin
              .from('bands')
              .update({
                enrichment_attempted_at: new Date().toISOString(),
                enrichment_found: false,
                genres: allGenres,
              })
              .eq('id', band.id);
            results.rejected_genre++;
            await sleep(SPOTIFY_DELAY_MS);
            continue;
          }
          finalGenres = allGenres;
        }

        await admin
          .from('bands')
          .update({
            spotify_id: spotifyData.spotify_id,
            image_url: spotifyData.image_url,
            genres: finalGenres,
            enrichment_attempted_at: new Date().toISOString(),
            enrichment_found: true,
          })
          .eq('id', band.id);

        results.enriched++;
        await sleep(SPOTIFY_DELAY_MS);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.startsWith('SPOTIFY_RATE_LIMITED')) {
          console.warn(`Rate limited: ${msg}`);
          results.rate_limited = true;
        } else {
          results.errors++;
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
