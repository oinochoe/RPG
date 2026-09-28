DROP FUNCTION IF EXISTS public.enchant_item(INT, INT, INT, INT);

-- Lineage-style weapon/armor scroll split per the user's spec:
--   * 무기 강화 주문서 (formerly 일반 강화 주문서, 75,000) — weapons only. +0..+5 always
--     succeeds (safe +6); from +6 on, a failed roll destroys the weapon (no "fail, nothing
--     happens" outcome any more).
--   * 방어구 강화 주문서 (new, 30,000) — every non-weapon slot. +0..+3 always succeeds
--     (safe +4); from +4 on, a failed roll destroys the piece.
--   * 축복의 강화 주문서 — usable from +1 on weapons and +3 on armor (was +5 for both). Always
--     succeeds, never destroys, jumps +1~+3 with a very rare +4.
--   * 저주의 강화 주문서 — unchanged (-1, from +1).
ALTER TABLE public.item_templates DROP CONSTRAINT IF EXISTS item_templates_enchant_scroll_type_check;
-- Matched by type, not id: the client's lootStore uses id 50, but a fresh local DB can number
-- rows differently.
UPDATE public.item_templates
SET enchant_scroll_type = 'weapon', name = '무기 강화 주문서', buy_price = 75000, sell_price = 22500
WHERE enchant_scroll_type = 'normal';
ALTER TABLE public.item_templates ADD CONSTRAINT item_templates_enchant_scroll_type_check
  CHECK (enchant_scroll_type IN ('weapon', 'armor', 'blessed', 'cursed'));

INSERT INTO public.item_templates
  (id, name, item_type, equip_slot, required_level, required_class, buy_price, sell_price, enchant_scroll_type)
VALUES
  (86, '방어구 강화 주문서', 'consumable', NULL, 1, NULL, 30000, 9000, 'armor');

-- Earlier migrations inserted explicit ids without advancing the sequence; keep it past
-- the highest id so a future default-id INSERT doesn't collide.
SELECT setval(pg_get_serial_sequence('public.item_templates', 'id'), (SELECT MAX(id) FROM public.item_templates));

CREATE OR REPLACE FUNCTION public.enchant_item(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT,
  p_scroll_inventory_id INT
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
  v_safe_level INT;
  v_blessed_min INT;
  v_success_chance NUMERIC;
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

  IF p_scroll_inventory_id IS NULL THEN
    RAISE EXCEPTION 'scroll_required' USING ERRCODE = 'P0001';
  END IF;

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

  v_is_weapon := (v_item.equip_slot = 'weapon');
  v_safe_level := CASE WHEN v_is_weapon THEN 6 ELSE 4 END;
  v_blessed_min := CASE WHEN v_is_weapon THEN 1 ELSE 3 END;

  IF v_scroll_item.enchant_scroll_type = 'weapon' AND NOT v_is_weapon THEN
    RAISE EXCEPTION 'weapon_scroll_on_armor' USING ERRCODE = 'P0001';
  END IF;
  IF v_scroll_item.enchant_scroll_type = 'armor' AND v_is_weapon THEN
    RAISE EXCEPTION 'armor_scroll_on_weapon' USING ERRCODE = 'P0001';
  END IF;
  IF v_scroll_item.enchant_scroll_type = 'blessed' AND v_row.enchant_level < v_blessed_min THEN
    RAISE EXCEPTION 'blessed_requires_plus%', v_blessed_min USING ERRCODE = 'P0001';
  END IF;
  IF v_scroll_item.enchant_scroll_type = 'cursed' AND v_row.enchant_level < 1 THEN
    RAISE EXCEPTION 'cursed_requires_plus1' USING ERRCODE = 'P0001';
  END IF;

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
  ELSIF v_scroll_item.enchant_scroll_type = 'blessed' THEN
    -- +1 50% / +2 30% / +3 19% / +4 1% — never fails, never destroys.
    v_roll := random();
    v_jump := CASE WHEN v_roll < 0.50 THEN 1 WHEN v_roll < 0.80 THEN 2 WHEN v_roll < 0.99 THEN 3 ELSE 4 END;
    v_outcome := 'success';
    UPDATE public.character_inventory AS ci
    SET enchant_level = LEAST(v_max_level, ci.enchant_level + v_jump)
    WHERE ci.id = p_inventory_id;
  ELSE
    -- weapon/armor scroll: guaranteed below the safe level, otherwise success-or-destroyed.
    IF v_row.enchant_level < v_safe_level THEN
      v_success_chance := 1.0;
    ELSIF v_is_weapon THEN
      v_success_chance := CASE v_row.enchant_level WHEN 6 THEN 0.50 WHEN 7 THEN 0.40 WHEN 8 THEN 0.30 ELSE 0.20 END;
    ELSE
      v_success_chance := CASE v_row.enchant_level WHEN 4 THEN 0.50 WHEN 5 THEN 0.40 WHEN 6 THEN 0.35 WHEN 7 THEN 0.30 WHEN 8 THEN 0.25 ELSE 0.20 END;
    END IF;

    IF random() < v_success_chance THEN
      v_outcome := 'success';
      UPDATE public.character_inventory AS ci
      SET enchant_level = ci.enchant_level + 1
      WHERE ci.id = p_inventory_id;
    ELSE
      v_outcome := 'destroyed';
      DELETE FROM public.character_inventory WHERE id = p_inventory_id;
    END IF;
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
