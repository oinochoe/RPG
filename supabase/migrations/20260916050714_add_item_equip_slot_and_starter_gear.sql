-- Inventory/equipment feature (see docs/superpowers/specs/2026-09-16-inventory-equipment-design.md).
--
-- item_templates.item_type ('weapon'/'armor'/...) alone can't say which granular
-- equip slot (character_inventory.equipped_slot's enum) an item goes into, so
-- add that column here. NULL means "not equippable" (consumable/scroll/misc).
ALTER TABLE public.item_templates
  ADD COLUMN equip_slot TEXT NULL
    CHECK (equip_slot IS NULL OR equip_slot IN
      ('weapon', 'shield', 'helmet', 'body_armor', 'boots', 'ring', 'necklace'));

-- Seed starter gear: one weapon + one armor piece per class, class-restricted.
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus)
VALUES
  ('녹슨 검', 'weapon', 'weapon', 1, 'warrior', 3, 0),
  ('가죽 방패', 'armor', 'shield', 1, 'warrior', 0, 2),
  ('나무 지팡이', 'weapon', 'weapon', 1, 'mage', 2, 0),
  ('천리안의 로브', 'armor', 'body_armor', 1, 'mage', 0, 1),
  ('나무 활', 'weapon', 'weapon', 1, 'archer', 3, 0),
  ('가죽 조끼', 'armor', 'body_armor', 1, 'archer', 0, 1);

-- Extend create_character to grant the new character's class-appropriate starter
-- gear, unequipped, so the equip/unequip flow has something to exercise. No other
-- change to this function's signature/return type/existing body — reproduced
-- from 20260914152847_create_character_advisory_lock.sql plus the new INSERT.
CREATE OR REPLACE FUNCTION public.create_character(
  p_user_id INT,
  p_name TEXT,
  p_class TEXT
)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_active_count INT;
  v_start_map_id INT;
  v_char public.characters;
BEGIN
  PERFORM pg_advisory_xact_lock(p_user_id);

  SELECT count(*) INTO v_active_count
  FROM public.characters
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  IF v_active_count >= 4 THEN
    RAISE EXCEPTION 'max_characters_reached' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_start_map_id
  FROM public.map_templates
  WHERE map_type = 'field'
  ORDER BY id ASC
  LIMIT 1;

  IF v_start_map_id IS NULL THEN
    RAISE EXCEPTION 'no_starting_map' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.characters (
    user_id, name, character_class, level, experience,
    current_hp, max_hp, current_mp, max_mp,
    attack_power, defense_power, gold, current_map_id
  ) VALUES (
    p_user_id, p_name, p_class, 1, 0,
    100, 100, 20, 20,
    10, 5, 100, v_start_map_id
  )
  RETURNING * INTO v_char;

  -- Grant the two class-restricted starter items, weapon in slot 0 and the
  -- armor piece in slot 1 (ordered by equip_slot = 'weapon' rather than by id,
  -- so this stays correct even if more items are added per class later).
  INSERT INTO public.character_inventory
    (character_id, item_template_id, storage_type, slot_index, quantity, enchant_level, is_equipped, equipped_slot)
  SELECT
    v_char.id, it.id, 'inventory',
    ROW_NUMBER() OVER (ORDER BY (it.equip_slot = 'weapon') DESC) - 1,
    1, 0, FALSE, NULL
  FROM public.item_templates it
  WHERE it.required_class = p_class;

  RETURN v_char;
END;
$$;
