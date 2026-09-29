-- Server-authoritative economy (see docs/superpowers/specs/2026-09-29-server-authoritative-economy-design.md).
--
-- Until now gold/exp/level/stats were computed by the client and saved verbatim by
-- PATCH /characters/me/progress, and item drops were whatever item id the client claimed. This
-- migration makes the DB the only place those change:
--   * grant_progress   — the one place exp/gold are applied (kills, quest rewards, shop sales) incl.
--                        the level-up loop (must match combatStore's applyExperienceGain)
--   * apply_kills      — validated kill report: rate-limited (token bucket), server-rolled gold/exp
--   * allocate_stat    — spend stat points (must match combatStore's allocateStat / statPointCost)
--   * spend_gold       — shop purchases
--   * issue_drops / redeem_drop — server-issued, single-use, expiring drop tickets
--   * sync_character_vitals — the only progress the client may still write (current HP/MP, clamped)
--
-- Every function that changes economy state takes the same per-character advisory lock the other
-- RPCs use and bumps characters.progress_rev, so the client can discard out-of-order responses.
-- All output columns are prefixed r_ and every column reference is table-qualified: this project
-- has been bitten twice by RETURNS TABLE names colliding with column names (see the
-- "fix_*_ambiguous_column" migrations).

ALTER TABLE public.characters
  ADD COLUMN progress_rev BIGINT NOT NULL DEFAULT 0,
  -- Token bucket for kill reports: refills 1.5 tokens/sec up to 25, one token per reported kill.
  ADD COLUMN kill_tokens DOUBLE PRECISION NOT NULL DEFAULT 25,
  ADD COLUMN kill_tokens_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Single-use, expiring "you may pick this up" tickets. Service role only (RLS on, no policies).
CREATE TABLE public.pending_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id INT NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  item_template_id INT NOT NULL REFERENCES public.item_templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes'
);
CREATE INDEX idx_pending_drops__character_id ON public.pending_drops(character_id);
ALTER TABLE public.pending_drops ENABLE ROW LEVEL SECURITY;

-- The economy snapshot the client adopts. Read-only; also used as the return of every mutator.
CREATE OR REPLACE FUNCTION public.progress_snapshot(
  p_character_id INT,
  p_exp_gained INT DEFAULT 0,
  p_gold_gained INT DEFAULT 0,
  p_leveled_up BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  r_level INT,
  r_experience INT,
  r_gold INT,
  r_skill_points INT,
  r_skill_upgrade_points INT,
  r_max_hp INT,
  r_max_mp INT,
  r_attack_power INT,
  r_defense_power INT,
  r_stat_str INT,
  r_stat_dex INT,
  r_stat_con INT,
  r_stat_int INT,
  r_stat_wis INT,
  r_progress_rev BIGINT,
  r_exp_gained INT,
  r_gold_gained INT,
  r_leveled_up BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.level, c.experience, c.gold, c.skill_points, c.skill_upgrade_points,
         c.max_hp, c.max_mp, c.attack_power, c.defense_power,
         c.stat_str, c.stat_dex, c.stat_con, c.stat_int, c.stat_wis,
         c.progress_rev, p_exp_gained, p_gold_gained, p_leveled_up
  FROM public.characters AS c
  WHERE c.id = p_character_id;
$$;

-- Applies exp + gold and runs the level-up loop. Mirrors combatStore.applyExperienceGain:
--   need = level * 100 exp per level; each level-up: +20 max HP (and full heal), +2 attack,
--   +3 stat points, +1 skill-upgrade point. Gold is capped at 999,999,999 like the old route.
CREATE OR REPLACE FUNCTION public.grant_progress(
  p_character_id INT,
  p_exp INT,
  p_gold INT
)
RETURNS TABLE (
  r_level INT,
  r_experience INT,
  r_gold INT,
  r_skill_points INT,
  r_skill_upgrade_points INT,
  r_max_hp INT,
  r_max_mp INT,
  r_attack_power INT,
  r_defense_power INT,
  r_stat_str INT,
  r_stat_dex INT,
  r_stat_con INT,
  r_stat_int INT,
  r_stat_wis INT,
  r_progress_rev BIGINT,
  r_exp_gained INT,
  r_gold_gained INT,
  r_leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_level INT;
  v_exp INT;
  v_max_hp INT;
  v_cur_hp INT;
  v_atk INT;
  v_sp INT;
  v_sup INT;
  v_new_gold INT;
  v_leveled BOOLEAN := FALSE;
BEGIN
  IF p_exp < 0 OR p_gold < 0 THEN
    RAISE EXCEPTION 'invalid_grant' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_level := v_char.level;
  v_exp := v_char.experience + p_exp;
  v_max_hp := v_char.max_hp;
  v_cur_hp := v_char.current_hp;
  v_atk := v_char.attack_power;
  v_sp := v_char.skill_points;
  v_sup := v_char.skill_upgrade_points;

  WHILE v_exp >= v_level * 100 LOOP
    v_exp := v_exp - v_level * 100;
    v_level := v_level + 1;
    v_max_hp := v_max_hp + 20;
    v_atk := v_atk + 2;
    v_cur_hp := v_max_hp;
    v_sp := v_sp + 3;
    v_sup := v_sup + 1;
    v_leveled := TRUE;
  END LOOP;

  v_new_gold := LEAST(v_char.gold::BIGINT + p_gold, 999999999)::INT;

  UPDATE public.characters AS c
  SET level = v_level,
      experience = v_exp,
      max_hp = v_max_hp,
      current_hp = v_cur_hp,
      attack_power = v_atk,
      skill_points = v_sp,
      skill_upgrade_points = v_sup,
      gold = v_new_gold,
      progress_rev = c.progress_rev + 1,
      updated_at = NOW()
  WHERE c.id = p_character_id;

  RETURN QUERY SELECT * FROM public.progress_snapshot(p_character_id, p_exp, v_new_gold - v_char.gold, v_leveled);
END;
$$;

-- A batch of kills the client says it made. p_kills = [{"level": <int>}, ...]. The caller (the
-- edge function) has already validated monster kinds/levels and boss cooldowns; this enforces
-- the rate limit and does the reward math server-side (gold is rolled here, not by the client).
--   exp  = level * 20        gold = level * (4 + 0..7)     (same as combatStore.applyKill)
CREATE OR REPLACE FUNCTION public.apply_kills(
  p_user_id INT,
  p_character_id INT,
  p_kills JSONB
)
RETURNS TABLE (
  r_level INT,
  r_experience INT,
  r_gold INT,
  r_skill_points INT,
  r_skill_upgrade_points INT,
  r_max_hp INT,
  r_max_mp INT,
  r_attack_power INT,
  r_defense_power INT,
  r_stat_str INT,
  r_stat_dex INT,
  r_stat_con INT,
  r_stat_int INT,
  r_stat_wis INT,
  r_progress_rev BIGINT,
  r_exp_gained INT,
  r_gold_gained INT,
  r_leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_n INT;
  v_tokens DOUBLE PRECISION;
  v_kill JSONB;
  v_level INT;
  v_exp INT := 0;
  v_gold INT := 0;
  c_capacity CONSTANT DOUBLE PRECISION := 25;
  c_refill_per_sec CONSTANT DOUBLE PRECISION := 1.5;
BEGIN
  IF p_kills IS NULL OR jsonb_typeof(p_kills) <> 'array' THEN
    RAISE EXCEPTION 'invalid_kills' USING ERRCODE = 'P0001';
  END IF;
  v_n := jsonb_array_length(p_kills);
  IF v_n < 1 OR v_n > 25 THEN
    RAISE EXCEPTION 'invalid_kills' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_tokens := LEAST(
    c_capacity,
    v_char.kill_tokens + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_char.kill_tokens_at))) * c_refill_per_sec
  );
  IF v_tokens < v_n THEN
    -- Raising rolls back this call, so the stored tokens are untouched and keep refilling by time.
    RAISE EXCEPTION 'kill_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  FOR v_kill IN SELECT * FROM jsonb_array_elements(p_kills) LOOP
    v_level := (v_kill ->> 'level')::INT;
    -- Defense in depth: the edge function caps per monster kind; this is the absolute sanity bound.
    IF v_level IS NULL OR v_level < 1 OR v_level > 60 THEN
      RAISE EXCEPTION 'invalid_kills' USING ERRCODE = 'P0001';
    END IF;
    v_exp := v_exp + v_level * 20;
    v_gold := v_gold + v_level * (4 + FLOOR(RANDOM() * 8)::INT);
  END LOOP;

  UPDATE public.characters AS c
  SET kill_tokens = v_tokens - v_n,
      kill_tokens_at = NOW()
  WHERE c.id = p_character_id;

  RETURN QUERY SELECT * FROM public.grant_progress(p_character_id, v_exp, v_gold);
END;
$$;

-- Spend stat points on one stat. Mirrors combatStore.allocateStat / statPointCost:
--   cost = floor(current / 10) + 1
--   the class's primary attack stat (warrior str, archer dex, mage int): +1 attack
--   con: +8 max HP (and current HP), +1 defense       wis: +4 max MP (and current MP)
CREATE OR REPLACE FUNCTION public.allocate_stat(
  p_user_id INT,
  p_character_id INT,
  p_stat TEXT
)
RETURNS TABLE (
  r_level INT,
  r_experience INT,
  r_gold INT,
  r_skill_points INT,
  r_skill_upgrade_points INT,
  r_max_hp INT,
  r_max_mp INT,
  r_attack_power INT,
  r_defense_power INT,
  r_stat_str INT,
  r_stat_dex INT,
  r_stat_con INT,
  r_stat_int INT,
  r_stat_wis INT,
  r_progress_rev BIGINT,
  r_exp_gained INT,
  r_gold_gained INT,
  r_leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_current INT;
  v_cost INT;
  v_primary TEXT;
BEGIN
  IF p_stat IS NULL OR p_stat NOT IN ('str', 'dex', 'con', 'int', 'wis') THEN
    RAISE EXCEPTION 'invalid_stat' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_current := CASE p_stat
    WHEN 'str' THEN v_char.stat_str
    WHEN 'dex' THEN v_char.stat_dex
    WHEN 'con' THEN v_char.stat_con
    WHEN 'int' THEN v_char.stat_int
    ELSE v_char.stat_wis
  END;
  v_cost := FLOOR(v_current / 10.0)::INT + 1;

  IF v_char.skill_points < v_cost THEN
    RAISE EXCEPTION 'insufficient_points' USING ERRCODE = 'P0001';
  END IF;

  v_primary := CASE v_char.character_class WHEN 'warrior' THEN 'str' WHEN 'archer' THEN 'dex' ELSE 'int' END;

  UPDATE public.characters AS c
  SET skill_points = c.skill_points - v_cost,
      stat_str = c.stat_str + (CASE WHEN p_stat = 'str' THEN 1 ELSE 0 END),
      stat_dex = c.stat_dex + (CASE WHEN p_stat = 'dex' THEN 1 ELSE 0 END),
      stat_con = c.stat_con + (CASE WHEN p_stat = 'con' THEN 1 ELSE 0 END),
      stat_int = c.stat_int + (CASE WHEN p_stat = 'int' THEN 1 ELSE 0 END),
      stat_wis = c.stat_wis + (CASE WHEN p_stat = 'wis' THEN 1 ELSE 0 END),
      attack_power = c.attack_power + (CASE WHEN p_stat = v_primary THEN 1 ELSE 0 END),
      max_hp = c.max_hp + (CASE WHEN p_stat = 'con' THEN 8 ELSE 0 END),
      current_hp = c.current_hp + (CASE WHEN p_stat = 'con' THEN 8 ELSE 0 END),
      defense_power = c.defense_power + (CASE WHEN p_stat = 'con' THEN 1 ELSE 0 END),
      max_mp = c.max_mp + (CASE WHEN p_stat = 'wis' THEN 4 ELSE 0 END),
      current_mp = c.current_mp + (CASE WHEN p_stat = 'wis' THEN 4 ELSE 0 END),
      progress_rev = c.progress_rev + 1,
      updated_at = NOW()
  WHERE c.id = p_character_id;

  RETURN QUERY SELECT * FROM public.progress_snapshot(p_character_id);
END;
$$;

-- Shop purchase payment. The item itself is granted by the edge function afterwards (and the
-- gold refunded via grant_progress if that fails).
CREATE OR REPLACE FUNCTION public.spend_gold(
  p_user_id INT,
  p_character_id INT,
  p_amount INT
)
RETURNS TABLE (
  r_level INT,
  r_experience INT,
  r_gold INT,
  r_skill_points INT,
  r_skill_upgrade_points INT,
  r_max_hp INT,
  r_max_mp INT,
  r_attack_power INT,
  r_defense_power INT,
  r_stat_str INT,
  r_stat_dex INT,
  r_stat_con INT,
  r_stat_int INT,
  r_stat_wis INT,
  r_progress_rev BIGINT,
  r_exp_gained INT,
  r_gold_gained INT,
  r_leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.gold < p_amount THEN
    RAISE EXCEPTION 'insufficient_gold' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.characters AS c
  SET gold = c.gold - p_amount,
      progress_rev = c.progress_rev + 1,
      updated_at = NOW()
  WHERE c.id = p_character_id;

  RETURN QUERY SELECT * FROM public.progress_snapshot(p_character_id, 0, -p_amount, FALSE);
END;
$$;

-- Issues drop tickets (one per item id in p_item_ids). Expired tickets are purged and each
-- character holds at most 60 live ones (oldest evicted) so this can't be used to bloat the table.
CREATE OR REPLACE FUNCTION public.issue_drops(
  p_user_id INT,
  p_character_id INT,
  p_item_ids INT[]
)
RETURNS TABLE (r_drop_id UUID, r_item_template_id INT, r_ordinal INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char_id INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT c.id INTO v_char_id
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;
  IF v_char_id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.pending_drops AS d WHERE d.character_id = p_character_id AND d.expires_at <= NOW();

  -- Ids are generated up front (MATERIALIZED so the volatile gen_random_uuid() runs once per row)
  -- and returned straight from the input, so each ticket pairs with its request position exactly —
  -- RETURNING order is not guaranteed, and every row shares the transaction's NOW().
  RETURN QUERY
  WITH input AS MATERIALIZED (
    SELECT gen_random_uuid() AS drop_id, t.item_id, t.ord::INT AS ord
    FROM UNNEST(p_item_ids) WITH ORDINALITY AS t(item_id, ord)
  ),
  inserted AS (
    INSERT INTO public.pending_drops (id, character_id, item_template_id)
    SELECT i.drop_id, p_character_id, i.item_id FROM input AS i
    RETURNING id
  )
  SELECT i.drop_id, i.item_id, i.ord
  FROM input AS i
  JOIN inserted AS ins ON ins.id = i.drop_id
  ORDER BY i.ord;

  -- Cap live tickets (evict oldest beyond 60).
  DELETE FROM public.pending_drops AS d
  WHERE d.id IN (
    SELECT o.id FROM public.pending_drops AS o
    WHERE o.character_id = p_character_id
    ORDER BY o.created_at DESC, o.id
    OFFSET 60
  );
END;
$$;

-- Consumes one ticket. Raises drop_not_found if it doesn't exist, isn't this character's,
-- already redeemed, or expired.
CREATE OR REPLACE FUNCTION public.redeem_drop(
  p_user_id INT,
  p_character_id INT,
  p_drop_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char_id INT;
  v_item INT;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT c.id INTO v_char_id
  FROM public.characters AS c
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;
  IF v_char_id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.pending_drops AS d
  WHERE d.id = p_drop_id AND d.character_id = p_character_id AND d.expires_at > NOW()
  RETURNING d.item_template_id INTO v_item;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'drop_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_item;
END;
$$;

-- The only progress the client may still write: current HP/MP, clamped to the server's maxima.
CREATE OR REPLACE FUNCTION public.sync_character_vitals(
  p_user_id INT,
  p_character_id INT,
  p_hp INT,
  p_mp INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.characters AS c
  SET current_hp = LEAST(GREATEST(p_hp, 0), c.max_hp),
      current_mp = LEAST(GREATEST(p_mp, 0), c.max_mp)
  WHERE c.id = p_character_id AND c.user_id = p_user_id AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Quest rewards are now applied here, atomically with marking the quest claimed (before, the
-- client applied the numbers this returned and then saved them itself).
CREATE OR REPLACE FUNCTION public.claim_quest_reward(
  p_user_id INT,
  p_character_id INT,
  p_quest_template_id INT
)
RETURNS TABLE (reward_xp INT, reward_gold INT, reward_item_id INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_cq public.character_quests;
  v_quest public.quest_templates;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_cq
  FROM public.character_quests
  WHERE character_id = p_character_id AND quest_template_id = p_quest_template_id;

  IF v_cq.id IS NULL THEN
    RAISE EXCEPTION 'quest_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_cq.status <> 'in_progress' THEN
    RAISE EXCEPTION 'quest_already_claimed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_quest
  FROM public.quest_templates
  WHERE id = p_quest_template_id;

  IF v_cq.progress_count < v_quest.target_count THEN
    RAISE EXCEPTION 'quest_not_ready' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.character_quests
  SET status = 'completed', completed_at = NOW(), updated_at = NOW()
  WHERE id = v_cq.id;

  PERFORM public.grant_progress(p_character_id, v_quest.reward_xp, v_quest.reward_gold);

  RETURN QUERY SELECT v_quest.reward_xp, v_quest.reward_gold, v_quest.reward_item_id;
END;
$$;
