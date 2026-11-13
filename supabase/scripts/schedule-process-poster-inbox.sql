-- ============================================================
-- Programa process-poster-inbox con el Cron nativo de Supabase (pg_cron +
-- pg_net). Ejecutar manualmente en el SQL editor, DESPUÉS de
-- add-poster-inbox.sql y de desplegar la función.
--
-- Cada 2 minutos: aplica un cartel aprobado o analiza un póster nuevo del
-- bucket festival-posters-inbox (flujo completo en add-poster-inbox.sql).
-- Sin pósters pendientes, cada ejecución solo lista el bucket.
--
-- IMPORTANTE: sustituye <CRON_SECRET> por el valor real antes de
-- ejecutar, y NO guardes el fichero con el secreto puesto (pégalo
-- directamente en el SQL editor).
-- ============================================================

select cron.schedule(
  'process-poster-inbox-every-2-min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/process-poster-inbox',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para ver los jobs programados:
-- select jobname, schedule, active from cron.job;

-- Para borrar este job:
-- select cron.unschedule('process-poster-inbox-every-2-min');
