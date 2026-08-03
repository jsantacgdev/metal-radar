-- ============================================================
-- Bloqueo simple entre ejecuciones solapadas de notify-social.
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
--
-- No se usa pg_advisory_lock: con PgBouncer en modo transacción (el
-- pooling habitual de Supabase) dos llamadas RPC separadas (adquirir
-- en una, liberar en otra) no tienen garantizado compartir la misma
-- sesión de Postgres, así que un advisory lock de sesión no es fiable
-- aquí. Un claim atómico por fila (UPDATE ... WHERE ... RETURNING) sí
-- funciona sin depender de la sesión.
-- ============================================================

create table if not exists cron_locks (
  name text primary key,
  locked_until timestamptz
);

insert into cron_locks (name, locked_until)
values ('notify-social', null)
on conflict (name) do nothing;

create or replace function try_acquire_cron_lock(p_name text, p_duration_seconds int default 120)
returns boolean
language sql
security definer
set search_path = public
as $$
  update cron_locks
    set locked_until = now() + make_interval(secs => p_duration_seconds)
    where name = p_name
      and (locked_until is null or locked_until < now())
  returning true;
$$;

create or replace function release_cron_lock(p_name text) returns void
language sql
security definer
set search_path = public
as $$
  update cron_locks set locked_until = null where name = p_name;
$$;

grant execute on function try_acquire_cron_lock(text, int) to service_role;
grant execute on function release_cron_lock(text) to service_role;
