-- Mana potions were explicitly skipped in 20260916063450_add_potions.sql because MP/skills
-- didn't exist yet ("an MP potion would have nothing to do"). Skills now cost MP
-- (SKILL_BY_CLASS in combatStore.ts), so restoring it mid-fight is real utility. Priced to
-- mirror the HP potions exactly (same buy/sell), just against a much smaller max_mp pool
-- instead of max_hp -- restore_mp values are picked to cover roughly one and ~two skill
-- casts (mpCost 15-20 per SKILL_BY_CLASS) rather than matching the HP potions' raw numbers.
ALTER TABLE item_templates
  ADD COLUMN restore_mp INT NOT NULL DEFAULT 0 CHECK (restore_mp >= 0);

INSERT INTO item_templates
  (name, item_type, equip_slot, required_level, required_class, restore_mp, buy_price, sell_price)
VALUES
  ('마나 물약', 'consumable', NULL, 1, NULL, 20, 15, 4),
  ('상급 마나 물약', 'consumable', NULL, 1, NULL, 50, 45, 12);
