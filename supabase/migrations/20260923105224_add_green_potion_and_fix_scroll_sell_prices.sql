-- 초록 물약 (Green Potion) — per user reference to Lineage Classic's real 속도향상 물약
-- (movement-speed buff, ~300s duration, cheap/common) plus their own explicit ask for attack
-- speed too ("속도 빨라지고 공속 좀 더 빨라지는"). New dedicated column rather than name-
-- matching client-side, same convention heal_hp/restore_mp/teleport_target already use for
-- "what does using this item actually do."
ALTER TABLE public.item_templates ADD COLUMN haste_duration_sec INT NOT NULL DEFAULT 0;

INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, haste_duration_sec, buy_price, sell_price)
VALUES
  ('초록 물약', 'consumable', NULL, 1, NULL, 90, 80, 25);

-- Sell prices were never touched when buy_price got bumped hard in the enchant-scroll pricing
-- passes (up to 300,000), leaving them at a fraction-of-a-percent resale — real user feedback:
-- "아이템 판매 금액은 왜케 낮어?? %로 따지는건감??". Every other item in the catalog sells
-- back around 30% of its buy price; scrolls get the same ratio now.
UPDATE public.item_templates SET sell_price = 22500 WHERE id = 50; -- 일반 강화 주문서 (75,000 buy)
UPDATE public.item_templates SET sell_price = 18000 WHERE id = 48; -- 저주의 강화 주문서 (60,000 buy)
UPDATE public.item_templates SET sell_price = 90000 WHERE id = 47; -- 축복의 강화 주문서 (300,000 buy)
