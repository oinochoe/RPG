CREATE OR REPLACE FUNCTION public.boss_respawn_hours(p_boss_key text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE p_boss_key
    WHEN 'world_boss' THEN 24
    WHEN 'ruined_catacombs' THEN 12
    WHEN 'ghoul_crypt' THEN 8
    WHEN 'orc_stronghold' THEN 6
    WHEN 'mushroom_den' THEN 6
    ELSE NULL
  END;
$function$;
