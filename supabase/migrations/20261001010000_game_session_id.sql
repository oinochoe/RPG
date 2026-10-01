-- One live game session per account: select_character issues a fresh game_session_id on the character it
-- activates and clears it on the one it deactivates. The API compares each request's x-game-session header
-- with the ACTIVE character's value, so a session that has been replaced (another tab/device selected a
-- character since) is rejected. See docs/superpowers/specs/2026-10-01-single-game-session-design.md.
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS game_session_id UUID NULL;

CREATE OR REPLACE FUNCTION public.select_character(
  p_user_id INT,
  p_character_id INT
)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  -- Deactivate whatever else was active and drop its session id.
  UPDATE public.characters
  SET is_active = FALSE, game_session_id = NULL
  WHERE user_id = p_user_id AND is_active = TRUE AND id != p_character_id;

  -- Activate the requested character with a NEW session id (also when it was already active, so
  -- selecting the same character from a second tab replaces the first tab's session).
  UPDATE public.characters
  SET is_active = TRUE, game_session_id = gen_random_uuid()
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL
  RETURNING * INTO v_char;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_char;
END;
$$;
