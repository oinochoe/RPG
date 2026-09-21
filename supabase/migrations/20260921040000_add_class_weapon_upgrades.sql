-- Each class only ever had one possible weapon (its starter item), so "does equipping a
-- different weapon change the character's visual model" was previously a no-op -- there was
-- never a second weapon to switch to. Adds one purchasable upgrade weapon per class (KayKit
-- Fantasy Weapons Bits pack), priced/statted as a real early-game upgrade over the starter
-- gear (buy_price 50 / attack_bonus 2-3 / required_level 1 -- see 20260916061044).
INSERT INTO public.item_templates
  (name, item_type, equip_slot, required_level, required_class, attack_bonus, defense_bonus, buy_price, sell_price)
VALUES
  ('강철 검', 'weapon', 'weapon', 5, 'warrior', 7, 0, 200, 60),
  ('대현자의 지팡이', 'weapon', 'weapon', 5, 'mage', 6, 0, 200, 60),
  ('사냥꾼의 장궁', 'weapon', 'weapon', 5, 'archer', 7, 0, 200, 60);
