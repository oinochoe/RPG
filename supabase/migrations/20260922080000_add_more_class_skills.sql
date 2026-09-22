-- Skill diversification — each class had exactly one skill (강타/관통사격/파이어볼, ids 1-3).
-- character_skills was always designed for a character to have multiple rows (see its own
-- (character_id, skill_template_id) unique constraint from the initial schema), just never
-- populated with more than one per class. Adds 2 more per class: a cheap low-cooldown
-- "spam" single-target option, and a new AOE type (damage_multiplier applies per target hit).
ALTER TABLE skill_templates
  ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'single' CHECK (skill_type IN ('single', 'aoe')),
  ADD COLUMN aoe_radius DOUBLE PRECISION NULL CHECK (aoe_radius IS NULL OR aoe_radius > 0);

INSERT INTO skill_templates
  (name, character_class, required_level, max_level, mp_cost, cooldown_seconds, range_distance, damage_multiplier, skill_type, aoe_radius)
VALUES
  ('연속베기', 'warrior', 1, 10, 8, 2, 2, 1.3, 'single', NULL),
  ('대지진동', 'warrior', 5, 10, 25, 8, 2, 1.6, 'aoe', 3.5),
  ('속사', 'archer', 1, 10, 8, 2, 7, 1.2, 'single', NULL),
  ('산탄사격', 'archer', 5, 10, 22, 7, 7, 1.4, 'aoe', 3),
  ('매직미사일', 'mage', 1, 10, 10, 2, 6, 1.3, 'single', NULL),
  ('블리자드', 'mage', 5, 10, 30, 9, 6, 1.7, 'aoe', 3.5);

-- upgrade_character_skill used to always resolve "the one skill for this class" — now needs
-- to know which of the class's (now 3) skills to raise.
DROP FUNCTION IF EXISTS public.upgrade_character_skill(INT, INT);

CREATE OR REPLACE FUNCTION public.upgrade_character_skill(
  p_user_id INT,
  p_character_id INT,
  p_skill_template_id INT
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
  WHERE id = p_skill_template_id AND character_class = v_char.character_class;

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

  UPDATE public.characters
  SET skill_upgrade_points = skill_upgrade_points - 1
  WHERE id = p_character_id;

  RETURN QUERY
    SELECT cs.skill_level, c.skill_upgrade_points
    FROM public.character_skills cs, public.characters c
    WHERE cs.character_id = p_character_id
      AND cs.skill_template_id = p_skill_template_id
      AND c.id = p_character_id;
END;
$$;
