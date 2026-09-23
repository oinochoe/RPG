-- Enchant system — character_inventory.enchant_level has existed in the schema since the very
-- first migration but was never populated or exposed via any API route (equipped_items/
-- InventorySlot already surface it to the client, always 0). "안전 강화" per the user's explicit
-- choice: a failed attempt never destroys or downgrades the item, it just doesn't advance the
-- level (gold spent client-side either way — see the enchant route's own comment for why gold
-- isn't touched here). Success chance decreases as enchant_level climbs; capped at +7.
CREATE OR REPLACE FUNCTION public.enchant_item(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT
)
RETURNS TABLE (enchant_level INT, success BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_row public.character_inventory;
  v_item public.item_templates;
  v_chance NUMERIC;
  v_success BOOLEAN;
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

  v_chance := CASE v_row.enchant_level
    WHEN 0 THEN 1.0
    WHEN 1 THEN 1.0
    WHEN 2 THEN 0.9
    WHEN 3 THEN 0.7
    WHEN 4 THEN 0.5
    WHEN 5 THEN 0.3
    ELSE 0.15
  END;

  v_success := random() < v_chance;

  IF v_success THEN
    UPDATE public.character_inventory AS ci
    SET enchant_level = ci.enchant_level + 1
    WHERE ci.id = p_inventory_id;
  END IF;

  RETURN QUERY
    SELECT ci.enchant_level, v_success
    FROM public.character_inventory ci
    WHERE ci.id = p_inventory_id;
END;
$$;
