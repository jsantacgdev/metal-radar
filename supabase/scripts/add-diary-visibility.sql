-- ============================================================
-- FASE 2 — Visibilidad del diario a seguidores
-- Ejecutar manualmente en Supabase Studio / SQL editor.
--
-- A diferencia de lo previsto originalmente en el plan, estas
-- políticas son puramente ADITIVAS: no tocan ni sustituyen ninguna
-- política existente de `user_concerts`/`user_festivals` (la de "solo
-- mis propias filas" sigue intacta). En Postgres, varias políticas
-- permisivas para el mismo comando (select) se combinan con OR, así
-- que esto simplemente añade un caso más de visibilidad sin necesidad
-- de conocer ni reescribir el texto de las políticas actuales — esto
-- elimina el mayor riesgo señalado en el plan original.
-- ============================================================

create policy user_concerts_followers_select on user_concerts
  for select
  using (
    exists (
      select 1 from user_follows uf
      where uf.follower_id = auth.uid()
        and uf.followee_id = user_concerts.user_id
        and uf.status = 'accepted'
    )
  );

create policy user_festivals_followers_select on user_festivals
  for select
  using (
    exists (
      select 1 from user_follows uf
      where uf.follower_id = auth.uid()
        and uf.followee_id = user_festivals.user_id
        and uf.status = 'accepted'
    )
  );

-- Nota: no se vuelve a comprobar `profiles.is_private` aquí a propósito.
-- `useFollowUser` (Fase 1) inserta el follow ya como 'accepted' cuando
-- el destino es público, y como 'pending' solo si es privado — así que
-- comprobar `status = 'accepted'` ya equivale a "público y seguido, o
-- privado y aprobado". Y si una cuenta pasa a privada después, los
-- follows ya 'accepted' se mantienen (decisión de producto de la Fase
-- 1), por lo que tampoco hace falta revisar is_private retroactivamente.
