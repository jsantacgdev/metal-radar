-- ============================================================
-- Reporte de usuarios (necesario para el requisito de Google Play de
-- poder denunciar comportamiento abusivo también en mensajes
-- privados, no solo en comentarios) + arregla un bug encontrado de
-- paso: `comment_reports` nunca tuvo política de SELECT, así que
-- ModerationScreen no ha podido leer el motivo de ningún reporte de
-- comentario (siempre mostraba "sin motivo").
-- Ejecutar manualmente en Supabase Studio / SQL editor. Idempotente.
-- ============================================================

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists comment_reports_select on comment_reports;
create policy comment_reports_select on comment_reports
  for select
  using (is_admin());

create table if not exists user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid not null references profiles(id) on delete cascade,
  reason text,
  context text,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
create index if not exists user_reports_reported_idx on user_reports (reported_id, created_at);

alter table user_reports enable row level security;

grant insert on user_reports to authenticated;
grant delete on user_reports to authenticated;

drop policy if exists user_reports_insert on user_reports;
create policy user_reports_insert on user_reports
  for insert
  with check (auth.uid() = reporter_id);

drop policy if exists user_reports_select on user_reports;
create policy user_reports_select on user_reports
  for select
  using (is_admin());

-- Solo un admin puede "descartar" (borrar) reportes ya revisados.
drop policy if exists user_reports_delete on user_reports;
create policy user_reports_delete on user_reports
  for delete
  using (is_admin());
