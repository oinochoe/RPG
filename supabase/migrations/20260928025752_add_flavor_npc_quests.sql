INSERT INTO quest_templates (id, title, quest_type, required_level, target_monster_id, target_count, reward_xp, reward_gold, reward_item_id, giver_npc_name) VALUES
  (12, '빨래터의 불청객', 'story', 2, 1, 6, 50, 35, NULL, '빨래하는 아낙'),
  (13, '방앗간 창고 지키기', 'story', 8, 11, 5, 130, 90, 7, '방앗간지기'),
  (14, '사막 대상의 손실', 'story', 6, 10, 5, 100, 80, NULL, '사막 상인'),
  (15, '빨래터 순찰', 'repeatable', 2, 1, 3, 20, 15, NULL, '빨래하는 아낙'),
  (16, '창고 재점검', 'repeatable', 8, 11, 3, 55, 40, NULL, '방앗간지기'),
  (17, '대상로 정찰', 'repeatable', 6, 10, 3, 45, 35, NULL, '사막 상인');
