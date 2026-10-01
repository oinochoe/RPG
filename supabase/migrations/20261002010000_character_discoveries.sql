-- Run in two parts in the SQL Editor: first "1 (table)", then "2 (function)".
-- One row per (character, discovery) that paid out a reward: the primary key is what makes a reward claimable once.
-- Rewards themselves come from the edge function's server table (supabase/functions/api/discoveries.ts).

-- ==== 1 (table) ====
CREATE TABLE IF NOT EXISTS public.character_discoveries (character_id INT NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE, discovery_id TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (character_id, discovery_id));
ALTER TABLE public.character_discoveries ENABLE ROW LEVEL SECURITY;

-- ==== 2 (function) ====
CREATE OR REPLACE FUNCTION public.claim_discovery(p_user_id INT, p_character_id INT, p_discovery_id TEXT, p_xp INT, p_gold INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_char public.characters;
  v_inserted INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);
  SELECT * INTO v_char FROM public.characters WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;
  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.character_discoveries (character_id, discovery_id) VALUES (p_character_id, p_discovery_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'discovery_already_claimed' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_xp, 0) > 0 OR COALESCE(p_gold, 0) > 0 THEN
    PERFORM public.grant_progress(p_character_id, COALESCE(p_xp, 0), COALESCE(p_gold, 0));
  END IF;
  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_discovery(INT, INT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_discovery(INT, INT, TEXT, INT, INT) TO service_role;
