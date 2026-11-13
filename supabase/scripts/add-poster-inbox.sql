-- ============================================================
-- Carteles de festival desde el PC (process-poster-inbox)
-- Ejecutar una vez en el SQL editor. Idempotente. Requiere add-cron-lock.sql.
--
-- Flujo:
--   1. Subes el póster (JPG/PNG/WebP, máx. 5 MB) al bucket privado
--      festival-posters-inbox desde Storage en el panel de Supabase.
--   2. process-poster-inbox (cada 2 min) lo detecta, lo analiza con la IA de
--      parse-festival-poster y crea:
--        - una fila en poster_imports (status = 'pending_review') con los
--          datos del festival, editables;
--        - una fila por banda en poster_import_bands.
--   3. Revisas en el Table Editor: corriges nombres (lecturas erróneas del
--      OCR) y niveles, desmarcas include para quitar una banda, ajustas
--      fechas/venue. Vaciar existing_festival_id fuerza un festival nuevo.
--   4. Pones status = 'approved' en poster_imports. En la siguiente pasada se
--      guarda con commit-festival-from-poster (póster incluido) y queda en
--      'done' con el resumen en result, o en 'error' con el motivo (lo
--      corriges y vuelves a poner 'approved').
--   Para volver a analizar un póster: borra su fila de poster_imports.
--   Para descartarlo: status = 'discarded'.
-- ============================================================

-- 1) Bucket privado de entrada. Solo se usa desde el panel (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'festival-posters-inbox',
  'festival-posters-inbox',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 2) Una fila por póster subido.
create table if not exists poster_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  storage_path text not null unique,
  status text not null default 'processing'
    check (status in ('processing', 'pending_review', 'approved', 'committing', 'done', 'error', 'discarded')),
  -- Qué hará al aplicarse (informativo): festival nuevo / edición nueva / actualizar.
  action text,
  -- Datos del festival leídos del póster (editables antes de aprobar).
  festival_name text,
  start_date date,
  end_date date,
  venue_name text,
  city text,
  country text,
  -- Emparejamiento automático. Vaciar existing_festival_id = crear festival nuevo;
  -- vaciar existing_venue_id = buscar/crear el venue por nombre y ciudad.
  existing_festival_id uuid references festivals (id) on delete set null,
  existing_venue_id uuid references venues (id) on delete set null,
  error text,
  result jsonb
);

-- 3) Una fila por banda leída.
create table if not exists poster_import_bands (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references poster_imports (id) on delete cascade,
  position int not null,
  name text not null,
  tier text not null default 'lineup' check (tier in ('headliner', 'subheadliner', 'lineup')),
  -- Desmarcar para no incluir la banda al aplicar.
  include boolean not null default true,
  -- false = no existe en la BD y se creará: revisar si es una lectura errónea.
  exists_in_db boolean not null default false,
  matched_band_id uuid references bands (id) on delete set null,
  matched_band_name text
);

create index if not exists poster_import_bands_import_idx
  on poster_import_bands (import_id, position);

-- Si corriges el nombre de una banda, deja de valer el emparejado
-- automático: al aplicar se busca (o crea) por el nombre nuevo.
create or replace function poster_import_bands_reset_match() returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    new.matched_band_id := null;
    new.matched_band_name := null;
    new.exists_in_db := false;
  end if;
  return new;
end;
$$;

drop trigger if exists poster_import_bands_reset_match on poster_import_bands;
create trigger poster_import_bands_reset_match
  before update on poster_import_bands
  for each row execute function poster_import_bands_reset_match();

create or replace function poster_imports_touch() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Si corriges el venue a mano (sin tocar existing_venue_id), deja de
  -- valer el emparejado automático: al aplicar se busca o crea el venue por
  -- nombre y ciudad (si no, se ignoraría lo escrito).
  if (new.venue_name is distinct from old.venue_name
      or new.city is distinct from old.city
      or new.country is distinct from old.country)
     and new.existing_venue_id is not distinct from old.existing_venue_id then
    new.existing_venue_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists poster_imports_touch on poster_imports;
create trigger poster_imports_touch
  before update on poster_imports
  for each row execute function poster_imports_touch();

-- 4) Solo se usan desde el panel y la Edge Function (service role): RLS
--    activado y sin políticas, así que la app no puede leerlas.
alter table poster_imports enable row level security;
alter table poster_import_bands enable row level security;

-- 5) Candado para que dos ejecuciones no se solapen (ver add-cron-lock.sql).
insert into cron_locks (name, locked_until)
values ('process-poster-inbox', null)
on conflict (name) do nothing;
