-- ============================================================
-- Foto de perfil real: columna avatar_url + bucket público de
-- Storage (a diferencia de concert-photos, que es privado con URLs
-- firmadas — un avatar se enseña en listas a otros usuarios
-- constantemente, pedir una signed URL por avatar y por fila sería
-- caro y complejo, y profiles.username/display_name ya se tratan
-- como públicos por defecto).
--
-- Un archivo por usuario, ruta fija {user_id}/avatar.jpg con
-- upsert:true desde el cliente (no hay que gestionar fotos viejas
-- como en el diario). El cache-busting de una foto re-subida se
-- resuelve guardando avatar_url con un ?t=timestamp, no aquí.
--
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
-- ============================================================

alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- Las RPC security definer que embeben perfiles ajenos necesitan
-- avatar_url en su lista de columnas explícita — no basta con añadir
-- la columna a `profiles`, un `returns table(...)` fijo no la coge
-- sola. Redefinir con el mismo cuerpo de siempre + avatar_url.
-- ------------------------------------------------------------
create or replace function get_blocked_profiles()
returns table(id uuid, username text, display_name text, avatar_url text)
language sql stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from blocked_users b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;

create or replace function list_conversations()
returns table(
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_body text,
  last_created_at timestamptz,
  unread_count int
)
language sql stable
security definer
set search_path = public
as $$
  with mine as (
    select
      case when sender_id = auth.uid() then recipient_id else sender_id end as other_id,
      body, created_at, read_at, recipient_id
    from direct_messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  ),
  ranked as (
    select *, row_number() over (partition by other_id order by created_at desc) as rn
    from mine
  )
  select
    r.other_id,
    p.username,
    p.display_name,
    p.avatar_url,
    r.body,
    r.created_at,
    (select count(*)::int from mine m where m.other_id = r.other_id
       and m.recipient_id = auth.uid() and m.read_at is null)
  from ranked r
  join profiles p on p.id = r.other_id
  where r.rn = 1
  order by r.created_at desc;
$$;
