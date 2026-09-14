-- Fix a reproducible race in select_character (Task 7 review finding):
-- under concurrent selects for the same user targeting different
-- currently-inactive characters, both calls could pass the clear-step
-- UPDATE (which only locks rows that are already active at scan time) and
-- then both attempt to activate their own target, with the partial unique
-- index (uq_characters__user_active) catching the collision as a 23505 on
-- one of the two second UPDATEs -- surfacing to the caller as a spurious
-- 500 character_select_failed, even though data integrity itself was never
-- violated.
--
-- Fix: take a per-user advisory transaction lock as the very first
-- statement, before the clear-step. This serializes all concurrent
-- select_character calls for the same user, so the clear+activate pair
-- always runs atomically end-to-end per user. pg_advisory_xact_lock
-- auto-releases at transaction end (the same transaction this
-- SECURITY INVOKER function runs in via RPC), so no manual unlock is
-- needed.
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
