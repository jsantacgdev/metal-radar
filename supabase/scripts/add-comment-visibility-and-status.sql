-- ============================================================
-- Visibilidad por comentario (pública/solo seguidores) + posts de
-- "estado" de logística (voy solo, hueco en el coche, busco quien me
-- lleve) dentro de la sección de comentarios.
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
--
-- Hoy TODO comentario ligado a un concierto/festival es público sin
-- excepción (comments_select no mira is_private ni ningún flag de
-- visibilidad, y tampoco excluye usuarios bloqueados a diferencia de
-- otras políticas del proyecto). Este script:
--   1. Añade `comment_type` ('comment' | 'status') y `status_type`
--      para los posts de estado.
--   2. Añade `visibility` ('public' | 'followers'), default 'public'
--      para no romper el comportamiento actual.
--   3. Reescribe comments_select / can_see_comment para respetar esa
--      visibilidad (comentarios sobre concierto/festival) y para
--      excluir usuarios bloqueados entre sí (como ya hacen otras
--      políticas, p.ej. user_follows_insert).
-- ============================================================

alter table comments add column if not exists comment_type text not null default 'comment'
  check (comment_type in ('comment', 'status'));
alter table comments add column if not exists status_type text
  check (status_type in ('going_alone', 'has_car_space', 'looking_for_ride'));
alter table comments add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'followers'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comments_status_type_consistency'
  ) then
    alter table comments add constraint comments_status_type_consistency
      check (
        (comment_type = 'status' and status_type is not null)
        or (comment_type = 'comment' and status_type is null)
      );
  end if;
end $$;

-- ------------------------------------------------------------
-- Visibilidad: público, o autor, o seguidor aceptado del autor.
-- ------------------------------------------------------------
create or replace function can_see_comment_visibility(p_author_id uuid, p_visibility text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_visibility = 'public'
    or p_author_id = auth.uid()
    or exists (
      select 1 from user_follows uf
      where uf.follower_id = auth.uid()
        and uf.followee_id = p_author_id
        and uf.status = 'accepted'
    );
$$;

-- Reescribe can_see_comment (usada por las políticas de reactions) para
-- que también respete visibility y excluya usuarios bloqueados entre sí,
-- dejando intacta la rama de diario (can_see_diary_entry ya tiene su
-- propia regla de seguidores y no lleva columna visibility).
create or replace function can_see_comment(p_comment_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from comments c
    where c.id = p_comment_id
      and not is_blocked_either_way(c.author_id)
      and (
        (c.concert_id is not null and can_see_comment_visibility(c.author_id, c.visibility))
        or (c.festival_id is not null and can_see_comment_visibility(c.author_id, c.visibility))
        or can_see_diary_entry(c.user_concert_id)
      )
  );
$$;

drop policy if exists comments_select on comments;
create policy comments_select on comments
  for select
  using (
    not is_blocked_either_way(author_id)
    and (
      (concert_id is not null and can_see_comment_visibility(author_id, visibility))
      or (festival_id is not null and can_see_comment_visibility(author_id, visibility))
      or can_see_diary_entry(user_concert_id)
    )
  );

drop policy if exists reactions_select on reactions;
create policy reactions_select on reactions
  for select
  using (can_see_comment(comment_id));

-- comments_insert / reactions_insert no cambian: ya exigen
-- auth.uid() = author_id / user_id, y los checks de columna nueva
-- (comment_type, status_type, visibility) ya validan valores.
