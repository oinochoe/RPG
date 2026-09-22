-- Quest system — quest_templates/character_quests were designed into the schema from the
-- very first migration but never populated or exposed via any API route. monster_templates
-- was ALSO always empty: real monsters are generated entirely client-side (FieldMonsters.ts,
-- Dungeon.tsx) using a stable monster_template_id convention (1=슬라임, 2=고블린, 3=스켈레톤,
-- 4=가시선인장, 5=거인 군주 — see those files' own comments) that never touched this table.
-- Seeding monster_templates with matching rows in this exact order (relying on IDENTITY
-- default starting at 1 on an empty table) makes quest_templates.target_monster_id a
-- meaningful FK without changing that client-side convention at all.
INSERT INTO monster_templates (name, level, max_hp, attack_power, defense_power, experience_reward, gold_min, gold_max, respawn_seconds) VALUES
  ('슬라임', 1, 20, 4, 0, 10, 2, 6, 20),
  ('고블린', 5, 90, 12, 4, 40, 6, 14, 30),
  ('스켈레톤', 3, 55, 9, 2, 25, 4, 10, 25),
  ('가시선인장', 3, 75, 10, 3, 30, 5, 12, 25),
  ('거인 군주', 20, 900, 60, 25, 500, 100, 220, 60);

-- Which flavor NPC (see Village.tsx's flavorNpcs — 촌장/농부/경비병/파수꾼/노인, one per
-- village) offers this quest. NPCs have no numeric id anywhere in this system (they're not
-- DB rows at all, just client-rendered config), so their Korean display name is the only
-- stable identifier — same shape as quest_templates already using target_monster_id's
-- client-side convention instead of a "real" content-managed table.
ALTER TABLE quest_templates ADD COLUMN giver_npc_name TEXT NOT NULL;

-- One-time-accept guard for the (currently all-story) quest set — without this, two rapid
-- "수락" clicks (or a retried request) could insert two in_progress rows for the same quest.
ALTER TABLE character_quests ADD CONSTRAINT uq_character_quests__char_quest UNIQUE (character_id, quest_template_id);

INSERT INTO quest_templates (title, quest_type, required_level, target_monster_id, target_count, reward_xp, reward_gold, reward_item_id, giver_npc_name) VALUES
  ('여울의 골칫거리', 'story', 1, 1, 5, 60, 40, NULL, '촌장'),
  ('밭을 지켜라', 'story', 3, 1, 8, 120, 80, 7, '농부'),
  ('뼈 다귀 정리', 'story', 5, 3, 5, 180, 120, NULL, '경비병'),
  ('가시밭의 불청객', 'story', 5, 4, 6, 200, 140, 8, '파수꾼'),
  ('오래된 소문', 'story', 8, 2, 6, 260, 180, NULL, '노인');

-- Accepts a quest for the caller's own character — mirrors upgrade_character_skill's shape
-- (advisory lock, RAISE EXCEPTION 'reason' with a P0001/P0002 ERRCODE the edge function's
-- mapXxxRpcError maps to the API error envelope).
CREATE OR REPLACE FUNCTION public.accept_quest(
  p_user_id INT,
  p_character_id INT,
  p_quest_template_id INT
)
RETURNS TABLE (quest_template_id INT, status TEXT, progress_count INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
  v_quest public.quest_templates;
  v_existing public.character_quests;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_quest
  FROM public.quest_templates
  WHERE id = p_quest_template_id;

  IF v_quest.id IS NULL THEN
    RAISE EXCEPTION 'quest_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_char.level < v_quest.required_level THEN
    RAISE EXCEPTION 'level_requirement_unmet' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM public.character_quests
  WHERE character_id = p_character_id AND quest_template_id = p_quest_template_id;

  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'already_accepted' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    INSERT INTO public.character_quests (character_id, quest_template_id, status, progress_count)
    VALUES (p_character_id, p_quest_template_id, 'in_progress', 0)
    RETURNING quest_template_id, status, progress_count;
END;
$$;

-- Called once per monster kill (client-reported immediately — see combatStore's applyKill)
-- with that monster's monster_template_id. Bumps progress on every in_progress quest whose
-- target matches, capped at target_count — a monster kind can theoretically be the target of
-- more than one active quest at once (e.g. two different NPCs both wanting 슬라임 kills), so
-- this updates every matching row in one statement rather than assuming just one.
CREATE OR REPLACE FUNCTION public.report_quest_kill(
  p_user_id INT,
  p_character_id INT,
  p_monster_template_id INT
)
RETURNS TABLE (quest_template_id INT, status TEXT, progress_count INT, target_count INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_char public.characters;
BEGIN
  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT * INTO v_char
  FROM public.characters
  WHERE id = p_character_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF v_char.id IS NULL THEN
    RAISE EXCEPTION 'character_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
    UPDATE public.character_quests cq
    SET progress_count = LEAST(cq.progress_count + 1, qt.target_count),
        updated_at = NOW()
    FROM public.quest_templates qt
    WHERE cq.quest_template_id = qt.id
      AND cq.character_id = p_character_id
      AND cq.status = 'in_progress'
      AND qt.target_monster_id = p_monster_template_id
      AND cq.progress_count < qt.target_count
    RETURNING cq.quest_template_id, cq.status, cq.progress_count, qt.target_count;
END;
$$;

-- Turn-in: only allowed once progress_count has reached target_count (reaching the count
-- alone does NOT auto-complete the quest — see report_quest_kill, which only ever caps
-- progress_count; status flips to 'completed' here, at claim time, matching the "talk to the
-- NPC to turn it in" flow rather than auto-completing silently mid-fight). Returns the
-- reward fields for the edge function to apply — XP/gold are client-side-only state (same
-- as every other combat number in this project) and reward_item_id needs the same
-- insert-or-stack inventory logic /me/inventory/buy already has, so neither is applied here.
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

  RETURN QUERY SELECT v_quest.reward_xp, v_quest.reward_gold, v_quest.reward_item_id;
END;
$$;
