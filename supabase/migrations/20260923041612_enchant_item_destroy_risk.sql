DROP FUNCTION IF EXISTS public.enchant_item(INT, INT, INT);

-- Switches enchant from "안전 강화" (never destroys) to a Lineage-style risk system per the
-- user's explicit request: +0→+1→+2→+3 stays guaranteed-safe, but +3 and above now has a
-- real destroy-on-fail chance instead of just "doesn't advance." Weapons (equip_slot =
-- 'weapon') are riskier than armor/accessories at the same level — a failed weapon roll is
-- much more likely to destroy the item than a failed armor roll, mirroring how Lineage's own
-- weapon enchant carries more risk than armor enchant at the same +N. A destroyed item is
-- DELETEd from character_inventory outright (equip items are always quantity 1, so there's
-- nothing left to decrement) — if it was equipped, it simply stops existing, which already
-- clears is_equipped/equipped_slot along with the row.
CREATE OR REPLACE FUNCTION public.enchant_item(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT
)
RETURNS TABLE (enchant_level INT, outcome TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_row public.character_inventory;
  v_item public.item_templates;
  v_is_weapon BOOLEAN;
  v_success_chance NUMERIC;
  v_destroy_chance NUMERIC;
  v_roll NUMERIC;
  v_outcome TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row
  FROM public.character_inventory
  WHERE id = p_inventory_id AND character_id = p_character_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_item
  FROM public.item_templates
  WHERE id = v_row.item_template_id;

  IF v_item.equip_slot IS NULL THEN
    RAISE EXCEPTION 'not_enchantable' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.enchant_level >= 7 THEN
    RAISE EXCEPTION 'enchant_maxed' USING ERRCODE = 'P0001';
  END IF;

  v_is_weapon := (v_item.equip_slot = 'weapon');

  IF v_row.enchant_level <= 2 THEN
    -- +0..+2 -> +1..+3: guaranteed safe, same for every equip slot.
    v_success_chance := 1.0;
    v_destroy_chance := 0.0;
  ELSIF v_is_weapon THEN
    v_success_chance := CASE v_row.enchant_level WHEN 3 THEN 0.70 WHEN 4 THEN 0.50 WHEN 5 THEN 0.30 ELSE 0.15 END;
    v_destroy_chance := CASE v_row.enchant_level WHEN 3 THEN 0.10 WHEN 4 THEN 0.25 WHEN 5 THEN 0.40 ELSE 0.60 END;
  ELSE
    v_success_chance := CASE v_row.enchant_level WHEN 3 THEN 0.70 WHEN 4 THEN 0.50 WHEN 5 THEN 0.30 ELSE 0.15 END;
    v_destroy_chance := CASE v_row.enchant_level WHEN 3 THEN 0.05 WHEN 4 THEN 0.15 WHEN 5 THEN 0.25 ELSE 0.40 END;
  END IF;

  v_roll := random();
  IF v_roll < v_success_chance THEN
    v_outcome := 'success';
  ELSIF v_roll < v_success_chance + v_destroy_chance THEN
    v_outcome := 'destroyed';
  ELSE
    v_outcome := 'fail';
  END IF;

  IF v_outcome = 'success' THEN
    UPDATE public.character_inventory AS ci
    SET enchant_level = ci.enchant_level + 1
    WHERE ci.id = p_inventory_id;
  ELSIF v_outcome = 'destroyed' THEN
    DELETE FROM public.character_inventory WHERE id = p_inventory_id;
  END IF;

  RETURN QUERY
    SELECT ci.enchant_level, v_outcome
    FROM public.character_inventory ci
    WHERE ci.id = p_inventory_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::INT, v_outcome;
  END IF;
END;
$$;
