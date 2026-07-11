-- ============================================================
-- FASE 4 — Feed de actividad
-- Ejecutar manualmente en Supabase Studio / SQL editor.
--
-- Primer uso de triggers en este proyecto (no hay precedente en el
-- repo) — se opta por poblar `activity_events` desde triggers de base
-- de datos en vez de insertar el evento desde cada punto de la app,
-- porque ya hay varios sitios que escriben en user_concerts/
-- user_festivals (useConcert.ts, useFestival.ts, AddConcertScreen,
-- moderate-concert) y centralizarlo evita que se olvide emitir el
-- evento en alguno de ellos.
-- ============================================================

create type activity_event_type as enum (
  'concert_going',
  'concert_attended',
  'concert_rated',
  'festival_going',
  'festival_attended',
  'festival_rated',
  'user_followed'
);

-- FKs a profiles(id) (no auth.users(id)) por el mismo motivo que en
-- user_follows: permite a PostgREST embeber `profiles` en el feed.
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id) on delete cascade,
  type activity_event_type not null,
  concert_id uuid references concerts(id) on delete cascade,
  festival_id uuid references festivals(id) on delete cascade,
  target_user_id uuid references profiles(id) on delete cascade,
  rating int,
  created_at timestamptz not null default now()
);
create index activity_events_actor_idx on activity_events (actor_id, created_at desc);

alter table activity_events enable row level security;

-- Solo lectura para los usuarios normales: nadie debería poder
-- insertar eventos a mano (falsificar actividad de otro actor). Los
-- únicos INSERTs vienen de las funciones SECURITY DEFINER de abajo.
grant select on activity_events to authenticated;

create policy activity_events_select on activity_events
  for select
  using (
    actor_id = auth.uid()
    or exists (
      select 1 from user_follows uf
      where uf.follower_id = auth.uid()
        and uf.followee_id = activity_events.actor_id
        and uf.status = 'accepted'
    )
  );

-- ------------------------------------------------------------
-- Trigger: user_concerts -> concert_going / concert_attended / concert_rated
-- ------------------------------------------------------------
create or replace function emit_concert_activity() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'going'
     and (tg_op = 'INSERT' or old.status is distinct from 'going') then
    insert into activity_events (actor_id, type, concert_id)
    values (new.user_id, 'concert_going', new.concert_id);
  end if;

  if new.status = 'attended'
     and (tg_op = 'INSERT' or old.status is distinct from 'attended') then
    insert into activity_events (actor_id, type, concert_id)
    values (new.user_id, 'concert_attended', new.concert_id);
  end if;

  if new.rating is not null
     and (tg_op = 'INSERT' or new.rating is distinct from old.rating) then
    insert into activity_events (actor_id, type, concert_id, rating)
    values (new.user_id, 'concert_rated', new.concert_id, new.rating);
  end if;

  return new;
end;
$$;

drop trigger if exists user_concerts_activity on user_concerts;
create trigger user_concerts_activity
  after insert or update on user_concerts
  for each row execute function emit_concert_activity();

-- ------------------------------------------------------------
-- Trigger: user_festivals -> festival_going / festival_attended / festival_rated
-- ------------------------------------------------------------
create or replace function emit_festival_activity() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'going'
     and (tg_op = 'INSERT' or old.status is distinct from 'going') then
    insert into activity_events (actor_id, type, festival_id)
    values (new.user_id, 'festival_going', new.festival_id);
  end if;

  if new.status = 'attended'
     and (tg_op = 'INSERT' or old.status is distinct from 'attended') then
    insert into activity_events (actor_id, type, festival_id)
    values (new.user_id, 'festival_attended', new.festival_id);
  end if;

  if new.rating is not null
     and (tg_op = 'INSERT' or new.rating is distinct from old.rating) then
    insert into activity_events (actor_id, type, festival_id, rating)
    values (new.user_id, 'festival_rated', new.festival_id, new.rating);
  end if;

  return new;
end;
$$;

drop trigger if exists user_festivals_activity on user_festivals;
create trigger user_festivals_activity
  after insert or update on user_festivals
  for each row execute function emit_festival_activity();

-- ------------------------------------------------------------
-- Trigger: user_follows -> user_followed
-- Solo se emite cuando el follow queda 'accepted' (alta directa en
-- cuenta pública, o aprobación de una solicitud en cuenta privada) —
-- nunca en estado 'pending', para no filtrar solicitudes no aceptadas
-- o rechazadas al feed.
-- ------------------------------------------------------------
create or replace function emit_follow_activity() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    insert into activity_events (actor_id, type, target_user_id)
    values (new.follower_id, 'user_followed', new.followee_id);
  end if;

  return new;
end;
$$;

drop trigger if exists user_follows_activity on user_follows;
create trigger user_follows_activity
  after insert or update on user_follows
  for each row execute function emit_follow_activity();
