-- 순간이동 주문서 used to warp from the field to the dungeon entrance, crossing area types.
-- Rescoped to a same-area-only "blink": field stays within the field, dungeon stays within
-- the current floor. Renaming the enum value from 'dungeon' to 'blink' makes that scoping
-- explicit at the schema level instead of overloading 'dungeon' with new client-side meaning.
ALTER TABLE item_templates DROP CONSTRAINT item_templates_teleport_target_check;
UPDATE item_templates SET teleport_target = 'blink' WHERE teleport_target = 'dungeon';
ALTER TABLE item_templates
  ADD CONSTRAINT item_templates_teleport_target_check CHECK (teleport_target IN ('village', 'blink'));
