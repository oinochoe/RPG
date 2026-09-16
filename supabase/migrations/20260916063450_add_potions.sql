-- Consumables (potions/hotbar feature). MP restoration is intentionally out of scope —
-- there's no MP-spending mechanic (skills) implemented in combat yet, and combatStore's
-- PlayerCombatState doesn't even track current MP, so an MP potion would have nothing to
-- do. HP-only for now.
ALTER TABLE item_templates
  ADD COLUMN heal_hp INT NOT NULL DEFAULT 0 CHECK (heal_hp >= 0);

INSERT INTO item_templates
  (name, item_type, equip_slot, required_level, required_class, heal_hp, buy_price, sell_price)
VALUES
  ('체력 물약', 'consumable', NULL, 1, NULL, 40, 15, 4),
  ('상급 체력 물약', 'consumable', NULL, 1, NULL, 100, 45, 12);
