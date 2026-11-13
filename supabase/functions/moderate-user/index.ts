import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const unauthorized = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

type Duration = '24h' | '7d' | 'permanent';
type Payload = { user_id: string; action: 'ban' | 'unban'; duration?: Duration };

// admin.auth.admin.updateUserById(ban_duration) solo bloquea inicios de
// sesión/refresh NUEVOS — un access token ya emitido sigue siendo válido
// hasta que caduque por sí solo. profiles.banned_until (comprobado en el
// cliente vía useAuth) es lo que corta una sesión ya abierta al momento.
const BAN_DURATION: Record<Duration, string> = {
  '24h': '24h',
  '7d': '168h',
  permanent: '87600h',
};
const BAN_HOURS: Record<Duration, number> = {
  '24h': 24,
  '7d': 168,
  permanent: 87600,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return unauthorized();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Payload;
    if (!body.user_id || (body.action !== 'ban' && body.action !== 'unban')) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (body.user_id === user.id) {
      return new Response(JSON.stringify({ error: 'cannot_ban_self' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'ban') {
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', body.user_id)
        .single();
      if (targetProfile?.role === 'admin') {
        return new Response(JSON.stringify({ error: 'cannot_ban_admin' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const duration = body.duration ?? '24h';
      const bannedUntil = new Date(Date.now() + BAN_HOURS[duration] * 60 * 60 * 1000).toISOString();

      const { error: authErr } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: BAN_DURATION[duration],
      });
      if (authErr) throw authErr;

      const { error: profileErr } = await admin
        .from('profiles')
        .update({ banned_until: bannedUntil })
        .eq('id', body.user_id);
      if (profileErr) throw profileErr;

      // El baneo ya es la sanción — limpiar los reportes pendientes de este usuario.
      const { error: reportsErr } = await admin
        .from('user_reports')
        .delete()
        .eq('reported_id', body.user_id);
      if (reportsErr) throw reportsErr;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // action === 'unban'
    const { error: authErr } = await admin.auth.admin.updateUserById(body.user_id, {
      ban_duration: 'none',
    });
    if (authErr) throw authErr;

    const { error: profileErr } = await admin
      .from('profiles')
      .update({ banned_until: null })
      .eq('id', body.user_id);
    if (profileErr) throw profileErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
