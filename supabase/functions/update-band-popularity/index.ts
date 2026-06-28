import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 100; // bandas por invocación
const STALE_DAYS = 30;
const DELAY_MS = 220; // Last.fm rate limit ~5 req/seg

async function getLastfmInfo(artistName: string): Promise<{
  listeners: number | null;
  playcount: number | null;
  notFound: boolean;
}> {
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&api_key=${LASTFM_API_KEY}` +
    `&format=json&autocorrect=1`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) throw new Error('LASTFM_RATE_LIMITED');
    return { listeners: null, playcount: null, notFound: true };
  }
  const data = await res.json();
  if (data.error || !data.artist) {
    return { listeners: null, playcount: null, notFound: true };
  }
  const listeners = data.artist.stats?.listeners ? parseInt(data.artist.stats.listeners, 10) : null;
  const playcount = data.artist.stats?.playcount ? parseInt(data.artist.stats.playcount, 10) : null;
  return {
    listeners: Number.isFinite(listeners) ? listeners : null,
    playcount: Number.isFinite(playcount) ? playcount : null,
    notFound: false,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const batchSize = parseInt(url.searchParams.get('batch') ?? `${BATCH_SIZE}`, 10);

    const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Coger bandas sin listeners o con listeners caducados
    const { data: bands, error } = await admin
      .from('bands')
      .select('id, name')
      .or(`listeners_updated_at.is.null,listeners_updated_at.lt.${staleCutoff}`)
      .order('listeners_updated_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (error) throw error;

    const totals = {
      processed: 0,
      updated: 0,
      not_found: 0,
      errors: 0,
      rate_limited: false,
      done: false,
    };

    if (!bands || bands.length === 0) {
      totals.done = true;
      return new Response(JSON.stringify(totals), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    totals.processed = bands.length;

    for (const band of bands) {
      try {
        const info = await getLastfmInfo(band.name);
        const now = new Date().toISOString();

        await admin
          .from('bands')
          .update({
            lastfm_listeners: info.listeners,
            lastfm_playcount: info.playcount,
            listeners_updated_at: now,
          })
          .eq('id', band.id);

        if (info.notFound || info.listeners === null) {
          totals.not_found++;
        } else {
          totals.updated++;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === 'LASTFM_RATE_LIMITED') {
          totals.rate_limited = true;
          break;
        }
        totals.errors++;
      }
    }

    return new Response(JSON.stringify(totals), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
