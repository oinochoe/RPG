DROP FUNCTION IF EXISTS public.enchant_item(INT, INT, INT);

-- Full Lineage-style enchant scroll system per the user's detailed spec (worked out over
-- several messages): normal (gold-only) enchant is safe all the way to +6, and only the
-- +6→+7 attempt onward carries destroy risk. Two new consumable items let the player dodge
-- that risk: 축복의 강화 주문서 (blessed) always succeeds and jumps the item up by a random
-- 1-3 levels (bigger jumps get more likely the higher the item already is) with zero destroy
-- risk, usable only once the item has reached +5; 저주의 강화 주문서 (cursed) always succeeds
-- and knocks the item back down by exactly 1 level, letting a player deliberately retreat
-- from a risky level (e.g. +6) to a safer one (+5) before trying blessed again. Neither
-- scroll costs extra gold to use — the cost is buying the scroll itself.
ALTER TABLE public.item_templates ADD COLUMN enchant_scroll_type TEXT CHECK (enchant_scroll_type IN ('blessed', 'cursed'));

INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, buy_price, sell_price, enchant_scroll_type)
VALUES
  ('축복의 강화 주문서', 'consumable', NULL, 1, NULL, 2500, 750, 'blessed'),
  ('저주의 강화 주문서', 'consumable', NULL, 1, NULL, 300, 90, 'cursed');

-- p_scroll_inventory_id NULL -> the existing gold-only path (now safe to +6, risky beyond).
-- A value -> that inventory row must be a blessed/cursed scroll owned by this character; it's
-- consumed (decremented/deleted like any other consumable) and its own guaranteed-outcome
-- logic runs instead of the gold path's probability roll.
CREATE OR REPLACE FUNCTION public.enchant_item(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT,
  p_scroll_inventory_id INT DEFAULT NULL
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
  v_scroll_row public.character_inventory;
  v_scroll_item public.item_templates;
  v_is_weapon BOOLEAN;
  v_success_chance NUMERIC;
  v_destroy_chance NUMERIC;
  v_roll NUMERIC;
  v_outcome TEXT;
  v_jump INT;
  v_max_level CONSTANT INT := 10;
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

  IF v_row.enchant_level >= v_max_level THEN
    RAISE EXCEPTION 'enchant_maxed' USING ERRCODE = 'P0001';
  END IF;

  IF p_scroll_inventory_id IS NOT NULL THEN
    SELECT * INTO v_scroll_row
    FROM public.character_inventory
    WHERE id = p_scroll_inventory_id AND character_id = p_character_id;

    IF v_scroll_row.id IS NULL THEN
      RAISE EXCEPTION 'scroll_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_scroll_item
    FROM public.item_templates
    WHERE id = v_scroll_row.item_template_id;

    IF v_scroll_item.enchant_scroll_type IS NULL THEN
      RAISE EXCEPTION 'not_a_scroll' USING ERRCODE = 'P0001';
    END IF;

    IF v_scroll_item.enchant_scroll_type = 'blessed' AND v_row.enchant_level < 5 THEN
      RAISE EXCEPTION 'blessed_requires_plus5' USING ERRCODE = 'P0001';
    END IF;
    IF v_scroll_item.enchant_scroll_type = 'cursed' AND v_row.enchant_level < 1 THEN
      RAISE EXCEPTION 'cursed_requires_plus1' USING ERRCODE = 'P0001';
    END IF;

    -- Consume the scroll (same decrement-or-delete shape decrementOrDeleteInventoryRow uses
    -- in the edge function, duplicated here since RPCs and the edge function don't share code).
    IF v_scroll_row.quantity > 1 THEN
      UPDATE public.character_inventory AS ci SET quantity = ci.quantity - 1 WHERE ci.id = v_scroll_row.id;
    ELSE
      DELETE FROM public.character_inventory WHERE id = v_scroll_row.id;
    END IF;

    IF v_scroll_item.enchant_scroll_type = 'cursed' THEN
      v_outcome := 'cursed';
      UPDATE public.character_inventory AS ci
      SET enchant_level = GREATEST(0, ci.enchant_level - 1)
      WHERE ci.id = p_inventory_id;
    ELSE
      -- blessed: random +1/+2/+3 jump, bigger jumps more likely the higher the current level
      -- already is (this project's own pity-style curve, not a literal Lineage table).
      v_roll := random();
      IF v_row.enchant_level >= 9 THEN
        v_jump := CASE WHEN v_roll < 0.40 THEN 1 WHEN v_roll < 0.75 THEN 2 ELSE 3 END;
      ELSIF v_row.enchant_level >= 7 THEN
        v_jump := CASE WHEN v_roll < 0.55 THEN 1 WHEN v_roll < 0.85 THEN 2 ELSE 3 END;
      ELSE
        v_jump := CASE WHEN v_roll < 0.70 THEN 1 WHEN v_roll < 0.95 THEN 2 ELSE 3 END;
      END IF;
      v_outcome := 'success';
      UPDATE public.character_inventory AS ci
      SET enchant_level = LEAST(v_max_level, ci.enchant_level + v_jump)
      WHERE ci.id = p_inventory_id;
    END IF;

    RETURN QUERY
      SELECT ci.enchant_level, v_outcome
      FROM public.character_inventory ci
      WHERE ci.id = p_inventory_id;
    RETURN;
  END IF;

  -- Gold-only path (no scroll): safe through +6, risky (destroy possible) from +6 onward.
  v_is_weapon := (v_item.equip_slot = 'weapon');

  IF v_row.enchant_level <= 5 THEN
    v_success_chance := 1.0;
    v_destroy_chance := 0.0;
  ELSIF v_is_weapon THEN
    v_success_chance := CASE v_row.enchant_level WHEN 6 THEN 0.50 WHEN 7 THEN 0.40 WHEN 8 THEN 0.30 ELSE 0.20 END;
    v_destroy_chance := CASE v_row.enchant_level WHEN 6 THEN 0.30 WHEN 7 THEN 0.40 WHEN 8 THEN 0.50 ELSE 0.60 END;
  ELSE
    v_success_chance := CASE v_row.enchant_level WHEN 6 THEN 0.50 WHEN 7 THEN 0.40 WHEN 8 THEN 0.30 ELSE 0.20 END;
    v_destroy_chance := CASE v_row.enchant_level WHEN 6 THEN 0.15 WHEN 7 THEN 0.20 WHEN 8 THEN 0.25 ELSE 0.30 END;
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
