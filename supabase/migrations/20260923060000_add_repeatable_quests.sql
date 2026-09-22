-- All 5 existing quests are one-time 'story' quests, permanently tied to a personal loss for
-- their giver NPC (see the 20260922100000 narrative rewrite) — appropriate for a one-time
-- payoff, not for "kill more of the same monster forever." Adds one genuinely repeatable
-- "bounty" quest per existing giver NPC instead of turning the story ones repeatable, so the
-- emotional one-time quest keeps its real closure while there's still an ongoing reason to
-- talk to that NPC again. Smaller target counts/rewards than the story quest, no item reward.
INSERT INTO quest_templates (title, quest_type, required_level, target_monster_id, target_count, reward_xp, reward_gold, reward_item_id, giver_npc_name) VALUES
  ('여울의 작은 심부름', 'repeatable', 1, 1, 3, 25, 20, NULL, '촌장'),
  ('다시, 밭 순찰', 'repeatable', 3, 1, 4, 40, 30, NULL, '농부'),
  ('성문 경계', 'repeatable', 5, 3, 3, 60, 45, NULL, '경비병'),
  ('사막 길 순찰', 'repeatable', 5, 4, 4, 70, 50, NULL, '파수꾼'),
  ('던전 어귀 정찰', 'repeatable', 8, 2, 4, 90, 65, NULL, '노인');

-- accept_quest previously hard-rejected any second accept of the same quest_template_id
-- regardless of status ('already_accepted') — correct for the one-time story quests, wrong
-- for these new repeatable ones, which need to go back to in_progress/progress_count=0 once
-- their prior completed run has been claimed. Only that one case (repeatable AND already
-- completed) takes the reset path; a story quest, or a repeatable one still in_progress,
-- keeps the original reject. Also re-applies the table-alias fix from
-- 20260922090100_fix_accept_quest_ambiguous_column.sql to the new UPDATE...RETURNING branch,
-- which has the same OUT-parameter-name collision risk as everywhere else this has bitten
-- (quest_template_id/status/progress_count are both this function's RETURNS TABLE columns
-- and real character_quests columns).
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
  FROM public.character_quests cq
  WHERE cq.character_id = p_character_id AND cq.quest_template_id = p_quest_template_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_quest.quest_type = 'repeatable' AND v_existing.status = 'completed' THEN
      RETURN QUERY
        UPDATE public.character_quests AS cq
        SET status = 'in_progress', progress_count = 0, completed_at = NULL, updated_at = NOW()
        WHERE cq.id = v_existing.id
        RETURNING cq.quest_template_id, cq.status, cq.progress_count;
      RETURN;
    END IF;
    RAISE EXCEPTION 'already_accepted' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    INSERT INTO public.character_quests AS cq (character_id, quest_template_id, status, progress_count)
    VALUES (p_character_id, p_quest_template_id, 'in_progress', 0)
    RETURNING cq.quest_template_id, cq.status, cq.progress_count;
END;
$$;
