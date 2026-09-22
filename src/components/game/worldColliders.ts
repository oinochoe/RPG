import { mulberry32 } from './proceduralTextures';

const SEED = 42;
const DECORATION_COUNT = 1600;
export const FIELD_EXTENT = 300;
const CLEAR_RADIUS = 3.5;

// Mirrors CharacterMesh's own movement collision radius — shared here so other systems (e.g.
// characterStore's teleport-scroll blink) that need to place the player without walking them
// there can reuse the exact same radius resolveMovement already collides against.
export const PLAYER_COLLISION_RADIUS = 0.4;

// East of the river is a desert biome instead of grass — RIVER_* defines the water strip
// separating them. Both zones run the full Z range so they read as a clean band rather than
// a patch.
export const RIVER_X_CENTER = 85;
export const RIVER_HALF_WIDTH = 9;
export const DESERT_X_START = RIVER_X_CENTER + RIVER_HALF_WIDTH;
// Where Ground.tsx's single decorative bridge sits — the only crossing point once the river
// actually blocks movement (see riverColliders below). Half-width comfortably clears the
// bridge model's own footprint (~3.3 units at its scale) plus walking room on either side.
const BRIDGE_Z = 0;
const BRIDGE_GAP_HALF = 4.5;

export function inRiverZone(x: number): boolean {
  return Math.abs(x - RIVER_X_CENTER) <= RIVER_HALF_WIDTH;
}

export function inDesertZone(x: number): boolean {
  return x > DESERT_X_START;
}

// A river you can just walk across isn't much of a divider — this chains overlapping circle
// colliders (same primitive rocks/trees already use) along the water's centerline so it's a
// real obstacle, with a gap left open at BRIDGE_Z for the one crossing point.
const RIVER_COLLIDER_RADIUS = RIVER_HALF_WIDTH;
const RIVER_COLLIDER_SPACING = RIVER_COLLIDER_RADIUS * 1.8;

export const riverColliders: Collider[] = (() => {
  const colliders: Collider[] = [];
  const half = FIELD_EXTENT / 2;
  for (let z = -half; z <= half; z += RIVER_COLLIDER_SPACING) {
    if (Math.abs(z - BRIDGE_Z) < BRIDGE_GAP_HALF) continue;
    colliders.push({ x: RIVER_X_CENTER, z, radius: RIVER_COLLIDER_RADIUS });
  }
  return colliders;
})();

export interface VillageZone {
  center: [number, number];
  size: number;
}

// Canonical village positions — the single source of truth Village.tsx renders from and
// FieldMonsters.ts excludes spawns from, instead of each file hand-copying its own clear-zone
// box around numbers that used to live only in Village.tsx (which is how the old single-
// village version of this worked, and exactly the kind of duplication that goes stale the
// next time a village moves).
export const VILLAGES: VillageZone[] = [
  { center: [-32, 0], size: 22 },
  { center: [0, -100], size: 26 },
  { center: [-30, 110], size: 22 },
];

// The villages sit inside this same field, not a separate scene — this keeps rocks/tufts/
// trees/monsters from spawning on top of their buildings.
export function inVillageClearZone(x: number, z: number): boolean {
  return VILLAGES.some(({ center, size }) => {
    const half = size / 2 + 3;
    return Math.abs(x - center[0]) <= half && Math.abs(z - center[1]) <= half;
  });
}

// The dungeon cave mouth in the field — walk within FIELD_ENTRANCE_RADIUS of this point to
// enter (see worldStore.ts). Placed away from the village and the field's own monster
// spawns. A clear zone keeps rocks from spawning on top of the entrance decoration.
export const FIELD_ENTRANCE_POINT: [number, number] = [34, 22];
export const FIELD_ENTRANCE_RADIUS = 1.8;
const CAVE_CLEAR_RADIUS = 5;

export function inCaveClearZone(x: number, z: number): boolean {
  const dx = x - FIELD_ENTRANCE_POINT[0];
  const dz = z - FIELD_ENTRANCE_POINT[1];
  return Math.hypot(dx, dz) < CAVE_CLEAR_RADIUS;
}

export interface Decoration {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  kind: 'rock' | 'tuft';
}

/** Deterministic (fixed seed) so Ground's rendering and the collider list below always agree. */
export function scatterDecorations(): Decoration[] {
  const rng = mulberry32(SEED);
  const decorations: Decoration[] = [];
  for (let i = 0; i < DECORATION_COUNT; i++) {
    const x = (rng() - 0.5) * FIELD_EXTENT;
    const z = (rng() - 0.5) * FIELD_EXTENT;
    if (Math.hypot(x, z) < CLEAR_RADIUS) continue;
    if (inVillageClearZone(x, z)) continue;
    if (inCaveClearZone(x, z)) continue;
    // Grass rocks/tufts don't belong on the sand or in the river — the desert biome and its
    // own props (see scatterDesertProps) take over past the river.
    if (inRiverZone(x) || inDesertZone(x)) continue;
    decorations.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.6 + rng() * 0.9,
      kind: rng() > 0.35 ? 'tuft' : 'rock',
    });
  }
  return decorations;
}

export type TreeKind = 'pineTallA' | 'pineTallB' | 'pineRoundA' | 'pineRoundB' | 'oak' | 'default';

export interface TreeDecoration {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  kind: TreeKind;
}

const TREE_KINDS: TreeKind[] = ['pineTallA', 'pineTallB', 'pineRoundA', 'pineRoundB', 'oak', 'default'];
const TREE_COUNT = 110;
const TREE_SEED = 55;

/** Forest trees scattered across the grass zone only (excludes village/cave/river/desert). */
export function scatterTrees(): TreeDecoration[] {
  const rng = mulberry32(TREE_SEED);
  const trees: TreeDecoration[] = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const x = (rng() - 0.5) * FIELD_EXTENT;
    const z = (rng() - 0.5) * FIELD_EXTENT;
    if (Math.hypot(x, z) < CLEAR_RADIUS + 4) continue;
    if (inVillageClearZone(x, z)) continue;
    if (inCaveClearZone(x, z)) continue;
    if (inRiverZone(x) || inDesertZone(x)) continue;
    trees.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 2.4 + rng() * 1.6,
      kind: TREE_KINDS[Math.floor(rng() * TREE_KINDS.length)],
    });
  }
  return trees;
}

export type DesertPropKind = 'cactusTall' | 'cactusShort' | 'palm' | 'palmBend' | 'rockTall';

export interface DesertPropDecoration {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  kind: DesertPropKind;
}

const DESERT_PROP_KINDS: DesertPropKind[] = ['cactusTall', 'cactusShort', 'palm', 'palmBend', 'rockTall'];
const DESERT_PROP_COUNT = 70;
const DESERT_SEED = 88;
// FIELD_EXTENT/2 is the scatter's outer edge on the desert side; DESERT_X_START..that is the
// desert's actual width.
const DESERT_X_END = FIELD_EXTENT / 2;

/** Cacti/palms/rocks scattered across the desert zone only (east of the river). */
export function scatterDesertProps(): DesertPropDecoration[] {
  const rng = mulberry32(DESERT_SEED);
  const props: DesertPropDecoration[] = [];
  for (let i = 0; i < DESERT_PROP_COUNT; i++) {
    const x = DESERT_X_START + rng() * (DESERT_X_END - DESERT_X_START);
    const z = (rng() - 0.5) * FIELD_EXTENT;
    if (Math.hypot(x, z) > DESERT_X_END) continue;
    props.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 1.6 + rng() * 1.4,
      kind: DESERT_PROP_KINDS[Math.floor(rng() * DESERT_PROP_KINDS.length)],
    });
  }
  return props;
}

export interface Collider {
  x: number;
  z: number;
  radius: number;
}

// Only rocks block movement — grass tufts are walk-through decoration. Computed once at
// module load since the layout is deterministic; both Ground (rendering) and CharacterMesh
// (movement collision) import from here so they can never disagree about where rocks are.
export const rockColliders: Collider[] = scatterDecorations()
  .filter((d) => d.kind === 'rock')
  .map((d) => ({ x: d.position[0], z: d.position[2], radius: d.scale * 0.3 }));

// Tree trunks and desert props (cacti/rocks/palms) block movement the same way rocks do —
// same "collide at roughly the trunk/base, not the full canopy" radius approximation.
export const treeColliders: Collider[] = scatterTrees().map((t) => ({
  x: t.position[0],
  z: t.position[2],
  radius: t.scale * 0.22,
}));

export const desertPropColliders: Collider[] = scatterDesertProps().map((p) => ({
  x: p.position[0],
  z: p.position[2],
  radius: p.scale * 0.25,
}));

// Field and village are one continuous walkable world, so their obstacles combine into a
// single active list (Ground.tsx sets this once, merging rockColliders with the village's).
// Kept mutable/swappable (rather than a plain constant) for a future instanced dungeon,
// which — unlike the village — really is a separate space entered through a loading
// transition. Same shared-singleton pattern as playerPosition/moveTarget.
export const activeColliders: { list: Collider[] } = {
  list: [...rockColliders, ...treeColliders, ...desertPropColliders, ...riverColliders],
};

function collidesWithObstacle(x: number, z: number, entityRadius: number): boolean {
  for (const obstacle of activeColliders.list) {
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    const minDist = obstacle.radius + entityRadius;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  return false;
}

/**
 * Resolves a proposed movement delta against the active area's colliders using simple
 * axis-separated sliding: if moving on both axes at once would clip an obstacle, try each
 * axis alone so the player slides along its surface instead of just stopping dead at the
 * first touch. No physics engine needed — these are flat top-down areas with no
 * gravity/forces, just "don't let circles overlap."
 */
export function resolveMovement(
  x: number,
  z: number,
  moveX: number,
  moveZ: number,
  entityRadius: number,
): { x: number; z: number } {
  const fullX = x + moveX;
  const fullZ = z + moveZ;
  if (!collidesWithObstacle(fullX, fullZ, entityRadius)) return { x: fullX, z: fullZ };

  const resolvedX = collidesWithObstacle(fullX, z, entityRadius) ? x : fullX;
  const resolvedZ = collidesWithObstacle(resolvedX, fullZ, entityRadius) ? z : fullZ;
  return { x: resolvedX, z: resolvedZ };
}
