-- First pass (400/3000/25000) was still too cheap per user feedback: enchanting should be a
-- real gold sink, "Lineage-style hard to afford". 일반 now priced above 저주 deliberately per
-- explicit user instruction (normal is the scroll used on every attempt, so it should hurt
-- more to buy repeatedly) with 축복 kept the clear premium above both.
UPDATE public.item_templates SET buy_price = 75000 WHERE id = 50; -- 일반 강화 주문서
UPDATE public.item_templates SET buy_price = 60000 WHERE id = 48; -- 저주의 강화 주문서
UPDATE public.item_templates SET buy_price = 300000 WHERE id = 47; -- 축복의 강화 주문서
