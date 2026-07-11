-- ============================================================
-- FASE 0 — Username único (interacción social)
-- Ejecutar manualmente en Supabase Studio / SQL editor, siguiendo
-- la convención de este proyecto de no usar un framework de
-- migraciones (ver festivals-2026.sql).
-- ============================================================

alter table profiles add column if not exists username text;

alter table profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists profiles_username_unique
  on profiles (lower(username));
-- Nota: Postgres no soporta "ADD CONSTRAINT ... IF NOT EXISTS", así que
-- si se re-ejecuta este script tras un fallo a mitad, comprobar antes en
-- Studio si `profiles_username_format` ya existe (y omitir esa sentencia).

-- Lectura pública limitada: necesaria para comprobar disponibilidad
-- de username (esta Fase) y para la búsqueda de usuarios (Fase 1).
-- Las políticas RLS son permisivas y se combinan con OR, así que esto
-- se suma a la política existente de "solo mi propia fila" sin
-- reemplazarla. IMPORTANTE: verificar en Studio el texto exacto de
-- las políticas actuales de `profiles` antes de aplicar esto — si ya
-- existe una política de select pública equivalente, no duplicar.
--
-- Los hooks del cliente deben seguir seleccionando solo columnas no
-- sensibles (id, username, display_name, avatar_url) al leer la fila
-- de OTRO usuario; nunca home_lat/home_lng/push_token/role.
drop policy if exists profiles_public_username_select on profiles;
create policy profiles_public_username_select
  on profiles for select
  using (true);
