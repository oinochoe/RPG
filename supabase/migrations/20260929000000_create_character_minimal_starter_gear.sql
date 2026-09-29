-- create_character used to grant EVERY item_templates row with required_class = p_class,
-- which ballooned as the catalog grew (upgrade weapons, tier 2/3 armor, boss gear, ...).
-- New characters now get exactly one weapon and one body armor: the lowest-id level-1
-- item of each slot for their class (warrior: 녹슨 검 + 가죽 갑옷, mage: 나무 지팡이 +
-- 천리안의 로브, archer: 나무 활 + 가죽 조끼). Body otherwise identical to
-- 20260916050714_add_item_equip_slot_and_starter_gear.sql.
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

  -- Weapon in slot 0, body armor in slot 1.
  INSERT INTO public.character_inventory
    (character_id, item_template_id, storage_type, slot_index, quantity, enchant_level, is_equipped, equipped_slot)
  SELECT
    v_char.id, s.id, 'inventory',
    ROW_NUMBER() OVER (ORDER BY (s.equip_slot = 'weapon') DESC) - 1,
    1, 0, FALSE, NULL
  FROM (
    SELECT DISTINCT ON (it.equip_slot) it.id, it.equip_slot
    FROM public.item_templates it
    WHERE it.required_class = p_class
      AND it.required_level = 1
      AND it.equip_slot IN ('weapon', 'body_armor')
    ORDER BY it.equip_slot, it.id ASC
  ) s;

  RETURN v_char;
END;
$$;
