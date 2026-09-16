-- Atomically equip/unequip an inventory item for the caller's own character.
-- Follows the same advisory-lock pattern as create_character/select_character
-- to avoid a race where two concurrent equip calls for the same slot both
-- pass the "unequip whatever's there" step and end up double-equipped.
CREATE OR REPLACE FUNCTION public.set_item_equipped(
  p_user_id INT,
  p_character_id INT,
  p_inventory_id INT,
  p_equip BOOLEAN
)
RETURNS SETOF public.character_inventory
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_item RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ci.id AS inventory_id, it.equip_slot, it.required_level, it.required_class
  INTO v_item
  FROM public.character_inventory ci
  JOIN public.item_templates it ON it.id = ci.item_template_id
  WHERE ci.id = p_inventory_id AND ci.character_id = p_character_id;

  IF v_item.inventory_id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_equip THEN
    IF v_item.equip_slot IS NULL THEN
      RAISE EXCEPTION 'not_equippable' USING ERRCODE = 'P0001';
    END IF;
    IF v_char.level < v_item.required_level THEN
      RAISE EXCEPTION 'level_requirement_unmet' USING ERRCODE = 'P0001';
    END IF;
    IF v_item.required_class IS NOT NULL
       AND v_item.required_class <> 'all'
       AND v_item.required_class <> v_char.character_class THEN
      RAISE EXCEPTION 'class_requirement_unmet' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.character_inventory
    SET is_equipped = FALSE, equipped_slot = NULL
    WHERE character_id = p_character_id
      AND equipped_slot = v_item.equip_slot
      AND id <> p_inventory_id;

    UPDATE public.character_inventory
    SET is_equipped = TRUE, equipped_slot = v_item.equip_slot
    WHERE id = p_inventory_id;
  ELSE
    UPDATE public.character_inventory
    SET is_equipped = FALSE, equipped_slot = NULL
    WHERE id = p_inventory_id;
  END IF;

  RETURN QUERY
    SELECT * FROM public.character_inventory
    WHERE character_id = p_character_id
    ORDER BY slot_index;
END;
$$;
