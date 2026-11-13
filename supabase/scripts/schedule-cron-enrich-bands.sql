-- ============================================================
-- Programa cron-enrich-bands con el Cron nativo de Supabase (pg_cron +
-- pg_net). Ejecutar manualmente en el SQL editor.
--
-- Hasta el 2026-11-13 esta función no estaba programada: las bandas
-- creadas sin foto (OCR de carteles, seed de festivales) solo se
-- enriquecían cuando alguien abría su ficha (band-info). En carteles,
-- mapa y radar salían sin imagen.
--
-- Cada hora a los :30, para no coincidir con cron-sync-all (a las :00).
-- Cada ejecución procesa hasta 150 bandas o 90 s; la respuesta incluye
-- "remaining" (pendientes que quedan).
--
-- IMPORTANTE: sustituye <CRON_SECRET> por el valor real antes de
-- ejecutar, y NO guardes el fichero con el secreto puesto (pégalo
-- directamente en el SQL editor).
-- ============================================================

select cron.schedule(
  'cron-enrich-bands-hourly',
  '30 * * * *',
  $$
  select net.http_post(
    url := 'https://vzghxgfrxqwuxwmnretm.supabase.co/functions/v1/cron-enrich-bands',
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

-- Para borrar este job si algo sale mal:
-- select cron.unschedule('cron-enrich-bands-hourly');
