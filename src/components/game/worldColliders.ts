import { mulberry32 } from './proceduralTextures';

const SEED = 42;
const DECORATION_COUNT = 260;
const FIELD_EXTENT = 100;
const CLEAR_RADIUS = 3.5;

// The village sits inside this same field, not a separate scene — this box keeps rocks/tufts
// from spawning on top of its buildings. Kept in sync with the layout in Village.tsx.
const VILLAGE_CLEAR_X: [number, number] = [-42, -22];
const VILLAGE_CLEAR_Z: [number, number] = [-10, 10];

function inVillageClearZone(x: number, z: number): boolean {
  return x >= VILLAGE_CLEAR_X[0] && x <= VILLAGE_CLEAR_X[1] && z >= VILLAGE_CLEAR_Z[0] && z <= VILLAGE_CLEAR_Z[1];
}

// The dungeon cave mouth in the field — walk within FIELD_ENTRANCE_RADIUS of this point to
// enter (see worldStore.ts). Placed away from the village and the field's own monster
// spawns. A clear zone keeps rocks from spawning on top of the entrance decoration.
export const FIELD_ENTRANCE_POINT: [number, number] = [34, 22];
export const FIELD_ENTRANCE_RADIUS = 1.8;
const CAVE_CLEAR_RADIUS = 5;

function inCaveClearZone(x: number, z: number): boolean {
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
    decorations.push({
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale: 0.6 + rng() * 0.9,
      kind: rng() > 0.35 ? 'tuft' : 'rock',
    });
  }
  return decorations;
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

// Field and village are one continuous walkable world, so their obstacles combine into a
// single active list (Ground.tsx sets this once, merging rockColliders with the village's).
// Kept mutable/swappable (rather than a plain constant) for a future instanced dungeon,
// which — unlike the village — really is a separate space entered through a loading
// transition. Same shared-singleton pattern as playerPosition/moveTarget.
export const activeColliders: { list: Collider[] } = { list: rockColliders };

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
