-- Fix upgrade_character_skill: the UPDATE's bare `skill_upgrade_points` on the right-hand
-- side is ambiguous between the function's OUT parameter of the same name and the
-- characters column (plpgsql.variable_conflict defaults to `error`), so every real call
-- past the "has points to spend" guard raised 42702 and rolled back the whole upgrade —
-- the skill could never actually be learned. Qualify the column with a table alias.
CREATE OR REPLACE FUNCTION public.upgrade_character_skill(
  p_user_id INT,
  p_character_id INT
)
RETURNS TABLE (skill_level INT, skill_upgrade_points INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_template public.skill_templates;
  v_current_level INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.skill_upgrade_points <= 0 THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_template
  FROM public.skill_templates
  WHERE character_class = v_char.character_class
  LIMIT 1;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'skill_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.level < v_template.required_level THEN
    RAISE EXCEPTION 'level_requirement_unmet' USING ERRCODE = 'P0001';
  END IF;

  SELECT cs.skill_level INTO v_current_level
  FROM public.character_skills cs
  WHERE cs.character_id = p_character_id AND cs.skill_template_id = v_template.id;

  IF v_current_level IS NOT NULL AND v_current_level >= v_template.max_level THEN
    RAISE EXCEPTION 'skill_maxed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.character_skills (character_id, skill_template_id, skill_level)
  VALUES (p_character_id, v_template.id, 1)
  ON CONFLICT (character_id, skill_template_id)
  DO UPDATE SET skill_level = public.character_skills.skill_level + 1, updated_at = NOW();

  UPDATE public.characters AS c
  SET skill_upgrade_points = c.skill_upgrade_points - 1
  WHERE c.id = p_character_id;

  RETURN QUERY
    SELECT cs.skill_level, c.skill_upgrade_points
    FROM public.character_skills cs, public.characters c
    WHERE cs.character_id = p_character_id
      AND cs.skill_template_id = v_template.id
      AND c.id = p_character_id;
END;
$$;
