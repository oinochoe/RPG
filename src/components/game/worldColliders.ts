import { mulberry32 } from './proceduralTextures';

const SEED = 42;
// Scaled up alongside FIELD_EXTENT's own 400 -> 640 bump (the new outer-ring zones, see
// OUTER_ZONE_BOUND below, need their own rock/tuft cover too) — not the full ~2.6x area
// ratio, since these are instanced meshes but still real geometry to cull/sort each frame.
const DECORATION_COUNT = 2400;
// Bumped from 300 -> 400 -> 640 (the last one specifically to open up room for 4 new
// outer-ring danger zones past the original content — see OUTER_ZONE_BOUND/inFairyForestZone
// etc. below). CharacterMesh's MAX_RADIUS and Ground.tsx's GROUND_SIZE must stay in sync
// (both now sized around this square's actual diagonal reach, not just half-width).
export const FIELD_EXTENT = 640;
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
// A fixed band width, independent of FIELD_EXTENT — inDesertZone used to have no upper bound
// at all (just `x > DESERT_X_START`), so it silently grew to fill however much room
// FIELD_EXTENT gave it. Now that there's a real zone (구울 평원, see inGhoulFieldZone) meant to
// start right where the desert ends, the desert needs its own fixed edge instead of eating
// whatever space is left.
export const DESERT_X_END = 210;
// Where Ground.tsx's single decorative bridge sits — the only crossing point once the river
// actually blocks movement (see riverColliders below). Half-width comfortably clears the
// bridge model's own footprint (~3.3 units at its scale) plus walking room on either side.
const BRIDGE_Z = 0;
const BRIDGE_GAP_HALF = 4.5;

// A perfectly straight river read as flat/artificial — this bends its centerline into a
// gentle meander instead. `(cos(...) - 1)` stays in [-2, 0], so the curve only ever bends
// toward -x (the grass side) and never toward the desert: riverXAt(BRIDGE_Z) == RIVER_X_CENTER
// exactly (cos(0)-1 == 0), so the bridge/cave-entrance/field-entrance positions that were
// already tuned around the old straight RIVER_X_CENTER still line up, and the river's max
// reach toward the desert never exceeds RIVER_X_CENTER (same as before), so DESERT_X_START
// doesn't need to move either.
const RIVER_MEANDER_AMPLITUDE = 14;
const RIVER_MEANDER_WAVELENGTH = 110;

export function riverXAt(z: number): number {
  return RIVER_X_CENTER + RIVER_MEANDER_AMPLITUDE * (Math.cos((z / RIVER_MEANDER_WAVELENGTH) * Math.PI * 2) - 1);
}

export function inRiverZone(x: number, z: number): boolean {
  return Math.abs(x - riverXAt(z)) <= RIVER_HALF_WIDTH;
}

export function inDesertZone(x: number): boolean {
  return x > DESERT_X_START && x <= DESERT_X_END;
}

// The original playable square's own edge (the old FIELD_EXTENT/2, before the 640 bump) —
// every pre-existing zone (villages, river/desert, the field's own tiered slime/skeleton
// scatter in FieldMonsters.ts) stays inside this. The 4 new zones below all start past it, so
// none of them can overlap what already existed.
export const OUTER_ZONE_BOUND = 200;

// Same meander idea as riverXAt — a dead-straight zone edge read as flat/artificial (real
// user feedback: "곡선이 있어야지.. 좀 고퀄을 받아봐라"). Amplitude/wavelength are gentler
// than the river's own (30 vs 14, but over open ground rather than a narrow channel) so the
// wobble reads as a natural tree line/frontier rather than a jagged zigzag. A small overlap
// between adjacent zones near the corners is harmless — FieldMonsters.ts's spawn loops just
// reject a roll that doesn't match their own zone check and try again.
const ZONE_MEANDER_AMPLITUDE = 30;
const ZONE_MEANDER_WAVELENGTH = 160;

// A single sine term still reads as one perfectly regular, repeating wave once you actually
// look at it on the map (real user feedback: "미니맵이 너무 곡선만 위주로 되어있다.. 완전
// 일정한 곡선이 아니어야지"). Layering a second, faster/weaker wobble on top breaks up that
// "obviously one clean curve" look while staying pure deterministic math (no noise library,
// no per-frame cost beyond one extra sin() call) — real coastlines/tree lines are the sum of
// irregularities at several scales, not one tidy period.
function meanderOffset(t: number, wavelength: number, amplitude: number, phase: number): number {
  const primary = Math.sin((t / wavelength) * Math.PI * 2 + phase);
  const detail = Math.sin((t / (wavelength * 0.31)) * Math.PI * 2 + phase * 2.1) * 0.3;
  return (amplitude * (primary + detail)) / 1.3;
}

// 요정의 숲 (Fairy Forest)'s southern edge — the curved boundary WorldMap.tsx/MiniMap.tsx
// trace to actually draw this zone as a band instead of a flat rect.
export function fairyForestEdgeAt(x: number): number {
  return OUTER_ZONE_BOUND + meanderOffset(x, ZONE_MEANDER_WAVELENGTH, ZONE_MEANDER_AMPLITUDE, 0);
}

// 요정의 숲 (Fairy Forest) — the north outer band, capped before DESERT_X_END so it doesn't
// reach into 구울 평원's own wedge in the NE corner.
export function inFairyForestZone(x: number, z: number): boolean {
  return z > fairyForestEdgeAt(x) && x <= DESERT_X_END;
}

// 오크 마을 (Orc Village)'s northern edge — its own phase offset so it doesn't mirror the
// fairy forest's wobble exactly (would read as two parallel copies of the same wave).
export function orcVillageEdgeAt(x: number): number {
  return -OUTER_ZONE_BOUND - meanderOffset(x, ZONE_MEANDER_WAVELENGTH, ZONE_MEANDER_AMPLITUDE, Math.PI / 3);
}

// 오크 마을 (Orc Village) — the south outer band, same DESERT_X_END cap as the forest above.
export function inOrcVillageZone(x: number, z: number): boolean {
  return z < orcVillageEdgeAt(x) && x <= DESERT_X_END;
}

// 해골 평원 (Bone Field)'s eastern edge — curved along z (its long axis) rather than x, since
// this zone's frontier faces east/west, not north/south.
export function boneFieldEdgeAt(z: number): number {
  return -OUTER_ZONE_BOUND - meanderOffset(z, ZONE_MEANDER_WAVELENGTH, ZONE_MEANDER_AMPLITUDE, (2 * Math.PI) / 3);
}

// 해골 평원 (Bone Field) — the west outer band, bounded in z so it doesn't creep into the
// forest/orc bands' own corners.
export function inBoneFieldZone(x: number, z: number): boolean {
  return x < boneFieldEdgeAt(z) && z >= -OUTER_ZONE_BOUND && z <= OUTER_ZONE_BOUND;
}

// 구울 평원 (Ghoul Field) — everything past the desert's own fixed edge, full z range (so it
// also covers the NE/SE corners past the forest/orc bands' own DESERT_X_END cap) — the
// farthest-out, hardest zone, reachable only by continuing east past the desert.
export function inGhoulFieldZone(x: number): boolean {
  return x > DESERT_X_END;
}

// A river you can just walk across isn't much of a divider — this chains overlapping circle
// colliders (same primitive rocks/trees already use) along the water's centerline so it's a
// real obstacle, with a gap left open at BRIDGE_Z for the one crossing point. Spaced much
// tighter along z than a straight river would need: the centerline's x now shifts with the
// meander between consecutive colliders too, so a wide z-step could let two consecutive
// circles drift far enough apart (in x) to open an unintended gap in the chain. At this
// amplitude/wavelength the worst-case per-step x-shift stays well under half the collider
// radius, keeping every step's circles solidly overlapping.
const RIVER_COLLIDER_RADIUS = RIVER_HALF_WIDTH;
const RIVER_COLLIDER_SPACING = 4;

export const riverColliders: Collider[] = (() => {
  const colliders: Collider[] = [];
  const half = FIELD_EXTENT / 2;
  // Walk outward from the bridge gap in both directions instead of stepping from -half with a
  // fixed spacing and skipping whatever lands near BRIDGE_Z — that only left a real gap when
  // half happened to be a multiple of the spacing. Starting each side's first collider exactly
  // flush with the gap's edge guarantees the gap is always real and always exactly
  // BRIDGE_GAP_HALF wide, independent of FIELD_EXTENT.
  for (let z = BRIDGE_Z + BRIDGE_GAP_HALF + RIVER_COLLIDER_RADIUS; z <= half; z += RIVER_COLLIDER_SPACING) {
    colliders.push({ x: riverXAt(z), z, radius: RIVER_COLLIDER_RADIUS });
  }
  for (let z = BRIDGE_Z - BRIDGE_GAP_HALF - RIVER_COLLIDER_RADIUS; z >= -half; z -= RIVER_COLLIDER_SPACING) {
    colliders.push({ x: riverXAt(z), z, radius: RIVER_COLLIDER_RADIUS });
  }
  return colliders;
})();

/** Builds an SVG path `d` string for the river's water polygon (left edge out, right edge
 * back) between zMin/zMax — shared by WorldMap.tsx's full map and MiniMap.tsx's corner map so
 * neither draws the old straight rect anymore, and neither re-derives the curve on its own. */
export function riverPathD(zMin: number, zMax: number, step = 6): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let z = zMin; z <= zMax; z += step) {
    const cx = riverXAt(z);
    left.push(`${(cx - RIVER_HALF_WIDTH).toFixed(1)} ${z.toFixed(1)}`);
    right.push(`${(cx + RIVER_HALF_WIDTH).toFixed(1)} ${z.toFixed(1)}`);
  }
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

/** Builds an SVG path `d` for one of the 4 outer-ring zone bands — one edge follows `edgeAt`
 * (the same curve fairyForestEdgeAt/orcVillageEdgeAt/boneFieldEdgeAt use for the actual
 * gameplay zone check), the opposite edge is the map's own flat outer border. Shared by
 * WorldMap.tsx's full map and MiniMap.tsx's corner map, same "one function, both renderers"
 * approach as riverPathD, so the drawn shape can never drift out of sync with where the zone
 * actually starts in-game. `axis: 'x'` traces edgeAt(t) as z at each x=t (north/south bands);
 * `axis: 'z'` traces it as x at each z=t (the east/west-facing bone field band). */
export function curvedBandPathD(
  edgeAt: (t: number) => number,
  tMin: number,
  tMax: number,
  farValue: number,
  axis: 'x' | 'z',
  step = 8,
): string {
  const edge: string[] = [];
  for (let t = tMin; t <= tMax; t += step) {
    const e = edgeAt(t);
    edge.push(axis === 'x' ? `${t.toFixed(1)} ${e.toFixed(1)}` : `${e.toFixed(1)} ${t.toFixed(1)}`);
  }
  const farStart = axis === 'x' ? `${tMax.toFixed(1)} ${farValue.toFixed(1)}` : `${farValue.toFixed(1)} ${tMax.toFixed(1)}`;
  const farEnd = axis === 'x' ? `${tMin.toFixed(1)} ${farValue.toFixed(1)}` : `${farValue.toFixed(1)} ${tMin.toFixed(1)}`;
  return `M ${edge.join(' L ')} L ${farStart} L ${farEnd} Z`;
}

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

// Dungeon cave mouths in the field — walk within a dungeon's own radius of its point to enter
// it (see worldStore.ts). One per dungeon (see Dungeon.tsx's DUNGEON_META for each dungeon's
// name/floor count) — 'ruined_catacombs' is the original single dungeon, placed near spawn as
// before; the 2 new ones sit inside their matching outer-ring zone (오크 소굴 in 오크 마을,
// 저주받은 묘지 in 구울 평원) so reaching them is itself part of that zone's danger. A clear
// zone around each keeps rocks/trees/monsters from spawning on top of the entrance decoration.
export type DungeonId = 'ruined_catacombs' | 'orc_stronghold' | 'ghoul_crypt';

export const DUNGEON_ENTRANCES: Record<DungeonId, { point: [number, number]; radius: number }> = {
  ruined_catacombs: { point: [34, 22], radius: 1.8 },
  orc_stronghold: { point: [50, -270], radius: 1.8 },
  ghoul_crypt: { point: [270, 90], radius: 1.8 },
};

// Kept for existing single-entrance callers (characterStore's blink-scroll clear check,
// WorldMap/MiniMap's cave icon) that only ever cared about the original dungeon.
export const FIELD_ENTRANCE_POINT = DUNGEON_ENTRANCES.ruined_catacombs.point;
export const FIELD_ENTRANCE_RADIUS = DUNGEON_ENTRANCES.ruined_catacombs.radius;
const CAVE_CLEAR_RADIUS = 5;

export function inCaveClearZone(x: number, z: number): boolean {
  return Object.values(DUNGEON_ENTRANCES).some(({ point }) => {
    const dx = x - point[0];
    const dz = z - point[1];
    return Math.hypot(dx, dz) < CAVE_CLEAR_RADIUS;
  });
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
    if (inRiverZone(x, z) || inDesertZone(x)) continue;
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
    if (inRiverZone(x, z) || inDesertZone(x)) continue;
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
