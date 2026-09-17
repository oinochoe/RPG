ALTER TABLE characters
  ADD COLUMN skill_upgrade_points INT NOT NULL DEFAULT 0 CHECK (skill_upgrade_points >= 0);

INSERT INTO skill_templates (name, character_class, required_level, max_level, mp_cost, cooldown_seconds, range_distance, damage_multiplier)
VALUES
  ('강타', 'warrior', 1, 10, 15, 4, 2, 2.5),
  ('관통사격', 'archer', 1, 10, 15, 4, 7, 2.0),
  ('파이어볼', 'mage', 1, 10, 20, 5, 6, 2.2);
