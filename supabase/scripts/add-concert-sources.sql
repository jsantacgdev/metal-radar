-- ============================================================
-- Más fuentes de conciertos (Bandsintown + Ticketmaster en toda Europa)
-- con detección de duplicados entre fuentes. Ejecutar una vez en el SQL
-- editor. Idempotente.
--
-- Nota (2026-11-13): Bandsintown se descartó tras la primera pasada (403
-- desde Supabase) y sync-bandsintown se quitó del repo. Las columnas
-- bandsintown_* quedan sin uso; find_matching_concert sigue siendo la
-- comprobación de duplicados de Ticketmaster.
--
--   * sync-bandsintown: conciertos de las bandas seguidas leídos de su página
--     pública de Bandsintown (Europa, sin festivales).
--   * sync-ticketmaster-europe: conciertos de metal de 18 países europeos,
--     sigas o no a la banda (descubrimiento).
--   * find_matching_concert: el mismo concierto venga de la fuente que venga
--     (Ticketmaster, Bandsintown, manual) se guarda una sola vez.
-- ============================================================

-- 1) Conciertos: id de Bandsintown (además de ticketmaster_id).
alter table concerts add column if not exists bandsintown_id text;
create unique index if not exists concerts_bandsintown_id_key
  on concerts (bandsintown_id)
  where bandsintown_id is not null;

-- concerts.source ya existe ('ticketmaster', 'user_submitted'); ahora también
-- 'bandsintown'. Si había un CHECK sobre source, se quita para admitir el valor
-- nuevo (los valores los fija el código de las Edge Functions).
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.concerts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table concerts drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) Bandas: artista de Bandsintown (sacado de los enlaces de MusicBrainz).
alter table bands add column if not exists bandsintown_id text;
alter table bands add column if not exists bandsintown_checked_at timestamptz;
alter table bands add column if not exists bandsintown_synced_at timestamptz;

-- 3) Estado de la sincronización europea de Ticketmaster: un país y una
--    página por ejecución, rotando.
create table if not exists ticketmaster_europe_sync (
  country_code text primary key,
  next_page int not null default 0,
  last_full_sync_at timestamptz
);

insert into ticketmaster_europe_sync (country_code)
values
  ('ES'), ('PT'), ('FR'), ('IT'), ('DE'), ('AT'), ('CH'), ('NL'), ('BE'),
  ('LU'), ('GB'), ('IE'), ('DK'), ('NO'), ('SE'), ('FI'), ('PL'), ('CZ')
on conflict (country_code) do nothing;

-- Solo la usa la Edge Function (service role).
alter table ticketmaster_europe_sync enable row level security;

-- 4) Duplicados: el mismo concierto = alguna banda en común, fecha a ±18 h
--    (cubre zonas horarias: Bandsintown da hora local, Ticketmaster UTC) y
--    recinto a menos de ~3 km o en la misma ciudad. Prioriza el que ya tiene
--    ticketmaster_id.
create or replace function find_matching_concert(
  p_band_ids uuid[],
  p_event_date timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_city text default null
)
returns table (id uuid, ticketmaster_id text, bandsintown_id text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ticketmaster_id::text, c.bandsintown_id::text
  from concerts c
  join venues v on v.id = c.venue_id
  where c.event_date between p_event_date - interval '18 hours'
                         and p_event_date + interval '18 hours'
    and exists (
      select 1 from concert_bands cb
      where cb.concert_id = c.id and cb.band_id = any (p_band_ids)
    )
    and (
      (p_lat is not null and p_lng is not null
        and v.lat is not null and v.lng is not null
        and abs(v.lat - p_lat) < 0.03
        and abs(v.lng - p_lng) < 0.045)
      or (p_city is not null and v.city is not null
        and lower(v.city) = lower(p_city))
    )
  order by c.ticketmaster_id nulls last
  limit 1;
$$;

revoke execute on function find_matching_concert(uuid[], timestamptz, double precision, double precision, text) from public;
grant execute on function find_matching_concert(uuid[], timestamptz, double precision, double precision, text) to service_role;
