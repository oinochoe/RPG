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

  RETURN v_char;
END;
$$;
