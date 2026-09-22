import { mulberry32 } from './proceduralTextures';
import { FIELD_ENTRANCE_POINT, FIELD_EXTENT, DESERT_X_START, inRiverZone, inDesertZone, inVillageClearZone } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

// The server's POST /exploration/enter-map always returns monsters: [] (no real monster-
// instance persistence exists yet) — same client-authoritative-content pattern as the
// dungeon's buildFloorMonsters, just for the field. Deterministic (fixed seed) so the roster
// is stable across a session rather than reshuffling on every re-render/area transition.
const SEED = 7;
// Both scaled up alongside worldColliders.ts's FIELD_EXTENT (300 -> 400): count roughly
// matches the ~1.8x area increase, and SCATTER_EXTENT keeps the same margin-from-edge ratio
// the field's own decorations use (FIELD_EXTENT/2 minus a border, here rounded to 180).
const FIELD_MONSTER_COUNT = 90;
const SCATTER_EXTENT = 180;
const SPAWN_CLEAR_RADIUS = 8;
const CAVE_CLEAR_RADIUS = 6;

function inCaveClearZone(x: number, z: number): boolean {
  const dx = x - FIELD_ENTRANCE_POINT[0];
  const dz = z - FIELD_ENTRANCE_POINT[1];
  return Math.hypot(dx, dz) < CAVE_CLEAR_RADIUS;
}

// monster_template_id convention (matches the mock backend / MonsterMesh variant lookup in
// Scene.tsx): 1 = slime, 3 = skeleton. Skeletons only spawn past this distance tier, so the
// field's difficulty curve still reads as "slimes near spawn, skeletons further out" rather
// than a random mix.
const SKELETON_MIN_TIER = 2;

// Desert-only fauna — reuses the skeleton rig/model (template_id 3) rather than a new asset,
// distinguished by name and a sandy tint (see Scene.tsx's monsterTint), same reskin-via-tint
// technique already used for dungeon captains/lords. A distinct enemy for the desert instead
// of it being empty of monsters entirely.
const DESERT_MONSTER_COUNT = 35;
const DESERT_SCATTER_SEED = 21;
const DESERT_X_END = FIELD_EXTENT / 2;
const DESERT_MONSTER_LEVEL = 3;
const DESERT_MONSTER_HP = 75;

function buildDesertMonsters(idBaseStart: number): MonsterInstanceSummary[] {
  const rng = mulberry32(DESERT_SCATTER_SEED);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = idBaseStart;
  let attempts = 0;
  while (monsters.length < DESERT_MONSTER_COUNT && attempts < DESERT_MONSTER_COUNT * 50) {
    attempts++;
    const x = DESERT_X_START + rng() * (DESERT_X_END - DESERT_X_START);
    const z = (rng() - 0.5) * FIELD_EXTENT;
    if (Math.hypot(x, z) > DESERT_X_END) continue;
    monsters.push({
      instance_id: idBase++,
      monster_template_id: 3,
      name: '미라',
      level: DESERT_MONSTER_LEVEL,
      current_hp: DESERT_MONSTER_HP,
      max_hp: DESERT_MONSTER_HP,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }
  return monsters;
}

/** Scattered field monsters — a level/species range that gently rewards wandering farther
 * from spawn, same "stronger the deeper/farther you go" idea as the dungeon's floors. */
export function buildFieldMonsters(): MonsterInstanceSummary[] {
  const rng = mulberry32(SEED);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = 8000;

  let attempts = 0;
  while (monsters.length < FIELD_MONSTER_COUNT && attempts < FIELD_MONSTER_COUNT * 50) {
    attempts++;
    const x = (rng() - 0.5) * SCATTER_EXTENT * 2;
    const z = (rng() - 0.5) * SCATTER_EXTENT * 2;
    if (Math.hypot(x, z) < SPAWN_CLEAR_RADIUS) continue;
    if (inVillageClearZone(x, z)) continue;
    if (inCaveClearZone(x, z)) continue;
    // Slimes/skeletons are grass-zone fauna — the desert (past the river) gets its own
    // separate scatter pass below (buildDesertMonsters), not mixed in with this loop's
    // distance-based tiering.
    if (inRiverZone(x, z) || inDesertZone(x)) continue;

    const distFromSpawn = Math.hypot(x, z);
    const tier = Math.min(2, Math.floor(distFromSpawn / 55));
    const level = 1 + tier;
    const isSkeleton = tier >= SKELETON_MIN_TIER;
    const hp = isSkeleton ? 40 + tier * 15 : 15 + tier * 10;

    monsters.push({
      instance_id: idBase++,
      monster_template_id: isSkeleton ? 3 : 1,
      name: isSkeleton ? '스켈레톤' : '슬라임',
      level,
      current_hp: hp,
      max_hp: hp,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }

  monsters.push(...buildDesertMonsters(idBase));

  return monsters;
}
