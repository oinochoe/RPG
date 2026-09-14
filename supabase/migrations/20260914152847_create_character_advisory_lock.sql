-- Fix a reproducible race in create_character (final whole-branch review
-- finding), the same TOCTOU pattern already diagnosed and fixed for
-- select_character in 20260914093000_select_character_advisory_lock.sql:
-- the 4-character cap does a SELECT count(*) and then an INSERT with
-- nothing serializing the two statements. Two concurrent POST /characters
-- calls for the same user can both read count = 3 and both insert,
-- allowing 5+ characters -- unlike select_character's is_active column,
-- there is no unique-constraint backstop for this cap.
--
-- Fix: take the same per-user advisory transaction lock as the very first
-- statement, before the active-count check. This serializes all concurrent
-- create_character calls for the same user, so the count-check + insert
-- pair always runs atomically end-to-end per user. pg_advisory_xact_lock
-- auto-releases at transaction end, so no manual unlock is needed.
--
-- No other change: signature, return type, and the rest of the body are
-- reproduced exactly from 20260914084520_create_character_rpc.sql.
CREATE OR REPLACE FUNCTION public.create_character(
  p_user_id INT,
  p_name TEXT,
  p_class TEXT
)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_active_count INT;
  v_start_map_id INT;
  v_char public.characters;
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  SELECT count(*) INTO v_active_count
  FROM public.characters
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  IF v_active_count >= 4 THEN
    RAISE EXCEPTION 'max_characters_reached' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_start_map_id
  FROM public.map_templates
  WHERE map_type = 'field'
  ORDER BY id ASC
  LIMIT 1;

  IF v_start_map_id IS NULL THEN
    RAISE EXCEPTION 'no_starting_map' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.characters (
    user_id, name, character_class, level, experience,
    current_hp, max_hp, current_mp, max_mp,
    attack_power, defense_power, gold, current_map_id
  ) VALUES (
    p_user_id, p_name, p_class, 1, 0,
    100, 100, 20, 20,
    10, 5, 100, v_start_map_id
  )
  RETURNING * INTO v_char;

  RETURN v_char;
END;
$$;
