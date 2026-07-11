-- ============================================================
-- UNDO de add-comments-reactions.sql
-- Ejecutar manualmente en Supabase Studio / SQL editor SOLO si ya
-- habías lanzado una versión anterior del script (p.ej. la que tenía
-- `reactions` apuntando a concert_id/festival_id/user_concert_id en
-- vez de a comment_id, o `comments` sin `parent_comment_id`).
--
-- Borra los objetos de la Fase 5 en orden seguro (hijos antes que
-- padres) y luego puedes relanzar add-comments-reactions.sql desde
-- cero sin conflicto de "la tabla ya existe".
--
-- Esto NO toca nada de las Fases 0-4 (username, user_follows,
-- visibilidad de diario, activity_events) — solo lo específico de
-- comentarios/reacciones/moderación de comentarios.
-- ============================================================

drop table if exists comment_reports;
drop table if exists reactions;
drop table if exists comments;

drop function if exists can_see_comment(uuid);
drop function if exists can_see_diary_entry(uuid);
drop function if exists increment_comment_report_count(uuid);
drop function if exists concert_rating_stats(uuid);
drop function if exists festival_rating_stats(uuid);
