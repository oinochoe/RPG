-- Shop feature (docs/superpowers/specs/2026-09-16-inventory-equipment-design.md's shop
-- follow-up): the 6 items seeded in 20260916050714 still had buy_price/sell_price = 0
-- from their column defaults. Sell price is roughly 30% of buy price, typical of the
-- genre's "shops don't pay full value" convention.
UPDATE item_templates SET buy_price = 50, sell_price = 15 WHERE name = '녹슨 검';
UPDATE item_templates SET buy_price = 40, sell_price = 12 WHERE name = '가죽 방패';
UPDATE item_templates SET buy_price = 45, sell_price = 13 WHERE name = '나무 지팡이';
UPDATE item_templates SET buy_price = 35, sell_price = 10 WHERE name = '천리안의 로브';
UPDATE item_templates SET buy_price = 50, sell_price = 15 WHERE name = '나무 활';
UPDATE item_templates SET buy_price = 35, sell_price = 10 WHERE name = '가죽 조끼';
