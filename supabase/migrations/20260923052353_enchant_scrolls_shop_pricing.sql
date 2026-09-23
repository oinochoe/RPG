-- Drops alone might be too stingy to realistically reach — the user asked for a shop safety
-- net at a steep price, so scrolls are purchasable again (still drop too, at the weights
-- already set in lootStore.ts's DROP_TABLE). 축복 is priced far above anything else in the
-- catalog since it's a guaranteed, risk-free multi-level jump; 저주 sits well above a normal
-- consumable since it's a deliberate safety-retreat tool, not a throwaway item; 일반 stays
-- cheap since it's the common, riskier option most players will lean on early.
UPDATE public.item_templates SET buy_price = 400 WHERE id = 50; -- 일반 강화 주문서
UPDATE public.item_templates SET buy_price = 25000 WHERE id = 47; -- 축복의 강화 주문서
UPDATE public.item_templates SET buy_price = 3000 WHERE id = 48; -- 저주의 강화 주문서
