-- ============================================================
-- FIX DE SEGURIDAD — evita que un usuario se auto-ascienda a admin.
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
--
-- Confirmado con:
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'profiles';
-- La política "users update own profile" tiene with_check = null, que
-- en Postgres hace que se reutilice `qual` (auth.uid() = id) también
-- como WITH CHECK. Eso solo exige seguir siendo dueño de la fila — no
-- restringe qué columnas se pueden cambiar. Como `role` es una columna
-- más de esa fila, cualquier usuario autenticado puede hoy hacer
-- `update({ role: 'admin' })` sobre su propia fila y saltarse todas
-- las comprobaciones de "profiles.role === 'admin'" del lado servidor
-- (moderate-concert, moderate-comment, parse-festival-poster,
-- commit-festival-from-poster).
--
-- RLS es por fila, no por columna — no se puede arreglar solo con una
-- política. La solución estándar en Postgres es un trigger que
-- rechace el cambio de `role` cuando la petición venga de un usuario
-- normal autenticado (auth.role() = 'authenticated'), pero que deje
-- pasar cambios hechos con la service-role key (Edge Functions,
-- auth.role() = 'service_role') o directamente desde el SQL editor de
-- Studio / una conexión de superusuario (sin JWT, auth.role() es NULL
-- ahí, y una condición NULL en PL/pgSQL se trata como falsa, así que
-- el trigger no bloquea — así puedes seguir gestionando roles a mano).
-- ============================================================

create or replace function prevent_role_self_escalation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'No tienes permiso para cambiar tu rol';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_change on profiles;
create trigger profiles_prevent_role_change
  before update on profiles
  for each row
  execute function prevent_role_self_escalation();
