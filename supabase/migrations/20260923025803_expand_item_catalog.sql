-- Item catalog was stuck at 15 rows (2-3 gear tiers per class, no helmet/boots/ring/necklace
-- at all despite EQUIP_SLOT_LABEL already supporting them client-side) while monster/dungeon
-- content has grown well past what that gear range supports (dungeon floors up to level 20,
-- 태고의 거인 world boss at level 40). Adds a 3rd/4th weapon+armor tier per class, a warrior
-- body_armor line (didn't exist before — warriors had no dedicated body slot item), and 4
-- universal (required_class NULL) accessory lines at 3-4 tiers each, plus a 최상급 potion tier.
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus, buy_price, sell_price)
VALUES
  -- Warrior
  ('기사의 장검', 'weapon', 'weapon', 15, 'warrior', 14, 0, 800, 240),
  ('용사의 대검', 'weapon', 'weapon', 25, 'warrior', 24, 0, 2500, 750),
  ('강철 방패', 'armor', 'shield', 10, 'warrior', 0, 6, 600, 180),
  ('기사단의 방패', 'armor', 'shield', 20, 'warrior', 0, 11, 1800, 540),
  ('가죽 갑옷', 'armor', 'body_armor', 1, 'warrior', 0, 2, 45, 13),
  ('사슬 갑옷', 'armor', 'body_armor', 10, 'warrior', 0, 6, 600, 180),
  ('판금 갑옷', 'armor', 'body_armor', 20, 'warrior', 0, 12, 2000, 600),
  -- Mage
  ('비전의 지팡이', 'weapon', 'weapon', 15, 'mage', 13, 0, 800, 240),
  ('대마도사의 지팡이', 'weapon', 'weapon', 25, 'mage', 22, 0, 2500, 750),
  ('현자의 로브', 'armor', 'body_armor', 10, 'mage', 0, 5, 600, 180),
  ('대마도사의 로브', 'armor', 'body_armor', 20, 'mage', 0, 10, 2000, 600),
  -- Archer
  ('정예 궁수의 활', 'weapon', 'weapon', 15, 'archer', 14, 0, 800, 240),
  ('바람의 활', 'weapon', 'weapon', 25, 'archer', 24, 0, 2500, 750),
  ('정찰병의 갑옷', 'armor', 'body_armor', 10, 'archer', 0, 5, 600, 180),
  ('그림자 가죽 갑옷', 'armor', 'body_armor', 20, 'archer', 0, 10, 2000, 600),
  -- Universal accessories (required_class NULL — any class can equip)
  ('가죽 모자', 'armor', 'helmet', 1, NULL, 0, 1, 30, 9),
  ('강철 투구', 'armor', 'helmet', 10, NULL, 0, 4, 500, 150),
  ('용맹의 투구', 'armor', 'helmet', 20, NULL, 0, 8, 1600, 480),
  ('가죽 신발', 'armor', 'boots', 1, NULL, 0, 1, 30, 9),
  ('여행자의 장화', 'armor', 'boots', 10, NULL, 0, 4, 500, 150),
  ('바람의 장화', 'armor', 'boots', 20, NULL, 0, 8, 1600, 480),
  ('낡은 반지', 'armor', 'ring', 1, NULL, 1, 0, 30, 9),
  ('힘의 반지', 'armor', 'ring', 10, NULL, 4, 0, 500, 150),
  ('파괴의 반지', 'armor', 'ring', 20, NULL, 8, 0, 1600, 480),
  ('왕의 반지', 'armor', 'ring', 30, NULL, 12, 0, 4000, 1200),
  ('나무 목걸이', 'armor', 'necklace', 1, NULL, 0, 1, 30, 9),
  ('수호의 목걸이', 'armor', 'necklace', 10, NULL, 0, 4, 500, 150),
  ('대지의 목걸이', 'armor', 'necklace', 20, NULL, 0, 8, 1600, 480),
  ('여신의 목걸이', 'armor', 'necklace', 30, NULL, 0, 12, 4000, 1200);

INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, heal_hp, buy_price, sell_price)
VALUES
  ('최상급 체력 물약', 'consumable', NULL, 1, NULL, 220, 120, 35);

INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, restore_mp, buy_price, sell_price)
VALUES
  ('최상급 마나 물약', 'consumable', NULL, 1, NULL, 110, 120, 35);
