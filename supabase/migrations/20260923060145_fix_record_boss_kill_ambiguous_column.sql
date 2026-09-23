-- Same plpgsql ambiguous-column bug as upgrade_character_skill/enchant_item hit before: the
-- RETURNS TABLE OUT parameter "boss_key" collided with the boss_kill_state.boss_key column
-- inside ON CONFLICT (character_id, boss_key). Renaming the OUT column sidesteps it.
DROP FUNCTION IF EXISTS public.record_boss_kill(INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.record_boss_kill(
  p_user_id INT,
  p_character_id INT,
  p_boss_key TEXT
)
RETURNS TABLE (out_boss_key TEXT, available_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_char_id INT;
  v_hours INT;
  v_existing TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT id INTO v_char_id FROM public.characters
    WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'character_not_found';
  END IF;

  v_hours := public.boss_respawn_hours(p_boss_key);
  IF v_hours IS NULL THEN
    RAISE EXCEPTION 'boss_key_invalid';
  END IF;

  SELECT bks.last_killed_at INTO v_existing FROM public.boss_kill_state AS bks
    WHERE bks.character_id = p_character_id AND bks.boss_key = p_boss_key;
  IF v_existing IS NOT NULL AND v_existing + (v_hours || ' hours')::interval > now() THEN
    RAISE EXCEPTION 'boss_on_cooldown';
  END IF;

  INSERT INTO public.boss_kill_state AS bks (character_id, boss_key, last_killed_at)
    VALUES (p_character_id, p_boss_key, now())
    ON CONFLICT (character_id, boss_key) DO UPDATE SET last_killed_at = now();

  v_next := now() + (v_hours || ' hours')::interval;
  RETURN QUERY SELECT p_boss_key, v_next;
END;
$$;
