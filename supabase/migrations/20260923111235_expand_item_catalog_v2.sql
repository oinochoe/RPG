-- Item catalog expansion #1 (of the user's "아이템/몬스터/지도/던전 다 확장" request) —
-- referencing Lineage Classic's real item DB (lineageclassic.inven.co.kr) for authentic
-- names/effects. Scoped to items that fit EXISTING mechanics (heal_hp/haste_duration_sec, or
-- pure sell-fodder materials with no special column) rather than inventing new systems in this
-- pass — poison-cure/durability/light-radius items from the reference list were skipped since
-- this game has no poison, durability, or lit-radius mechanics to hook them into.
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, haste_duration_sec, buy_price, sell_price)
VALUES
  -- 강화 초록 물약 (Enhanced Green Potion) — same haste buff as 초록 물약, just the real
  -- item's own much longer duration (1800s vs 300s) and priced/sold accordingly.
  ('강화 초록 물약', 'consumable', NULL, 10, NULL, 1800, 600, 180);

-- Pure sell-fodder materials/gems (item_type='misc' — the catalog's existing check constraint
-- already allows weapon/armor/consumable/scroll/misc, no schema change needed — no equip_slot,
-- no special effect column, buy_price 0, drop-only). 3 tiers per gem, matching the reference
-- list's own 루비/상급 루비/최상급 루비 naming convention.
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, buy_price, sell_price)
VALUES
  ('루비', 'misc', NULL, 1, NULL, 0, 50),
  ('상급 루비', 'misc', NULL, 1, NULL, 0, 150),
  ('최상급 루비', 'misc', NULL, 1, NULL, 0, 400),
  ('사파이어', 'misc', NULL, 1, NULL, 0, 50),
  ('상급 사파이어', 'misc', NULL, 1, NULL, 0, 150),
  ('최상급 사파이어', 'misc', NULL, 1, NULL, 0, 400),
  ('에메랄드', 'misc', NULL, 1, NULL, 0, 60),
  ('상급 에메랄드', 'misc', NULL, 1, NULL, 0, 180),
  ('최상급 에메랄드', 'misc', NULL, 1, NULL, 0, 450),
  ('다이아몬드', 'misc', NULL, 1, NULL, 0, 100),
  ('상급 다이아몬드', 'misc', NULL, 1, NULL, 0, 300),
  ('최상급 다이아몬드', 'misc', NULL, 1, NULL, 0, 800),
  ('동물 가죽', 'misc', NULL, 1, NULL, 0, 15),
  ('뼛조각', 'misc', NULL, 1, NULL, 0, 15),
  ('철 덩어리', 'misc', NULL, 1, NULL, 0, 30),
  ('미스릴', 'misc', NULL, 1, NULL, 0, 200);
