import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Payload = {
  comment_id: string;
  reason?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header');

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Usuario no autenticado');

    const body = (await req.json()) as Payload;
    if (!body.comment_id) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: insertErr } = await admin
      .from('comment_reports')
      .insert({ comment_id: body.comment_id, reporter_id: user.id, reason: body.reason ?? null });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return new Response(JSON.stringify({ error: 'already_reported' }), {
          status: 409,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      throw insertErr;
    }

    const { data: reportCount, error: rpcErr } = await admin.rpc('increment_comment_report_count', {
      p_comment_id: body.comment_id,
    });
    if (rpcErr) throw rpcErr;

    return new Response(JSON.stringify({ report_count: reportCount }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
