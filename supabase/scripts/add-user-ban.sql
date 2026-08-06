-- ============================================================
-- Suspender/banear cuentas reportadas: columna banned_until +
-- trigger que impide que un usuario normal se autolimpie el baneo
-- (misma técnica que fix-profile-role-escalation.sql para `role`,
-- pero como trigger nuevo y separado — no se toca
-- prevent_role_self_escalation, que ya está probado en producción).
--
-- El baneo real se aplica en dos patas, no solo con esta columna:
-- 1. GoTrue (admin.auth.admin.updateUserById con ban_duration, desde
--    moderate-user) — bloquea inicios de sesión/refresh nuevos.
-- 2. Esta columna, comprobada en el cliente (useAuth/RootNavigator)
--    — bloquea de inmediato una sesión ya abierta, sin esperar a que
--    el access token existente caduque por sí solo.
--
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
-- ============================================================

alter table profiles add column if not exists banned_until timestamptz;

create or replace function prevent_banned_until_self_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.banned_until is distinct from old.banned_until and auth.role() = 'authenticated' then
    raise exception 'No tienes permiso para cambiar este campo';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_ban_change on profiles;
create trigger profiles_prevent_ban_change
  before update on profiles
  for each row
  execute function prevent_banned_until_self_change();
