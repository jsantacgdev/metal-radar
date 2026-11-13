-- ============================================================
-- Programa la fuente nueva de conciertos con el Cron nativo de Supabase
-- (pg_cron + pg_net). Ejecutar manualmente en el SQL editor, DESPUÉS de
-- add-concert-sources.sql y de desplegar la función.
--
--   * sync-ticketmaster-europe: cada 30 min, una o varias páginas de 50
--     conciertos de metal (18 países, rotando).
--     (cron-sync-all va a las :00 y cron-enrich-bands a las :30.)
--
-- IMPORTANTE: sustituye <CRON_SECRET> por el valor real antes de
-- ejecutar, y NO guardes el fichero con el secreto puesto (pégalo
-- directamente en el SQL editor).
-- ============================================================

select cron.schedule(
  'sync-ticketmaster-europe-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/sync-ticketmaster-europe',
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

-- Para desprogramarla:
-- select cron.unschedule('sync-ticketmaster-europe-every-30-min');

-- sync-bandsintown se descartó el 2026-11-13 (403 desde Supabase). Si
-- llegaste a programarla con la versión anterior de este script:
-- select cron.unschedule('sync-bandsintown-hourly');
