-- Seeds monster_templates rows 6/7/8 for the 4-zone world expansion's 3 new field monsters
-- (오크/구울/요정 — see FieldMonsters.ts's buildOrcVillageMonsters/buildGhoulFieldMonsters/
-- buildFairyForestMonsters and MonsterMesh.tsx's ORC_CONFIG/GHOUL_CONFIG/FAIRY_CONFIG), same
-- "IDENTITY continues the existing 1-5 convention" approach as 20260922090000_add_quest_system.
-- Stats scaled above the field's original hardest content (거인 군주 aside, a unique boss) —
-- level/HP match the client-side OUTER_MONSTER_LEVEL/OUTER_MONSTER_HP/GHOUL_MONSTER_* constants.
INSERT INTO monster_templates (name, level, max_hp, attack_power, defense_power, experience_reward, gold_min, gold_max, respawn_seconds) VALUES
  ('오크', 5, 110, 16, 6, 55, 10, 20, 30),
  ('구울', 7, 150, 20, 8, 80, 14, 28, 35),
  ('요정', 5, 110, 15, 5, 55, 10, 20, 30);
