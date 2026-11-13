-- ============================================================
-- Programa las dos fuentes nuevas de conciertos con el Cron nativo de
-- Supabase (pg_cron + pg_net). Ejecutar manualmente en el SQL editor,
-- DESPUÉS de add-concert-sources.sql y de desplegar las funciones.
--
--   * sync-ticketmaster-europe: cada 30 min, una o varias páginas de 50
--     conciertos de metal (18 países, rotando).
--   * sync-bandsintown: cada hora a los :45, hasta 10 bandas seguidas por
--     pasada; cada banda como mucho una vez al día.
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

select cron.schedule(
  'sync-bandsintown-hourly',
  '45 * * * *',
  $$
  select net.http_post(
    url := 'https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/sync-bandsintown',
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

-- Si Bandsintown bloquea las peticiones (la función devuelve "blocked"),
-- desprogramarla:
-- select cron.unschedule('sync-bandsintown-hourly');
-- select cron.unschedule('sync-ticketmaster-europe-every-30-min');
