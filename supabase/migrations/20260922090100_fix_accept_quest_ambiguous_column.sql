-- Same ambiguous-column class of bug as upgrade_character_skill (see
-- 20260922080100_fix_upgrade_character_skill_ambiguous_column_again.sql): accept_quest's
-- RETURNS TABLE declares quest_template_id/status/progress_count as OUT parameters, and the
-- bare `quest_template_id = p_quest_template_id` in the "already accepted?" lookup — plus the
-- final INSERT...RETURNING's bare column list — collide with those OUT parameter names
-- (plpgsql.variable_conflict defaults to `error`). Every real accept_quest call past the
-- level-requirement guard raised 42702. Qualifies both spots with a table alias.
CREATE OR REPLACE FUNCTION public.accept_quest(
  p_user_id INT,
  p_character_id INT,
  p_quest_template_id INT
)
RETURNS TABLE (quest_template_id INT, status TEXT, progress_count INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_quest public.quest_templates;
  v_existing public.character_quests;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_quest
  FROM public.quest_templates
  WHERE id = p_quest_template_id;

  IF v_quest.id IS NULL THEN
    RAISE EXCEPTION 'quest_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.level < v_quest.required_level THEN
    RAISE EXCEPTION 'level_requirement_unmet' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.character_quests cq
  WHERE cq.character_id = p_character_id AND cq.quest_template_id = p_quest_template_id;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'already_accepted' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    INSERT INTO public.character_quests AS cq (character_id, quest_template_id, status, progress_count)
    VALUES (p_character_id, p_quest_template_id, 'in_progress', 0)
    RETURNING cq.quest_template_id, cq.status, cq.progress_count;
END;
$$;
