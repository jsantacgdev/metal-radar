import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Carteles de festival subidos desde el PC (sin usar el móvil):
//   1. El admin sube el póster al bucket privado festival-posters-inbox.
//   2. Esta función (cron cada 2 min) lo analiza con parse-festival-poster y
//      deja el resultado en poster_imports + poster_import_bands
//      (status 'pending_review') para revisarlo en el Table Editor.
//   3. Cuando el admin pone status = 'approved', lo guarda con
//      commit-festival-from-poster (póster incluido).
// Detalles del flujo: supabase/scripts/add-poster-inbox.sql.
//
// Cada ejecución hace como mucho UNA operación pesada (aplicar uno aprobado,
// con prioridad, o analizar un póster nuevo): cada una puede tardar más de
// un minuto y la función tiene 150 s.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const INBOX_BUCKET = 'festival-posters-inbox';
const LOCK_NAME = 'process-poster-inbox';
const CALL_TIMEOUT_MS = 120_000;
const STUCK_AFTER_MS = 10 * 60 * 1000;
const SIGNED_URL_SECONDS = 600;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function isoDateOrNull(s: unknown): string | null {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Llama a otra Edge Function del proyecto como llamada interna (CRON_SECRET).
async function callFunction(name: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error ?? data.message ?? `${name}: HTTP ${res.status}`);
  }
  return data;
}

async function signedUrl(admin: any, path: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(INBOX_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`No se pudo firmar la URL del póster: ${error?.message ?? 'sin URL'}`);
  }
  return data.signedUrl;
}

// Analiza un póster nuevo y deja el resultado para revisar.
async function parseImport(admin: any, importId: string, path: string) {
  const parsed = await callFunction('parse-festival-poster', {
    imageUrl: await signedUrl(admin, path),
  });
  const f = parsed.festival ?? {};

  const action = f.existing_festival_id
    ? `Actualizar el festival existente (${f.name ?? 'sin nombre'}, ${f.year ?? 'año ?'})`
    : f.previous_edition
      ? `Nueva edición de ${f.previous_edition.name} (anterior: ${f.previous_edition.year ?? '?'})`
      : 'Festival nuevo';

  const bands = (parsed.bands ?? []).map((b: any, i: number) => ({
    import_id: importId,
    position: i + 1,
    name: String(b.extracted_name ?? '').trim(),
    tier: ['headliner', 'subheadliner', 'lineup'].includes(b.tier) ? b.tier : 'lineup',
    exists_in_db: !!b.matched_band_id,
    matched_band_id: b.matched_band_id ?? null,
    matched_band_name: b.matched_band_name ?? null,
  }));
  const validBands = bands.filter((b: any) => b.name);
  if (validBands.length > 0) {
    const { error } = await admin.from('poster_import_bands').insert(validBands);
    if (error) throw error;
  }

  const { error } = await admin
    .from('poster_imports')
    .update({
      status: 'pending_review',
      action,
      festival_name: f.name ?? null,
      start_date: isoDateOrNull(f.start_date),
      end_date: isoDateOrNull(f.end_date),
      venue_name: f.venue_name ?? null,
      city: f.city ?? null,
      country: f.country ?? null,
      existing_festival_id: f.existing_festival_id ?? null,
      existing_venue_id: f.existing_venue_id ?? null,
      error: validBands.length === 0 ? 'No se ha leído ninguna banda del póster' : null,
    })
    .eq('id', importId);
  if (error) throw error;
}

// Guarda un cartel aprobado con commit-festival-from-poster.
async function commitImport(admin: any, imp: any) {
  if (!imp.festival_name) throw new Error('Falta festival_name');

  const { data: rows, error } = await admin
    .from('poster_import_bands')
    .select('name, tier, include, matched_band_id')
    .eq('import_id', imp.id)
    .order('position');
  if (error) throw error;
  const included = (rows ?? []).filter((b: any) => b.include && String(b.name ?? '').trim());
  if (included.length === 0) throw new Error('No hay ninguna banda con include = true');

  let imageUrl: string | undefined;
  try {
    imageUrl = await signedUrl(admin, imp.storage_path);
  } catch {
    // Sin URL se guarda igual, solo que sin póster.
  }

  return await callFunction('commit-festival-from-poster', {
    festival: {
      id: imp.existing_festival_id,
      name: imp.festival_name,
      start_date: imp.start_date,
      end_date: imp.end_date,
      venue: {
        id: imp.existing_venue_id,
        name: imp.venue_name,
        city: imp.city,
        country: imp.country,
        lat: null,
        lng: null,
      },
    },
    bands: included.map((b: any) => ({
      name: String(b.name).trim(),
      matched_band_id: b.matched_band_id,
      tier: b.tier,
    })),
    imageUrl,
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Que dos ejecuciones no cojan el mismo póster (ver add-cron-lock.sql).
  const { data: gotLock } = await admin.rpc('try_acquire_cron_lock', {
    p_name: LOCK_NAME,
    p_duration_seconds: 150,
  });
  if (!gotLock) return json({ skipped: true, reason: 'already running' });

  try {
    // 0) Filas que se quedaron a medias (la función se cortó).
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
    await admin
      .from('poster_imports')
      .update({
        status: 'error',
        error: 'Se interrumpió el análisis. Borra la fila para volver a analizar el póster.',
      })
      .eq('status', 'processing')
      .lt('updated_at', stuckBefore);
    await admin
      .from('poster_imports')
      .update({
        status: 'error',
        error:
          'Se interrumpió al aplicar. Comprueba si el festival se guardó antes de volver a aprobar.',
      })
      .eq('status', 'committing')
      .lt('updated_at', stuckBefore);

    // 1) Aplicar un cartel aprobado (prioridad: el admin está esperando).
    const { data: approved, error: apprErr } = await admin
      .from('poster_imports')
      .select('*')
      .eq('status', 'approved')
      .order('updated_at')
      .limit(1);
    if (apprErr) throw apprErr;
    const imp = approved?.[0];
    if (imp) {
      const { data: claimed } = await admin
        .from('poster_imports')
        .update({ status: 'committing', error: null })
        .eq('id', imp.id)
        .eq('status', 'approved')
        .select('id');
      if (claimed?.length) {
        try {
          const result = await commitImport(admin, imp);
          await admin.from('poster_imports').update({ status: 'done', result }).eq('id', imp.id);
          return json({ committed: imp.festival_name, result });
        } catch (err) {
          const message = (err as Error).message;
          await admin
            .from('poster_imports')
            .update({ status: 'error', error: message })
            .eq('id', imp.id);
          return json({ commit_error: imp.festival_name, error: message });
        }
      }
    }

    // 2) Analizar el póster nuevo más antiguo de la raíz del bucket.
    const { data: objects, error: listErr } = await admin.storage
      .from(INBOX_BUCKET)
      .list('', { limit: 200, sortBy: { column: 'created_at', order: 'asc' } });
    if (listErr) throw listErr;
    // Las carpetas vienen con id null: solo se procesan ficheros de la raíz.
    const files: string[] = (objects ?? [])
      .filter((o: any) => o.id && IMAGE_RE.test(o.name))
      .map((o: any) => o.name);
    if (files.length === 0) return json({ idle: true });

    const { data: known, error: knownErr } = await admin
      .from('poster_imports')
      .select('storage_path')
      .in('storage_path', files);
    if (knownErr) throw knownErr;
    const knownSet = new Set((known ?? []).map((k: any) => k.storage_path));
    const pending = files.filter((name) => !knownSet.has(name));
    if (pending.length === 0) return json({ idle: true });

    const path = pending[0];
    const { data: row, error: insErr } = await admin
      .from('poster_imports')
      .insert({ storage_path: path, status: 'processing' })
      .select('id')
      .single();
    if (insErr) {
      // 23505: otra ejecución ya lo cogió.
      if (insErr.code === '23505') return json({ skipped: path });
      throw insErr;
    }

    try {
      await parseImport(admin, row.id, path);
      return json({ parsed: path, remaining: pending.length - 1 });
    } catch (err) {
      const message = (err as Error).message;
      await admin
        .from('poster_imports')
        .update({ status: 'error', error: message })
        .eq('id', row.id);
      return json({ parse_error: path, error: message, remaining: pending.length - 1 });
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  } finally {
    await admin.rpc('release_cron_lock', { p_name: LOCK_NAME });
  }
});
