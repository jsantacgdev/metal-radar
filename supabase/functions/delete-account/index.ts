import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const unauthorized = () =>
  new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return unauthorized();

    // Validar JWT del usuario que pide borrar
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return unauthorized();

    const userId = user.id;
    console.log(`[delete-account] Starting deletion for user ${userId}`);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Borrar fotos del Storage (no cascadea automáticamente)
    try {
      const { data: files, error: listError } = await admin.storage
        .from('concert-photos')
        .list(userId, { limit: 1000 });

      if (listError) {
        console.warn('[delete-account] List storage error:', listError.message);
      } else if (files && files.length > 0) {
        // Recopilamos los paths de todas las subcarpetas (user_id/user_concert_id/foto.jpg)
        const allPaths: string[] = [];

        for (const folder of files) {
          const { data: subFiles } = await admin.storage
            .from('concert-photos')
            .list(`${userId}/${folder.name}`, { limit: 100 });

          if (subFiles) {
            for (const f of subFiles) {
              allPaths.push(`${userId}/${folder.name}/${f.name}`);
            }
          }
        }

        if (allPaths.length > 0) {
          const { error: removeError } = await admin.storage
            .from('concert-photos')
            .remove(allPaths);

          if (removeError) {
            console.warn('[delete-account] Remove storage error:', removeError.message);
          } else {
            console.log(`[delete-account] Removed ${allPaths.length} photos`);
          }
        }
      }
    } catch (storageErr) {
      console.warn('[delete-account] Storage cleanup error:', (storageErr as Error).message);
      // No abortamos: si las fotos quedan huérfanas no es crítico
    }

    // 2. Borrar el usuario de auth.users → cascadea a profiles, user_bands, user_concerts,
    //    concert_photos, notifications_sent
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    console.log(`[delete-account] User ${userId} deleted successfully`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
