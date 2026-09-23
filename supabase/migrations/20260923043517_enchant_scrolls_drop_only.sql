DROP FUNCTION IF EXISTS public.enchant_item(INT, INT, INT, INT);

-- Per the user's correction: enchanting was never meant to cost gold directly — it's meant
-- to require an enchant scroll ITEM, one the player finds as a monster drop (see
-- lootStore.ts's DROP_TABLE), not something bought in a shop. Reworks the RPC so
-- p_scroll_inventory_id is now required for every enchant attempt (no more gold-only path),
-- and folds the old gold-path risk logic into a 3rd scroll type: 일반 강화 주문서 ('normal') —
-- same safe-to-+6/risky-beyond behavior as before, just gated behind owning the scroll
-- instead of gold. Also zeroes buy_price on all 3 scroll types (blessed/cursed already existed
-- as shop items from the previous migration) so none of them show up in the shop — they're
-- drop-only now.
ALTER TABLE public.item_templates DROP CONSTRAINT IF EXISTS item_templates_enchant_scroll_type_check;
ALTER TABLE public.item_templates ADD CONSTRAINT item_templates_enchant_scroll_type_check
  CHECK (enchant_scroll_type IN ('normal', 'blessed', 'cursed'));

UPDATE public.item_templates SET buy_price = 0 WHERE enchant_scroll_type IN ('blessed', 'cursed');

INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, buy_price, sell_price, enchant_scroll_type)
VALUES
  ('일반 강화 주문서', 'consumable', NULL, 1, NULL, 0, 20, 'normal');

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

  IF v_scroll_item.enchant_scroll_type = 'blessed' AND v_row.enchant_level < 5 THEN
    RAISE EXCEPTION 'blessed_requires_plus5' USING ERRCODE = 'P0001';
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
  ELSE
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
