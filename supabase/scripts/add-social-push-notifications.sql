-- ============================================================
-- Notificaciones push para eventos sociales (solicitud de
-- seguimiento, nuevo seguidor, respuesta a un comentario).
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
--
-- Estas columnas de "notificado en" son la cola de trabajo de la
-- Edge Function `notify-social` (mismo patrón que `notifications_sent`
-- para conciertos, pero como columna directa en la fila en vez de una
-- tabla aparte, porque aquí cada fila solo necesita notificarse una
-- vez por transición de estado, no una vez por usuario destinatario).
-- ============================================================

alter table user_follows add column if not exists request_notified_at timestamptz;
alter table user_follows add column if not exists accepted_notified_at timestamptz;
alter table comments add column if not exists reply_notified_at timestamptz;
