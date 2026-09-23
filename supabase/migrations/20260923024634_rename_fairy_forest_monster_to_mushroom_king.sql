-- monster_templates id 8 was seeded as "요정" (fairy) alongside the original Quaternius
-- "Hywirl" model, which the user rejected as not looking like a real fairy-tale creature. No
-- CC0 werewolf/faun/centaur/arachne exists in Quaternius's catalog either (checked twice), so
-- the zone's monster was replaced with Quaternius's Mushroom King model instead (see
-- MonsterMesh.tsx's MUSHROOM_KING_CONFIG) — renaming the seeded row to match.
UPDATE monster_templates SET name = '버섯왕' WHERE id = 8;
