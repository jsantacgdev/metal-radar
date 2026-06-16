import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getBandMembers(bandName: string, mbid: string | null): Promise<string[]> {
  try {
    let artistId = mbid;

    if (!artistId) {
      const searchUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(
        `artist:"${bandName}" AND type:group`,
      )}&fmt=json&limit=1`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)' },
      });
      if (!searchRes.ok) return [];
      const searchData = await searchRes.json();
      artistId = searchData.artists?.[0]?.id ?? null;
      if (!artistId) return [];
    }

    const relUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?inc=artist-rels&fmt=json`;
    const relRes = await fetch(relUrl, {
      headers: { 'User-Agent': 'MetalRadar/1.0 (contacto: jsantacgdev@gmail.com)' },
    });
    if (!relRes.ok) return [];
    const relData = await relRes.json();

    const members: string[] = [];
    for (const rel of relData.relations ?? []) {
      const name = rel?.artist?.name;
      if (rel?.type === 'member of band' && typeof name === 'string' && name.trim().length > 0) {
        members.push(name.trim());
      }
    }
    return members;
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    // Valida el JWT pero usa service role para escribir
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    const body = await req.json();
    const bandIds: string[] = body.band_ids ?? [];
    if (bandIds.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cargar las bandas con su MBID
    const { data: bands } = await admin
      .from('bands')
      .select('id, name, musicbrainz_mbid')
      .in('id', bandIds);

    if (!bands || bands.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Secuencial con 1.1s entre llamadas (rate limit MusicBrainz)
    let processed = 0;
    for (const b of bands) {
      const members = await getBandMembers(b.name, b.musicbrainz_mbid);
      await admin
        .from('bands')
        .update({
          member_names: members,
          members_fetched_at: new Date().toISOString(),
        })
        .eq('id', b.id);
      processed++;
      await new Promise((r) => setTimeout(r, 1100));
    }

    console.log(`[prewarm] Cached members for ${processed} bands`);

    return new Response(JSON.stringify({ processed }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
