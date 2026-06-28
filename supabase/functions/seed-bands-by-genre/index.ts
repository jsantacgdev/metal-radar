import { createClient } from 'jsr:@supabase/supabase-js@2';

const LASTFM_API_KEY = Deno.env.get('LASTFM_API_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { tag, limit = 500 } = await req.json();
  if (!tag) {
    return new Response(JSON.stringify({ error: 'tag required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();

  const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(
    tag,
  )}&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    return new Response(
      JSON.stringify({
        error: 'lastfm failed',
        status: res.status,
        body: await res.text(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const data = await res.json();
  const artists = data.topartists?.artist ?? [];

  const candidates = artists
    .map((a: any) => ({
      name: (a.name ?? '').trim(),
      mbid: (a.mbid ?? '').trim() || null,
    }))
    .filter((c: any) => c.name.length > 0);

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({
        tag,
        fetched: 0,
        inserted: 0,
        updated: 0,
        elapsed_ms: Date.now() - startTime,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: result, error } = await supabase.rpc('seed_bands_batch', {
    p_bands: candidates,
    p_genre: tag,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stats = result?.[0] ?? { inserted: 0, updated: 0 };

  return new Response(
    JSON.stringify({
      tag,
      fetched: candidates.length,
      inserted: stats.inserted,
      updated: stats.updated,
      elapsed_ms: Date.now() - startTime,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
