import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HEAVY_GENRE_REGEX =
  /metal|rock|ska|hardcore|punk|metalcore|deathcore|grunge|emo|screamo|thrash|doom|sludge|stoner|industrial|gothic|prog|alternative|nu.?metal|post.?punk|psychedelic|garage|indie/i;

const BATCH_SIZE = 50;
const SPOTIFY_DELAY_MS = 250;

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
    popularity: typeof exact.popularity === 'number' ? exact.popularity : null,
  };
}

async function getLastfmInfo(artistName: string): Promise<{
  tags: string[];
  listeners: number | null;
  playcount: number | null;
}> {
  try {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo` +
      `&artist=${encodeURIComponent(artistName)}` +
      `&api_key=${LASTFM_API_KEY}` +
      `&format=json&autocorrect=1`;
    const res = await fetch(url);
    if (!res.ok) return { tags: [], listeners: null, playcount: null };
    const data = await res.json();
    const artist = data.artist;
    if (!artist) return { tags: [], listeners: null, playcount: null };

    const tags = (artist.tags?.tag ?? []).slice(0, 5).map((t: any) => t.name.toLowerCase());
    const listeners = artist.stats?.listeners ? parseInt(artist.stats.listeners, 10) : null;
    const playcount = artist.stats?.playcount ? parseInt(artist.stats.playcount, 10) : null;

    return {
      tags,
      listeners: Number.isFinite(listeners) ? listeners : null,
      playcount: Number.isFinite(playcount) ? playcount : null,
    };
  } catch {
    return { tags: [], listeners: null, playcount: null };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildPendingQuery(admin: any, sevenDaysAgo: string) {
  return admin
    .from('bands')
    .select('id, name, spotify_id, genres, image_url')
    .or('image_url.is.null,image_url.ilike.%ticketm.net%')
    .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const batchSize = Math.min(parseInt(url.searchParams.get('batch') ?? `${BATCH_SIZE}`, 10), 200);

    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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

    let pending: any[] = [];
    if (priorityIds.length > 0) {
      const { data: priority } = await buildPendingQuery(admin, sevenDaysAgo)
        .in('id', priorityIds)
        .limit(batchSize);
      pending = priority ?? [];
    }

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
        const lastfm = await getLastfmInfo(band.name);

        const spotifyData = await searchSpotifyArtist(band.name, token);

        if (!spotifyData) {
          await admin
            .from('bands')
            .update({
              enrichment_attempted_at: new Date().toISOString(),
              enrichment_found: false,
              lastfm_listeners: lastfm.listeners,
              lastfm_playcount: lastfm.playcount,
              listeners_updated_at: new Date().toISOString(),
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
          const allGenres = Array.from(new Set([...spotifyData.genres, ...lastfm.tags]));
          const passesGenre = allGenres.some((g) => HEAVY_GENRE_REGEX.test(g));

          if (!passesGenre) {
            await admin
              .from('bands')
              .update({
                enrichment_attempted_at: new Date().toISOString(),
                enrichment_found: false,
                genres: allGenres,
                lastfm_listeners: lastfm.listeners,
                lastfm_playcount: lastfm.playcount,
                listeners_updated_at: new Date().toISOString(),
              })
              .eq('id', band.id);
            console.log(`Rechazada "${band.name}": ${JSON.stringify(allGenres)}`);
            results.rejected_genre++;
            await sleep(SPOTIFY_DELAY_MS);
            continue;
          }

          finalGenres = allGenres;
        }

        const shouldUpdateImage = spotifyData.image_url && isPoorImage(band.image_url);

        const updatePayload: any = {
          spotify_id: spotifyData.spotify_id,
          genres: finalGenres,
          enrichment_attempted_at: new Date().toISOString(),
          enrichment_found: true,
          spotify_popularity: spotifyData.popularity,
          popularity_updated_at: new Date().toISOString(),
          lastfm_listeners: lastfm.listeners,
          lastfm_playcount: lastfm.playcount,
          listeners_updated_at: new Date().toISOString(),
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
