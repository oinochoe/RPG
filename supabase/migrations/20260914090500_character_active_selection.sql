-- Step 3 design decision (Task 7): add a real "active character" concept
-- server-side, matching the original BackendX session semantics, since the
-- stateless Edge Function has no session to hold `active_character_id` in.
-- See task-7-report.md for the full rationale.

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce at most one active, non-deleted character per user at the data
-- layer (defense in depth beyond the select_character RPC's own logic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_characters__user_active
  ON public.characters (user_id)
  WHERE is_active AND deleted_at IS NULL;

-- Atomically swap the active character for a user: clear any currently
-- active character, then activate the requested one. Runs as a single
-- function invocation (implicit transaction) so no other request can
-- observe an intermediate state with zero or two active characters for the
-- same user.
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
  UPDATE public.characters
  SET is_active = FALSE
  WHERE user_id = p_user_id AND is_active = TRUE AND id != p_character_id;

  UPDATE public.characters
  SET is_active = TRUE
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL
  RETURNING * INTO v_char;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_char;
END;
$$;
