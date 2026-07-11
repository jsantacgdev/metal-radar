-- ============================================================
-- FASE 1 — Follow entre usuarios, privacidad, perfil público
-- Ejecutar manualmente en Supabase Studio / SQL editor (mismo
-- criterio que add-username.sql: sin framework de migraciones).
--
-- IMPORTANTE: antes de aplicar, abrir el editor de políticas de
-- Supabase Studio y confirmar el texto exacto de las políticas RLS
-- actuales de `profiles` (no se ha podido leer desde el repo).
-- ============================================================

create type follow_status as enum ('pending', 'accepted');

-- Nota de diseño: los FKs apuntan a `profiles(id)` (no a `auth.users(id)`
-- directamente) para que PostgREST pueda embeber `profiles` en los
-- selects de user_follows (`profiles!user_follows_follower_id_fkey(...)`).
-- Esto asume que `profiles.id` ya referencia `auth.users(id) on delete
-- cascade` (patrón estándar de Supabase de un perfil 1:1 por usuario) —
-- verificar en Studio antes de aplicar; si no es así, el borrado de
-- cuenta (delete-account) dejaría de limpiar user_follows.
create table user_follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  status follow_status not null default 'accepted',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index user_follows_followee_idx on user_follows (followee_id, status);
create index user_follows_follower_idx on user_follows (follower_id, status);

alter table profiles add column if not exists is_private boolean not null default false;

alter table user_follows enable row level security;

-- Crear la tabla no concede privilegios a los roles de Supabase por sí
-- solo — RLS solo restringe filas dentro de lo que el GRANT ya permite.
-- Si el proyecto tiene configurado `alter default privileges` para el
-- schema public (habitual en proyectos Supabase, y probablemente el
-- motivo de que tablas como user_bands funcionen sin GRANT explícito
-- en ningún script de este repo), esto sería redundante pero inofensivo.
-- Solo `authenticated`: no hay caso de uso anónimo para follows.
grant select, insert, update, delete on user_follows to authenticated;

create policy user_follows_select on user_follows
  for select
  using (auth.uid() = follower_id or auth.uid() = followee_id);

create policy user_follows_insert on user_follows
  for insert
  with check (auth.uid() = follower_id);

-- Solo el followee puede aceptar una solicitud pendiente (y solo puede
-- ponerla a 'accepted', nunca reescribir a otro estado).
create policy user_follows_update on user_follows
  for update
  using (auth.uid() = followee_id)
  with check (auth.uid() = followee_id and status = 'accepted');

-- Cubre unfollow, cancelar solicitud propia, rechazar solicitud ajena
-- y "quitar seguidor" con una sola regla.
create policy user_follows_delete on user_follows
  for delete
  using (auth.uid() = follower_id or auth.uid() = followee_id);
