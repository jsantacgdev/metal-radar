-- ============================================================
-- FASE 5 — Comentarios con hilos, likes por comentario, nota media
-- pública y moderación.
-- Ejecutar manualmente en Supabase Studio / SQL editor.
--
-- Idempotente: se puede relanzar sin errores (create table/index
-- if not exists, create or replace function, drop+create para las
-- políticas ya que Postgres no soporta "create policy if not
-- exists"). Excepción: si `comments`/`reactions` ya existieran de una
-- ejecución previa con un esquema distinto, "if not exists" no altera
-- columnas que falten — en ese caso hay que borrar las tablas a mano
-- primero, no basta con relanzar este script.
--
-- Diseño revisado tras feedback del usuario sobre la primera versión:
-- - Los "likes" son por comentario, no por concierto/festival (que ya
--   se valora con estrellas — un like a nivel de concierto era
--   redundante).
-- - Los comentarios admiten respuesta. Hilo a un solo nivel: responder
--   a una respuesta cuelga del comentario raíz (como la mayoría de
--   apps), para no complicar la UI con anidamiento arbitrario.
-- - Se añade una nota media pública (avg + nº de valoraciones) por
--   concierto/festival, agregando `user_concerts.rating`/
--   `user_festivals.rating` de TODOS los usuarios, no solo los que
--   sigues — necesita una función SECURITY DEFINER porque la RLS de
--   esas tablas normalmente solo deja ver filas propias o de
--   seguidos, y aquí se necesita agregar sobre todas. Es seguro: solo
--   se expone el agregado (avg + count), nunca las filas individuales.
-- ============================================================

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  concert_id uuid references concerts(id) on delete cascade,
  festival_id uuid references festivals(id) on delete cascade,
  user_concert_id uuid references user_concerts(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  report_count int not null default 0,
  constraint comments_one_target check (num_nonnulls(concert_id, festival_id, user_concert_id) = 1)
);
create index if not exists comments_concert_idx on comments (concert_id, created_at);
create index if not exists comments_festival_idx on comments (festival_id, created_at);
create index if not exists comments_user_concert_idx on comments (user_concert_id, created_at);
create index if not exists comments_parent_idx on comments (parent_comment_id);
-- Nota: borrar un comentario raíz borra en cascada sus respuestas
-- (on delete cascade en parent_comment_id) — simplifica moderación
-- (borrar el hilo entero de una vez) a costa de no poder dejar un
-- placeholder "[comentario eliminado]" con las respuestas intactas.

create table if not exists reactions (
  user_id uuid not null references profiles(id) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table if not exists comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

-- ------------------------------------------------------------
-- Visibilidad: comentarios sobre una entrada de diario (user_concert_id)
-- siguen la misma regla que la Fase 2 (dueño o seguidor aceptado).
-- Las reacciones ahora delegan en la visibilidad del comentario al que
-- apuntan, en vez de repetir la lógica de objetivo.
-- ------------------------------------------------------------
create or replace function can_see_diary_entry(p_user_concert_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_concerts uc
    where uc.id = p_user_concert_id
      and (
        uc.user_id = auth.uid()
        or exists (
          select 1 from user_follows uf
          where uf.follower_id = auth.uid()
            and uf.followee_id = uc.user_id
            and uf.status = 'accepted'
        )
      )
  );
$$;

create or replace function can_see_comment(p_comment_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from comments c
    where c.id = p_comment_id
      and (
        c.concert_id is not null
        or c.festival_id is not null
        or can_see_diary_entry(c.user_concert_id)
      )
  );
$$;

alter table comments enable row level security;
alter table reactions enable row level security;
alter table comment_reports enable row level security;

grant select, insert, delete on comments to authenticated;
grant select, insert, delete on reactions to authenticated;
grant insert on comment_reports to authenticated;

drop policy if exists comments_select on comments;
create policy comments_select on comments
  for select
  using (
    concert_id is not null
    or festival_id is not null
    or can_see_diary_entry(user_concert_id)
  );

drop policy if exists comments_insert on comments;
create policy comments_insert on comments
  for insert
  with check (
    auth.uid() = author_id
    and (
      concert_id is not null
      or festival_id is not null
      or can_see_diary_entry(user_concert_id)
    )
  );

-- Sin política de update: los comentarios no son editables (igual que
-- concert_reports) — solo se pueden borrar y volver a escribir.
drop policy if exists comments_delete on comments;
create policy comments_delete on comments
  for delete
  using (auth.uid() = author_id);

drop policy if exists reactions_select on reactions;
create policy reactions_select on reactions
  for select
  using (can_see_comment(comment_id));

drop policy if exists reactions_insert on reactions;
create policy reactions_insert on reactions
  for insert
  with check (auth.uid() = user_id and can_see_comment(comment_id));

drop policy if exists reactions_delete on reactions;
create policy reactions_delete on reactions
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- RPC para report-comment (sin cambios respecto a la primera versión).
-- ------------------------------------------------------------
create or replace function increment_comment_report_count(p_comment_id uuid) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update comments set report_count = report_count + 1
    where id = p_comment_id
    returning report_count into v_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- Nota media pública por concierto/festival (ver nota de diseño al
-- principio del fichero sobre por qué es seguro que sea SECURITY
-- DEFINER pese a saltarse la RLS de user_concerts/user_festivals).
-- ------------------------------------------------------------
create or replace function concert_rating_stats(p_concert_id uuid)
returns table(avg_rating numeric, rating_count int)
language sql stable
security definer
set search_path = public
as $$
  select avg(rating)::numeric, count(rating)::int
  from user_concerts
  where concert_id = p_concert_id and rating is not null;
$$;

create or replace function festival_rating_stats(p_festival_id uuid)
returns table(avg_rating numeric, rating_count int)
language sql stable
security definer
set search_path = public
as $$
  select avg(rating)::numeric, count(rating)::int
  from user_festivals
  where festival_id = p_festival_id and rating is not null;
$$;

grant execute on function concert_rating_stats(uuid) to authenticated;
grant execute on function festival_rating_stats(uuid) to authenticated;
