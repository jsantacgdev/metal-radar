-- ============================================================
-- Mensajes privados 1:1 (contacto tras un post de "estado" de
-- logística — voy solo, hueco en el coche, busco quien me lleve).
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
--
-- Sin Realtime a propósito (decisión explícita del usuario): la app
-- sondea (polling) mientras la conversación está abierta, y se avisa
-- por push reutilizando la función `notify-social` ya existente
-- (mismo patrón de cola de trabajo "columna *_notified_at" que ya usa
-- para solicitudes de seguimiento, nuevos seguidores y respuestas a
-- comentarios).
--
-- Regla de seguridad clave: solo se puede escribir a alguien con quien
-- ya existe una relación de seguimiento aceptada (en cualquier
-- sentido) — un desconocido no puede escribir en frío a alguien que
-- ha publicado, por ejemplo, "voy sola", ni siquiera si esa persona
-- lo hizo público.
-- ============================================================

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  notified_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_pair_idx
  on direct_messages (sender_id, recipient_id, created_at);
create index if not exists direct_messages_pair_idx_rev
  on direct_messages (recipient_id, sender_id, created_at);

create or replace function are_connected(p_other_id uuid) returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_follows
    where status = 'accepted'
      and ((follower_id = auth.uid() and followee_id = p_other_id)
        or (follower_id = p_other_id and followee_id = auth.uid()))
  );
$$;

alter table direct_messages enable row level security;

grant select, insert, update on direct_messages to authenticated;

drop policy if exists direct_messages_select on direct_messages;
create policy direct_messages_select on direct_messages
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists direct_messages_insert on direct_messages;
create policy direct_messages_insert on direct_messages
  for insert
  with check (
    auth.uid() = sender_id
    and not is_blocked_either_way(recipient_id)
    and are_connected(recipient_id)
  );

-- Solo el destinatario puede escribir (marcar como leído) tras enviarse.
drop policy if exists direct_messages_update on direct_messages;
create policy direct_messages_update on direct_messages
  for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- ------------------------------------------------------------
-- Lista de conversaciones: último mensaje + no leídos por interlocutor.
-- security definer para poder hacer join contra profiles sin depender
-- de sus políticas de lectura pública (mismo motivo que
-- concert_rating_stats/festival_rating_stats).
-- ------------------------------------------------------------
create or replace function list_conversations()
returns table(
  other_id uuid,
  other_username text,
  other_display_name text,
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
    r.body,
    r.created_at,
    (select count(*)::int from mine m where m.other_id = r.other_id
       and m.recipient_id = auth.uid() and m.read_at is null)
  from ranked r
  join profiles p on p.id = r.other_id
  where r.rn = 1
  order by r.created_at desc;
$$;

grant execute on function list_conversations() to authenticated;
