-- Boss-exclusive endgame gear per user request: "상점에 안파는 장비들도 보스몹은 드롭을 해야
-- 의미있겠지?" — one weapon + one body_armor per class, buy_price 0 (never sold — the shop
-- route already filters buy_price > 0, so these are automatically invisible there), only
-- obtainable from the 4 tracked unique bosses (see lootStore.ts's new BOSS_DROP_TABLE). Level
-- 35 and clearly above the existing top tier (lvl25 weapons at atk22-24, lvl20 body_armor at
-- def10-12): warrior atk40/def24, archer atk38/def18, mage atk34/def18 (mage stays a couple
-- points under warrior/archer, matching the existing lvl15/25 tiers' own gap).
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus, buy_price, sell_price)
VALUES
  ('태고의 파쇄검', 'weapon', 'weapon', 35, 'warrior', 40, 0, 0, 1200),
  ('거인 군주의 판금 갑주', 'armor', 'body_armor', 35, 'warrior', 0, 24, 0, 1000),
  ('태고의 심판 지팡이', 'weapon', 'weapon', 35, 'mage', 34, 0, 0, 1200),
  ('태고의 대현자 로브', 'armor', 'body_armor', 35, 'mage', 0, 18, 0, 1000),
  ('태고의 관통궁', 'weapon', 'weapon', 35, 'archer', 38, 0, 0, 1200),
  ('그림자 군주의 은신 갑옷', 'armor', 'body_armor', 35, 'archer', 0, 18, 0, 1000);
