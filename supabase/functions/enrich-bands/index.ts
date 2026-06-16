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
  /metal|rock|ska|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

const BATCH_SIZE = 50;
const SPOTIFY_DELAY_MS = 250;

// NUEVO: detector de imágenes "pobres" (Ticketmaster) que conviene sobreescribir
function isPoorImage(url: string | null): boolean {
  if (!url) return true;
  return /ticketm\.net|s1\.ticketm/i.test(url);
}

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
  const exact = items.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
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

// NUEVO: query base reutilizable - filtra pendientes (sin imagen O imagen de Ticketmaster)
// y que no se hayan intentado en los últimos 7 días
function buildPendingQuery(admin: any, sevenDaysAgo: string) {
  return admin
    .from('bands')
    .select('id, name, spotify_id, genres, image_url')
    .or('image_url.is.null,image_url.ilike.%ticketm.net%')
    .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const batchSize = parseInt(url.searchParams.get('batch') ?? `${BATCH_SIZE}`, 10);

    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // NUEVO: 1. IDs de bandas con festivales o conciertos próximos (prioritarias)
    const [{ data: priorityFest }, { data: priorityConc }] = await Promise.all([
      admin
        .from('festival_bands')
        .select('band_id, festival:festivals!inner(start_date)')
        .gte('festival.start_date', today),
      admin
        .from('concert_bands')
        .select('band_id, concert:concerts!inner(event_date)')
        .gte('concert.event_date', today),
    ]);

    const priorityIds = Array.from(
      new Set([
        ...(priorityFest ?? []).map((r: any) => r.band_id),
        ...(priorityConc ?? []).map((r: any) => r.band_id),
      ]),
    );

    // 2. Coger prioritarias primero
    let pending: any[] = [];
    if (priorityIds.length > 0) {
      const { data: priority } = await buildPendingQuery(admin, sevenDaysAgo)
        .in('id', priorityIds)
        .limit(batchSize);
      pending = priority ?? [];
    }

    // 3. Rellenar con el resto si queda hueco
    if (pending.length < batchSize) {
      const fill = batchSize - pending.length;
      const usedIds = pending.map((b) => b.id);
      let q = buildPendingQuery(admin, sevenDaysAgo).limit(fill);
      if (usedIds.length > 0) {
        q = q.not('id', 'in', `(${usedIds.join(',')})`);
      }
      const { data: rest } = await q;
      pending = [...pending, ...(rest ?? [])];
    }

    if (pending.length === 0) {
      return new Response(JSON.stringify({ message: 'Sin bandas pendientes', processed: 0 }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const token = await getSpotifyToken();
    const results = {
      total: pending.length,
      priority_count:
        priorityIds.length > 0 ? pending.filter((b) => priorityIds.includes(b.id)).length : 0,
      enriched: 0,
      not_found: 0,
      rejected_genre: 0,
      errors: 0,
    };

    let rateLimited = false;

    for (const band of pending) {
      if (rateLimited) {
        results.errors++;
        continue;
      }

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
          finalGenres.length > 0 && finalGenres.some((g) => HEAVY_GENRE_REGEX.test(g));

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
            console.log(`Rechazada "${band.name}": ${JSON.stringify(allGenres)}`);
            results.rejected_genre++;
            await sleep(SPOTIFY_DELAY_MS);
            continue;
          }

          finalGenres = allGenres;
        }

        // NUEVO: decidir si actualizar imagen
        // Sobreescribimos si la actual era pobre (null o de Ticketmaster) y Spotify trae una
        const shouldUpdateImage = spotifyData.image_url && isPoorImage(band.image_url);

        const updatePayload: any = {
          spotify_id: spotifyData.spotify_id,
          genres: finalGenres,
          enrichment_attempted_at: new Date().toISOString(),
          enrichment_found: true,
        };
        if (shouldUpdateImage) {
          updatePayload.image_url = spotifyData.image_url;
        }

        await admin.from('bands').update(updatePayload).eq('id', band.id);

        results.enriched++;
        await sleep(SPOTIFY_DELAY_MS);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.startsWith('SPOTIFY_RATE_LIMITED')) {
          console.warn(`Rate limited: ${msg}, parando batch`);
          rateLimited = true;
        } else {
          console.warn(`Error en "${band.name}": ${msg}`);
          results.errors++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ...results,
        rate_limited: rateLimited,
        remaining: rateLimited ? '?' : 'check db',
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
