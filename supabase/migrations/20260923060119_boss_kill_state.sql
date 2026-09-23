-- Persistent (server-tracked) boss respawn gates. Everything else in this project's monster/
-- combat layer is client-authoritative (see /me/inventory/loot's comment) but a respawn timer
-- that only lived client-side would reset on every page refresh, defeating the point of "only
-- a few kills per day" — so this one small piece of world state is the real source of truth.
-- Only the 4 true unique bosses get a row here: the field world boss (태고의 거인) and each
-- dungeon's final-floor unique boss (거인 군주/오크 군주/구울 군주). Regular floor "captains"
-- (고블린 대장 etc.) are NOT gated — they're required trash to reach the next floor down, and
-- every dungeon re-entry already regenerates the whole floor roster by design.
CREATE TABLE public.boss_kill_state (
  character_id INT NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  boss_key TEXT NOT NULL,
  last_killed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (character_id, boss_key)
);

ALTER TABLE public.boss_kill_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boss_kill_state owner read" ON public.boss_kill_state
  FOR SELECT USING (character_id IN (SELECT id FROM public.characters WHERE user_id = public.current_app_user_id()));

-- Respawn scales with how strong the boss is (user request: "쎌수록 더 오래, 약할수록 더
-- 짧게"). Ranking by level/HP (see Dungeon.tsx/FieldMonsters.ts):
--   태고의 거인 (world boss, lvl 40, 5000hp)      -> 24h (~1/day)
--   거인 군주 (ruined_catacombs, lvl 25, 1325hp)  -> 12h (~2/day)
--   구울 군주 (ghoul_crypt, lvl 22, 1100hp)        -> 8h  (~3/day)
--   오크 군주 (orc_stronghold, lvl 19, 875hp)      -> 6h  (~4/day)
CREATE OR REPLACE FUNCTION public.boss_respawn_hours(p_boss_key TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE p_boss_key
    WHEN 'world_boss' THEN 24
    WHEN 'ruined_catacombs' THEN 12
    WHEN 'ghoul_crypt' THEN 8
    WHEN 'orc_stronghold' THEN 6
    ELSE NULL
  END;
$$;

-- Called by the client the moment it detects one of the 4 boss names died (see combatStore's
-- applyKill) — records the kill time and hands back when it'll be available again. Raises
-- boss_on_cooldown if called while a prior kill's cooldown hasn't elapsed yet (guards against a
-- stale client re-reporting, not a real anti-cheat boundary — see the loot route's own note on
-- this project's trust model).
CREATE OR REPLACE FUNCTION public.record_boss_kill(
  p_user_id INT,
  p_character_id INT,
  p_boss_key TEXT
)
RETURNS TABLE (boss_key TEXT, available_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_char_id INT;
  v_hours INT;
  v_existing TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT id INTO v_char_id FROM public.characters
    WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'character_not_found';
  END IF;

  v_hours := public.boss_respawn_hours(p_boss_key);
  IF v_hours IS NULL THEN
    RAISE EXCEPTION 'boss_key_invalid';
  END IF;

  SELECT bks.last_killed_at INTO v_existing FROM public.boss_kill_state AS bks
    WHERE bks.character_id = p_character_id AND bks.boss_key = p_boss_key;
  IF v_existing IS NOT NULL AND v_existing + (v_hours || ' hours')::interval > now() THEN
    RAISE EXCEPTION 'boss_on_cooldown';
  END IF;

  INSERT INTO public.boss_kill_state AS bks (character_id, boss_key, last_killed_at)
    VALUES (p_character_id, p_boss_key, now())
    ON CONFLICT (character_id, boss_key) DO UPDATE SET last_killed_at = now();

  v_next := now() + (v_hours || ' hours')::interval;
  RETURN QUERY SELECT p_boss_key, v_next;
END;
$$;

-- Returns all 4 boss keys every time (even ones never killed) so the client always gets a
-- complete map — NULL available_at means "ready now" (never killed, or cooldown elapsed).
CREATE OR REPLACE FUNCTION public.get_boss_cooldowns(p_character_id INT)
RETURNS TABLE (boss_key TEXT, available_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT k.boss_key,
    CASE
      WHEN bks.last_killed_at IS NULL THEN NULL
      WHEN bks.last_killed_at + (public.boss_respawn_hours(k.boss_key) || ' hours')::interval <= now() THEN NULL
      ELSE bks.last_killed_at + (public.boss_respawn_hours(k.boss_key) || ' hours')::interval
    END AS available_at
  FROM (VALUES ('world_boss'), ('ruined_catacombs'), ('orc_stronghold'), ('ghoul_crypt')) AS k(boss_key)
  LEFT JOIN public.boss_kill_state AS bks
    ON bks.character_id = p_character_id AND bks.boss_key = k.boss_key;
$$;
