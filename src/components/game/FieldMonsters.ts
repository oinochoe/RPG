import { mulberry32 } from './proceduralTextures';
import { FIELD_ENTRANCE_POINT } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

// The server's POST /exploration/enter-map always returns monsters: [] (no real monster-
// instance persistence exists yet) — same client-authoritative-content pattern as the
// dungeon's buildFloorMonsters, just for the field. Deterministic (fixed seed) so the roster
// is stable across a session rather than reshuffling on every re-render/area transition.
const SEED = 7;
const FIELD_MONSTER_COUNT = 16;
const SCATTER_EXTENT = 55;
const SPAWN_CLEAR_RADIUS = 8;
const VILLAGE_CLEAR_X: [number, number] = [-42, -22];
const VILLAGE_CLEAR_Z: [number, number] = [-10, 10];
const CAVE_CLEAR_RADIUS = 6;

function inVillageClearZone(x: number, z: number): boolean {
  return x >= VILLAGE_CLEAR_X[0] && x <= VILLAGE_CLEAR_X[1] && z >= VILLAGE_CLEAR_Z[0] && z <= VILLAGE_CLEAR_Z[1];
}

function inCaveClearZone(x: number, z: number): boolean {
  const dx = x - FIELD_ENTRANCE_POINT[0];
  const dz = z - FIELD_ENTRANCE_POINT[1];
  return Math.hypot(dx, dz) < CAVE_CLEAR_RADIUS;
}

/** Scattered, passive field slimes — a level range that gently rewards wandering farther
 * from spawn, same "stronger the deeper/farther you go" idea as the dungeon's floors. */
export function buildFieldMonsters(): MonsterInstanceSummary[] {
  const rng = mulberry32(SEED);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = 8000;

  while (monsters.length < FIELD_MONSTER_COUNT) {
    const x = (rng() - 0.5) * SCATTER_EXTENT * 2;
    const z = (rng() - 0.5) * SCATTER_EXTENT * 2;
    if (Math.hypot(x, z) < SPAWN_CLEAR_RADIUS) continue;
    if (inVillageClearZone(x, z)) continue;
    if (inCaveClearZone(x, z)) continue;

    const distFromSpawn = Math.hypot(x, z);
    const level = 1 + Math.min(2, Math.floor(distFromSpawn / 25));
    const hp = 15 + (level - 1) * 10;

    monsters.push({
      instance_id: idBase++,
      monster_template_id: 1,
      name: '슬라임',
      level,
      current_hp: hp,
      max_hp: hp,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }

  return monsters;
}
