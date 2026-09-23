import { mulberry32 } from './proceduralTextures';
import {
  FIELD_EXTENT,
  DESERT_X_START,
  DESERT_X_END,
  OUTER_ZONE_BOUND,
  inRiverZone,
  inDesertZone,
  inVillageClearZone,
  inCaveClearZone,
  inFairyForestZone,
  inOrcVillageZone,
  inBoneFieldZone,
  inGhoulFieldZone,
} from './worldColliders';
import type { BossCooldown, MonsterInstanceSummary } from '../../types/api';
import { isBossOnCooldown } from '../../stores/combatStore';

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

// monster_template_id convention (matches the mock backend / MonsterMesh variant lookup in
// Scene.tsx): 1 = slime, 3 = skeleton. Skeletons only spawn past this distance tier, so the
// field's difficulty curve still reads as "slimes near spawn, skeletons further out" rather
// than a random mix.
const SKELETON_MIN_TIER = 2;

// Desert-only fauna — 가시선인장 (Cactoro, a Quaternius CC0 cactus creature; see MonsterMesh's
// CACTORO_VARIANT/CACTORO_CONFIG) as monster_template_id 4, a real dedicated model rather than
// reskinning the dungeon's skeleton with a tint. A distinct enemy for the desert instead of it
// being empty of monsters entirely.
const DESERT_MONSTER_COUNT = 35;
const DESERT_SCATTER_SEED = 21;
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
      monster_template_id: 4,
      name: '가시선인장',
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

// The 4 outer-ring danger zones past OUTER_ZONE_BOUND (see worldColliders.ts's
// inFairyForestZone/inOrcVillageZone/inBoneFieldZone/inGhoulFieldZone) — all tougher than
// anything in the original field, rejection-sampled within each zone's rectangular bounds the
// same way buildDesertMonsters samples the desert band.
const FIELD_HALF = FIELD_EXTENT / 2;
const OUTER_MONSTER_COUNT = 40;
const OUTER_MONSTER_LEVEL = 5;
const OUTER_MONSTER_HP = 110;
const GHOUL_MONSTER_LEVEL = 7;
const GHOUL_MONSTER_HP = 150;

function buildFairyForestMonsters(idBaseStart: number): MonsterInstanceSummary[] {
  const rng = mulberry32(31);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = idBaseStart;
  let attempts = 0;
  while (monsters.length < OUTER_MONSTER_COUNT && attempts < OUTER_MONSTER_COUNT * 50) {
    attempts++;
    const x = -FIELD_HALF + rng() * (DESERT_X_END + FIELD_HALF);
    const z = OUTER_ZONE_BOUND + rng() * (FIELD_HALF - OUTER_ZONE_BOUND);
    if (!inFairyForestZone(x, z)) continue;
    monsters.push({
      instance_id: idBase++,
      monster_template_id: 8,
      name: '버섯왕',
      level: OUTER_MONSTER_LEVEL,
      current_hp: OUTER_MONSTER_HP,
      max_hp: OUTER_MONSTER_HP,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }
  return monsters;
}

function buildOrcVillageMonsters(idBaseStart: number): MonsterInstanceSummary[] {
  const rng = mulberry32(32);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = idBaseStart;
  let attempts = 0;
  while (monsters.length < OUTER_MONSTER_COUNT && attempts < OUTER_MONSTER_COUNT * 50) {
    attempts++;
    const x = -FIELD_HALF + rng() * (DESERT_X_END + FIELD_HALF);
    const z = -FIELD_HALF + rng() * (FIELD_HALF - OUTER_ZONE_BOUND);
    if (!inOrcVillageZone(x, z)) continue;
    // 오크 소굴's entrance sits inside this zone (see worldColliders.ts's DUNGEON_ENTRANCES) —
    // keep monsters off the cave mouth same as the field's own inCaveClearZone use.
    if (inCaveClearZone(x, z)) continue;
    monsters.push({
      instance_id: idBase++,
      monster_template_id: 6,
      name: '오크',
      level: OUTER_MONSTER_LEVEL,
      current_hp: OUTER_MONSTER_HP,
      max_hp: OUTER_MONSTER_HP,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }
  return monsters;
}

function buildBoneFieldMonsters(idBaseStart: number): MonsterInstanceSummary[] {
  const rng = mulberry32(33);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = idBaseStart;
  let attempts = 0;
  while (monsters.length < OUTER_MONSTER_COUNT && attempts < OUTER_MONSTER_COUNT * 50) {
    attempts++;
    const x = -FIELD_HALF + rng() * (FIELD_HALF - OUTER_ZONE_BOUND);
    const z = (rng() - 0.5) * OUTER_ZONE_BOUND * 2;
    if (!inBoneFieldZone(x, z)) continue;
    monsters.push({
      instance_id: idBase++,
      monster_template_id: 3,
      name: '해골 전사',
      level: OUTER_MONSTER_LEVEL,
      current_hp: OUTER_MONSTER_HP,
      max_hp: OUTER_MONSTER_HP,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }
  return monsters;
}

function buildGhoulFieldMonsters(idBaseStart: number): MonsterInstanceSummary[] {
  const rng = mulberry32(34);
  const monsters: MonsterInstanceSummary[] = [];
  let idBase = idBaseStart;
  let attempts = 0;
  while (monsters.length < OUTER_MONSTER_COUNT && attempts < OUTER_MONSTER_COUNT * 50) {
    attempts++;
    const x = DESERT_X_END + rng() * (FIELD_HALF - DESERT_X_END);
    const z = (rng() - 0.5) * FIELD_HALF * 2;
    if (!inGhoulFieldZone(x)) continue;
    // 저주받은 묘지's entrance sits inside this zone — same cave-mouth clearance as above.
    if (inCaveClearZone(x, z)) continue;
    monsters.push({
      instance_id: idBase++,
      monster_template_id: 7,
      name: '구울',
      level: GHOUL_MONSTER_LEVEL,
      current_hp: GHOUL_MONSTER_HP,
      max_hp: GHOUL_MONSTER_HP,
      position_x: Math.round(x * 10) / 10,
      position_y: 0,
      position_z: Math.round(z * 10) / 10,
    });
  }
  return monsters;
}

// The field's own world boss — a single, fixed-position unique reusing monster_template_id 5
// (Giant), same "share a template, override name/level/hp client-side" trick the dungeon's own
// 고블린 대장/오크 대장/구울 대장 use, so no new DB row or 3D asset was needed. Sits deep inside
// 구울 평원 (the hardest of the 4 outer zones), far past the dungeon entrance and any NPC in
// that zone. Deliberately much tougher than any dungeon boss — see Scene.tsx's monsterScale,
// which checks this name first and scales it up beyond even the Giant model's own dungeon use.
const WORLD_BOSS_LEVEL = 40;
const WORLD_BOSS_HP = 5000;
const WORLD_BOSS_POSITION: [number, number] = [300, -260];
const WORLD_BOSS_ID = 8999;

function buildWorldBoss(): MonsterInstanceSummary[] {
  return [
    {
      instance_id: WORLD_BOSS_ID,
      monster_template_id: 5,
      name: '태고의 거인',
      level: WORLD_BOSS_LEVEL,
      current_hp: WORLD_BOSS_HP,
      max_hp: WORLD_BOSS_HP,
      position_x: WORLD_BOSS_POSITION[0],
      position_y: 0,
      position_z: WORLD_BOSS_POSITION[1],
    },
  ];
}

// The field's regular monsters are all passive (retaliate once hit — Scene.tsx/worldStore.ts
// used to pass a flat `false` for the whole field roster) — only the world boss aggros on
// sight, same "the one strong one is the exception" pattern the dungeon's
// isDungeonEscortAggressive uses for its own captains/bosses.
export function isFieldBossAggressive(monster: MonsterInstanceSummary): boolean {
  return monster.name.includes('태고');
}

/** Scattered field monsters — a level/species range that gently rewards wandering farther
 * from spawn, same "stronger the deeper/farther you go" idea as the dungeon's floors.
 * `bossCooldowns` (the character's own boss_cooldowns, if known at build time) omits the
 * world boss entirely while it's still on its server-tracked respawn cooldown — see
 * combatStore's BOSS_KEY_BY_NAME/isBossOnCooldown. */
export function buildFieldMonsters(bossCooldowns?: BossCooldown[]): MonsterInstanceSummary[] {
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
  idBase += DESERT_MONSTER_COUNT;
  monsters.push(...buildFairyForestMonsters(idBase));
  idBase += OUTER_MONSTER_COUNT;
  monsters.push(...buildOrcVillageMonsters(idBase));
  idBase += OUTER_MONSTER_COUNT;
  monsters.push(...buildBoneFieldMonsters(idBase));
  idBase += OUTER_MONSTER_COUNT;
  monsters.push(...buildGhoulFieldMonsters(idBase));
  if (!isBossOnCooldown('태고의 거인', bossCooldowns)) {
    monsters.push(...buildWorldBoss());
  }

  return monsters;
}
