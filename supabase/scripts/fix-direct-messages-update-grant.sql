-- ============================================================
-- Cierra un hueco de RLS en direct_messages: la policy de UPDATE
-- solo comprobaba `auth.uid() = recipient_id`, sin restringir qué
-- columnas se pueden tocar. Cualquier destinatario podía reescribir
-- `body`/`sender_id` de un mensaje ya recibido.
--
-- La forma correcta en Postgres es un GRANT a nivel de columna, no
-- más lógica en la policy: revocamos UPDATE de toda la tabla y solo
-- lo concedemos sobre `read_at`, que es la única columna que el
-- cliente (useDirectMessages.ts, markRead) actualiza de verdad.
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
-- ============================================================

revoke update on direct_messages from authenticated;
grant update (read_at) on direct_messages to authenticated;
