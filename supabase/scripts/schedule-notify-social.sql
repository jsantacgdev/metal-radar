-- ============================================================
-- Programa notify-social con el Cron nativo de Supabase (pg_cron +
-- pg_net). Ejecutar manualmente en Supabase Studio / SQL editor,
-- SOLO si notify-day-before/cron-sync-all ya están programados así
-- (Database > Extensions debe tener pg_cron y pg_net activados).
--
-- IMPORTANTE: sustituye <project-ref> y <CRON_SECRET> por los valores
-- reales antes de ejecutar — y NO subas este fichero a git con el
-- secreto ya puesto (mejor pegarlo directamente en el SQL editor sin
-- guardar el reemplazo en el repo, o usar Supabase Vault en vez de
-- hardcodear el secreto aquí).
-- ============================================================

select cron.schedule(
  'notify-social-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-social',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para ver los jobs programados:
-- select * from cron.job;

-- Para borrar este job si algo sale mal:
-- select cron.unschedule('notify-social-every-30-min');
