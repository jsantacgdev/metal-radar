-- ============================================================
-- FASE 6 — Bloqueo de usuarios
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente
-- (mismo criterio que el resto de scripts de esta ronda).
--
-- Nota de diseño importante: las comprobaciones de bloqueo dentro de
-- políticas RLS de OTRAS tablas (profiles, user_follows) no pueden
-- consultar `blocked_users` con un `exists()` normal, porque esa
-- subconsulta se ejecuta con los mismos permisos que el rol que
-- dispara la política — y la RLS de `blocked_users` solo deja ver
-- `blocker_id = auth.uid()`, así que la mitad "¿me ha bloqueado esta
-- otra persona?" se evaluaría siempre como "no visible = no
-- bloqueado", aunque sí lo estuviera. Por eso `is_blocked_either_way`
-- es SECURITY DEFINER: al ejecutarse como el dueño de la función (que
-- no está sujeto a la RLS de blocked_users), ve ambas direcciones
-- correctamente.
--
-- Por el mismo motivo, `get_blocked_profiles()` es una función aparte
-- en vez de un embed normal de `profiles` desde `blocked_users`: si
-- no, la propia política de `profiles` (ver más abajo) ocultaría a la
-- persona bloqueada incluso en tu pantalla de "Usuarios bloqueados",
-- que es justo donde necesitas verla para poder desbloquearla.
-- ============================================================

create table if not exists blocked_users (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocked_users_blocked_idx on blocked_users (blocked_id);

alter table blocked_users enable row level security;
grant select, insert, delete on blocked_users to authenticated;

-- Solo el que bloquea ve su propia lista — no se expone a nadie que
-- ha sido bloqueado quién le ha bloqueado.
drop policy if exists blocked_users_select on blocked_users;
create policy blocked_users_select on blocked_users
  for select
  using (auth.uid() = blocker_id);

drop policy if exists blocked_users_insert on blocked_users;
create policy blocked_users_insert on blocked_users
  for insert
  with check (auth.uid() = blocker_id);

drop policy if exists blocked_users_delete on blocked_users;
create policy blocked_users_delete on blocked_users
  for delete
  using (auth.uid() = blocker_id);

create or replace function is_blocked_either_way(p_other_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other_id)
       or (b.blocker_id = p_other_id and b.blocked_id = auth.uid())
  );
$$;
grant execute on function is_blocked_either_way(uuid) to authenticated;

create or replace function get_blocked_profiles()
returns table(id uuid, username text, display_name text)
language sql stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name
  from blocked_users b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;
grant execute on function get_blocked_profiles() to authenticated;

-- ------------------------------------------------------------
-- Impide que la persona bloqueada (en cualquier sentido) vuelva a
-- seguir. Reemplaza la política de la Fase 1.
-- ------------------------------------------------------------
drop policy if exists user_follows_insert on user_follows;
create policy user_follows_insert on user_follows
  for insert
  with check (auth.uid() = follower_id and not is_blocked_either_way(followee_id));

-- ------------------------------------------------------------
-- Oculta de la búsqueda y del perfil público a cualquiera con
-- relación de bloqueo en cualquier sentido. Reemplaza la política de
-- la Fase 0. No hace falta tocar "quién va" (Fase 3) ni el feed
-- (Fase 4): ambos dependen de user_follows con status='accepted', y
-- bloquear ya borra esas filas en los dos sentidos (ver
-- useBlockUser.ts), así que la exclusión ahí es automática.
-- ------------------------------------------------------------
drop policy if exists profiles_public_username_select on profiles;
create policy profiles_public_username_select
  on profiles for select
  using (not is_blocked_either_way(profiles.id));
