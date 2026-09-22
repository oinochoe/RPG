-- Two consumable scrolls: 마을 귀환 주문서 teleports to the village from anywhere (field or
-- dungeon), 순간이동 주문서 teleports to the dungeon entrance from the field (a no-op if
-- already in the dungeon -- there's nothing meaningful to warp to there, since dungeon
-- floors all reuse near-origin coordinates rather than having a real position on the field).
-- teleport_target mirrors heal_hp/restore_mp's "what does using this item do" pattern, just
-- an enum instead of a magnitude.
ALTER TABLE item_templates
  ADD COLUMN teleport_target TEXT NULL CHECK (teleport_target IN ('village', 'dungeon'));

INSERT INTO item_templates
  (name, item_type, equip_slot, required_level, required_class, teleport_target, buy_price, sell_price)
VALUES
  ('마을 귀환 주문서', 'consumable', NULL, 1, NULL, 'village', 50, 12),
  ('순간이동 주문서', 'consumable', NULL, 1, NULL, 'dungeon', 50, 12);
