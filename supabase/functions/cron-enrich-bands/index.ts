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
// Cada banda puede costar ~0,5-0,8 s (Spotify + Last.fm + pausa): 150 bandas
// rozan los 150 s de una Edge Function. Pasado este tiempo no se empieza
// ninguna banda más; las que queden las coge la siguiente ejecución.
const TIME_BUDGET_MS = 90_000;

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

type PendingBand = { id: string; name: string; spotify_id: string | null; genres: string[] };

// Hay miles de bandas sin foto (seed por género, OCR de carteles...). Primero
// las que se ven en la app: las que alguien sigue, luego las de carteles de
// festival y de conciertos, y el resto después. Se usa un join !inner por
// nivel (no un .in() con miles de ids, que no cabe en la URL) y se deduplica.
async function loadPendingBands(
  admin: any,
  sevenDaysAgo: string,
): Promise<{ bands: PendingBand[]; priority: number }> {
  const tiers = ['user_bands', 'festival_bands', 'concert_bands', null];
  const picked = new Map<string, PendingBand>();
  let priority = 0;
  for (const embed of tiers) {
    if (embed === null) priority = picked.size;
    if (picked.size >= BATCH_SIZE) break;
    const { data, error } = await admin
      .from('bands')
      .select(
        embed
          ? `id, name, spotify_id, genres, ${embed}!inner(band_id)`
          : 'id, name, spotify_id, genres',
      )
      .is('image_url', null)
      .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`)
      .limit(BATCH_SIZE);
    if (error) {
      console.warn(`cron-enrich-bands: error cargando nivel ${embed ?? 'resto'}:`, error.message);
      continue;
    }
    for (const b of data ?? []) {
      if (picked.size >= BATCH_SIZE) break;
      if (!picked.has(b.id)) {
        picked.set(b.id, { id: b.id, name: b.name, spotify_id: b.spotify_id, genres: b.genres });
      }
    }
  }
  // Si el lote se llenó antes de llegar al nivel "resto", todo es prioritario.
  if (picked.size >= BATCH_SIZE && priority === 0) priority = picked.size;
  return { bands: [...picked.values()], priority };
}

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
    const { bands: pending, priority } = await loadPendingBands(admin, sevenDaysAgo);

    if (pending.length === 0) {
      return new Response(JSON.stringify({ message: 'Sin bandas pendientes', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = await getSpotifyToken();
    const startedAt = Date.now();
    const results = {
      total: pending.length,
      // Del lote, cuántas eran seguidas / de carteles / de conciertos.
      priority,
      enriched: 0,
      not_found: 0,
      rejected_genre: 0,
      errors: 0,
      rate_limited: false,
      stopped_by_time_budget: false,
      remaining: null as number | null,
    };

    for (const band of pending) {
      if (results.rate_limited) break;
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        results.stopped_by_time_budget = true;
        break;
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

    // Pendientes tras esta ejecución (mismo filtro que arriba), para vigilar si
    // la frecuencia del cron basta.
    const { count: remaining } = await admin
      .from('bands')
      .select('id', { count: 'exact', head: true })
      .is('image_url', null)
      .or(`enrichment_attempted_at.is.null,enrichment_attempted_at.lt.${sevenDaysAgo}`);
    results.remaining = remaining ?? null;

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
