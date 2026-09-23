import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { setMoveTarget } from './moveTarget';
import { useCombatStore } from '../../stores/combatStore';
import type { Collider, DungeonId } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

export type { DungeonId };

// KayKit Dungeon Pack — every structural piece (wall/wall_doorway/floor_tile_large) is
// modeled on a 4-unit grid (see each .gltf's own bounding box: width 4, height 4, depth 1 for
// walls; 4x4 for floor tiles).
const KAYKIT_DUNGEON = '/models/kaykit-dungeon/Assets/gltf';
const WALL_MODEL = `${KAYKIT_DUNGEON}/wall.gltf`;
const FLOOR_TILE_MODEL = `${KAYKIT_DUNGEON}/floor_tile_large.gltf`;
const COLUMN_MODEL = `${KAYKIT_DUNGEON}/column.gltf`;
const TORCH_MODEL = `${KAYKIT_DUNGEON}/torch_lit.gltf`;
// A full flight (its own bounding box: 4×5.1×4 at scale 1 — every stairs_* variant in this
// pack is the same ~5.1 tall, built for connecting two actual floor levels), used here purely
// as a decorative "this leads somewhere" silhouette next to FloorMarker's glow effect — this
// dungeon has no real elevation (every floor is its own flat instance, see worldStore.ts), so
// it's scaled well down rather than rendered at the grid's real 1:1 scale.
const STAIRS_MODEL = `${KAYKIT_DUNGEON}/stairs_narrow.gltf`;
const STAIRS_SCALE = 0.4;

export const CELL_SIZE = 4;

/** Name + floor count per dungeon (see worldColliders.ts's DUNGEON_ENTRANCES for each one's
 * field position). Floor SHAPES (FLOOR_PLANS below) are a shared pool reused by every
 * dungeon via `planForFloor`'s modulo — the 3 dungeons never render side by side, so a
 * repeated shape between two different dungeons is invisible to the player. Only a given
 * dungeon's OWN maxFloor governs when ITS chain actually ends (getFloorRects/getExitTrigger
 * both take maxFloor explicitly instead of assuming one dungeon-wide constant). */
export const DUNGEON_META: Record<DungeonId, { name: string; maxFloor: number }> = {
  ruined_catacombs: { name: '무너진 유적', maxFloor: 6 },
  orc_stronghold: { name: '오크 소굴', maxFloor: 4 },
  ghoul_crypt: { name: '저주받은 묘지', maxFloor: 5 },
};

// The size of the shared floor-SHAPE pool (see FLOOR_PLANS below) — NOT any one dungeon's own
// floor count. Used only to bound how many distinct shapes ROOM_HALF_X/Z needs to check; every
// dungeon's own depth comes from DUNGEON_META[id].maxFloor instead.
const FLOOR_SHAPE_COUNT = 6;

/** An axis-aligned world-space rectangle — every room, corridor leg, and doorway stub is one
 * of these; the whole floor plan is just their union. */
export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

function rectC(cx: number, cz: number, halfX: number, halfZ: number): Rect {
  return { x1: cx - halfX, x2: cx + halfX, z1: cz - halfZ, z2: cz + halfZ };
}

function rectXZ(xa: number, xb: number, za: number, zb: number): Rect {
  return { x1: Math.min(xa, xb), x2: Math.max(xa, xb), z1: Math.min(za, zb), z2: Math.max(za, zb) };
}

// Layout tuning — each floor is a chain of rooms connected by L-shaped ("dogleg") corridors,
// per-floor room count/sizes/side-to-side offsets pulled from FLOOR_PLANS below rather than
// one repeated shape — a floor-1-shaped "the dungeon" got old fast. Hand-authored per floor
// rather than a randomized maze generator: simpler to keep correct (guaranteed connected, no
// dead-end generation edge cases) while still reading as genuinely different floor to floor.
const CORRIDOR_HALF = 6;
const CORRIDOR_LEG = 20;
const DOORWAY_STUB_HALF = 3;
// Arbitrary fixed anchor for each floor's entry room — dungeon floors are their own self-
// contained coordinate space (see the Dungeon() doc comment below), so this never needs to
// vary for the player to notice; what actually reads as "the entrance is always the same
// place" is the room's own size and which way the first corridor jogs, both of which now vary
// per floor via FLOOR_PLANS.
const CHAIN_START_Z = -70;

/** One room in a floor's chain: `x` is its center (offset from the dungeon's x=0 spine), `half`
 * its half-size. Room 0 is the entry (south) room, the last is the exit (north) room. */
interface RoomSpec {
  x: number;
  half: number;
}

// 6 distinct shapes — varied room counts (3-5), sizes, and offset patterns, not mirrors of
// each other. Floor 6 (the boss floor) ends in a deliberately oversized arena for contrast.
const FLOOR_PLANS: RoomSpec[][] = [
  [
    { x: 0, half: 16 },
    { x: 34, half: 15 },
    { x: -10, half: 18 },
  ],
  [
    { x: 0, half: 15 },
    { x: -28, half: 14 },
    { x: 14, half: 14 },
    { x: -22, half: 17 },
  ],
  [
    { x: 0, half: 14 },
    { x: 0, half: 14 },
    { x: 40, half: 24 },
  ],
  [
    { x: 10, half: 16 },
    { x: 52, half: 15 },
    { x: -6, half: 15 },
    { x: 38, half: 19 },
  ],
  [
    { x: 0, half: 13 },
    { x: -22, half: 13 },
    { x: 18, half: 13 },
    { x: -16, half: 13 },
    { x: 12, half: 17 },
  ],
  [
    { x: 0, half: 16 },
    { x: -32, half: 16 },
    { x: 0, half: 30 },
  ],
];

function planForFloor(floor: number): RoomSpec[] {
  return FLOOR_PLANS[(floor - 1) % FLOOR_PLANS.length];
}

/** This floor's room rects, in chain order (index 0 = entry/south, last = exit/north) —
 * used for monster placement and characterStore's blink-in-dungeon, both of which want
 * "somewhere reasonable to stand," not a narrow hallway. */
export function getFloorRoomList(floor: number): Rect[] {
  const plan = planForFloor(floor);
  const rooms: Rect[] = [];
  let z = CHAIN_START_Z;
  for (let i = 0; i < plan.length; i++) {
    if (i > 0) z += plan[i - 1].half + CORRIDOR_LEG * 2 + plan[i].half;
    rooms.push(rectC(plan[i].x, z, plan[i].half, plan[i].half));
  }
  return rooms;
}

function entryRoomX(floor: number): number {
  return planForFloor(floor)[0].x;
}
function exitRoomX(floor: number): number {
  const plan = planForFloor(floor);
  return plan[plan.length - 1].x;
}

// Overall bounding half-extents — computed once across every floor's actual layout (rather
// than hand-estimated) so WorldMap.tsx/MiniMap.tsx's dungeon minimap frame is always big
// enough regardless of which floor's shape is largest, padded for the doorway stubs.
const { ROOM_HALF_X, ROOM_HALF_Z } = (() => {
  let maxX = 0;
  let maxZ = 0;
  for (let floor = 1; floor <= FLOOR_SHAPE_COUNT; floor++) {
    for (const room of getFloorRoomList(floor)) {
      maxX = Math.max(maxX, Math.abs(room.x1), Math.abs(room.x2));
      maxZ = Math.max(maxZ, Math.abs(room.z1), Math.abs(room.z2));
    }
  }
  return { ROOM_HALF_X: maxX + CORRIDOR_HALF, ROOM_HALF_Z: maxZ + CELL_SIZE };
})();
export { ROOM_HALF_X, ROOM_HALF_Z };

// Entry/exit points are floor-dependent now (each floor's entry room can sit at a different
// x) — worldStore.ts's enterFloor() and AreaTransitions.tsx both call these per-floor instead
// of importing fixed constants.
export function getEntryTrigger(floor: number): [number, number] {
  const rooms = getFloorRoomList(floor);
  return [entryRoomX(floor), rooms[0].z1 + 1];
}
export function getEntrySpawn(floor: number): [number, number] {
  const rooms = getFloorRoomList(floor);
  return [entryRoomX(floor), rooms[0].z1 + 3];
}
export function getExitTrigger(floor: number, maxFloor: number): [number, number] | null {
  if (floor >= maxFloor) return null;
  const rooms = getFloorRoomList(floor);
  return [exitRoomX(floor), rooms[rooms.length - 1].z2 - 1];
}
export function getExitSpawn(floor: number): [number, number] {
  const rooms = getFloorRoomList(floor);
  return [exitRoomX(floor), rooms[rooms.length - 1].z2 - 3];
}
export const DUNGEON_EXIT_RADIUS = 1.8;
export const DUNGEON_DESCEND_RADIUS = 1.8;

/** The 3-5 rooms only (no corridors), same as getFloorRoomList — kept as an object-shaped
 * alias for callers that want named south/north access without indexing. */
export function getFloorRooms(floor: number): { south: Rect; north: Rect; all: Rect[] } {
  const rooms = getFloorRoomList(floor);
  return { south: rooms[0], north: rooms[rooms.length - 1], all: rooms };
}

/** Every rectangle making up this floor's walkable area — rooms, corridor legs, and the two
 * short doorway stubs that punch the entry/exit gaps into the first/last rooms' outer walls.
 * The whole rendered floor (walls, floor tiles, colliders) derives from this one list via
 * rasterize()/wallsFromOpenCells() below, so there's a single source of truth for the shape. */
export function getFloorRects(floor: number, maxFloor: number): Rect[] {
  const plan = planForFloor(floor);
  const rooms = getFloorRoomList(floor);
  const rects: Rect[] = [...rooms];

  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    const ax = plan[i].x;
    const bx = plan[i + 1].x;
    const bendZ = (a.z2 + b.z1) / 2;
    rects.push(rectXZ(ax - CORRIDOR_HALF, ax + CORRIDOR_HALF, a.z2, bendZ));
    rects.push(rectXZ(ax, bx, bendZ - CORRIDOR_HALF, bendZ + CORRIDOR_HALF));
    rects.push(rectXZ(bx - CORRIDOR_HALF, bx + CORRIDOR_HALF, bendZ, b.z1));
  }

  const entryX = plan[0].x;
  rects.push(rectXZ(entryX - DOORWAY_STUB_HALF, entryX + DOORWAY_STUB_HALF, rooms[0].z1 - CELL_SIZE, rooms[0].z1));
  if (floor < maxFloor) {
    const exitX = plan[plan.length - 1].x;
    const last = rooms[rooms.length - 1];
    rects.push(rectXZ(exitX - DOORWAY_STUB_HALF, exitX + DOORWAY_STUB_HALF, last.z2, last.z2 + CELL_SIZE));
  }
  return rects;
}

// --- Rect union -> grid cells -> wall segments ------------------------------------------
// Cell gx/gz spans world [gx*CELL_SIZE, (gx+1)*CELL_SIZE) on each axis (not centered on the
// index) — this makes a rect's cell range exactly floor(x1/CS)..ceil(x2/CS)-1 with no
// off-by-half-cell fiddling, and a cell's rendered center is simply index*CS + CS/2.

function cellKey(gx: number, gz: number): string {
  return `${gx}|${gz}`;
}

function cellRange(a: number, b: number): [number, number] {
  return [Math.floor(a / CELL_SIZE), Math.ceil(b / CELL_SIZE) - 1];
}

function cellCenter(index: number): number {
  return index * CELL_SIZE + CELL_SIZE / 2;
}

function rasterize(rects: Rect[]): Set<string> {
  const open = new Set<string>();
  for (const r of rects) {
    const [gx1, gx2] = cellRange(r.x1, r.x2);
    const [gz1, gz2] = cellRange(r.z1, r.z2);
    for (let gx = gx1; gx <= gx2; gx++) {
      for (let gz = gz1; gz <= gz2; gz++) {
        open.add(cellKey(gx, gz));
      }
    }
  }
  return open;
}

interface WallPiece {
  x: number;
  z: number;
  rotationY: number;
}

/** One wall module per open-cell edge that borders a closed (or out-of-bounds) cell — visited
 * once per boundary since only the open side ever emits one. */
function wallsFromOpenCells(open: Set<string>): WallPiece[] {
  const walls: WallPiece[] = [];
  for (const key of open) {
    const [gx, gz] = key.split('|').map(Number);
    if (!open.has(cellKey(gx, gz - 1))) walls.push({ x: cellCenter(gx), z: gz * CELL_SIZE, rotationY: 0 });
    if (!open.has(cellKey(gx, gz + 1))) walls.push({ x: cellCenter(gx), z: (gz + 1) * CELL_SIZE, rotationY: 0 });
    if (!open.has(cellKey(gx - 1, gz))) walls.push({ x: gx * CELL_SIZE, z: cellCenter(gz), rotationY: Math.PI / 2 });
    if (!open.has(cellKey(gx + 1, gz))) walls.push({ x: (gx + 1) * CELL_SIZE, z: cellCenter(gz), rotationY: Math.PI / 2 });
  }
  return walls;
}

function floorTilesFromOpenCells(open: Set<string>): [number, number][] {
  return Array.from(open, (key) => {
    const [gx, gz] = key.split('|').map(Number);
    return [cellCenter(gx), cellCenter(gz)] as [number, number];
  });
}

const FLOOR_BASE_LEVEL = 5;

interface DungeonRosterConfig {
  regularTemplateId: number;
  regularName: string;
  // An optional second regular species mixed in from a given floor onward (used by
  // ruined_catacombs for skeleton variety) — floor 1 stays single-species so a first-time
  // player learns the basics against one enemy type before the mix shows up.
  secondaryTemplateId?: number;
  secondaryName?: string;
  secondaryFromFloor?: number;
  captainTemplateId: number;
  captainName: string;
  bossTemplateId: number;
  bossName: string;
}

// 3 dungeons' rosters — see DUNGEON_META for names/floor counts. Boss/captain both reuse the
// same field monster model at higher stats (same "거인 군주 aside, the strong one is just a
// tougher version of the regular" pattern the original dungeon already used for 고블린 대장),
// so orc_stronghold/ghoul_crypt need no new assets beyond the field monsters already sourced.
const DUNGEON_ROSTERS: Record<DungeonId, DungeonRosterConfig> = {
  ruined_catacombs: {
    regularTemplateId: 2,
    regularName: '고블린',
    secondaryTemplateId: 3,
    secondaryName: '스켈레톤',
    secondaryFromFloor: 2,
    captainTemplateId: 2,
    captainName: '고블린 대장',
    bossTemplateId: 5,
    bossName: '거인 군주',
  },
  orc_stronghold: {
    regularTemplateId: 6,
    regularName: '오크',
    captainTemplateId: 6,
    captainName: '오크 대장',
    bossTemplateId: 6,
    // Contains "군주" (not "족장") so it picks up Scene.tsx's monsterScale boss-scale bump the
    // same way 거인 군주/구울 군주 do — a substring match, not a formal title system.
    bossName: '오크 군주',
  },
  ghoul_crypt: {
    regularTemplateId: 7,
    regularName: '구울',
    captainTemplateId: 7,
    // Contains "대장" so it picks up the same captain-scale bump 고블린 대장/오크 대장 get.
    captainName: '구울 대장',
    bossTemplateId: 7,
    bossName: '구울 군주',
  },
};

function regularMonster(
  config: DungeonRosterConfig,
  idBase: number,
  slot: number,
  floor: number,
  level: number,
  hp: number,
  position: [number, number],
): MonsterInstanceSummary {
  const useSecondary =
    config.secondaryTemplateId !== undefined && config.secondaryFromFloor !== undefined && floor >= config.secondaryFromFloor && slot % 3 === 0;
  return {
    instance_id: idBase + slot,
    monster_template_id: useSecondary ? config.secondaryTemplateId! : config.regularTemplateId,
    name: useSecondary ? config.secondaryName! : config.regularName,
    level,
    current_hp: hp,
    max_hp: hp,
    position_x: position[0],
    position_y: 0,
    position_z: position[1],
  };
}

/** 3 positions per room (fractional offsets so they scale with that room's own size instead
 * of a fixed distance that could clip a small room's walls or read sparse in a big one). */
function roomMonsterPositions(room: Rect): [number, number][] {
  const cx = (room.x1 + room.x2) / 2;
  const cz = (room.z1 + room.z2) / 2;
  const hx = (room.x2 - room.x1) / 2;
  const hz = (room.z2 - room.z1) / 2;
  return [
    [cx - hx * 0.5, cz - hz * 0.3],
    [cx + hx * 0.5, cz - hz * 0.3],
    [cx, cz + hz * 0.35],
  ];
}

/** Deterministic per-floor monster roster, spread across every room in the floor's chain
 * (not the corridors) — stronger the deeper you go, with a tougher captain guarding the last
 * room (the way to the next floor down) and a named boss on the final floor. */
export function buildFloorMonsters(dungeonId: DungeonId, floor: number): MonsterInstanceSummary[] {
  const config = DUNGEON_ROSTERS[dungeonId];
  const maxFloor = DUNGEON_META[dungeonId].maxFloor;
  const level = FLOOR_BASE_LEVEL + (floor - 1) * 3;
  // Bumped from 60 + (floor-1)*40 — combined with combatStore's steeper monsterAttackPower,
  // fights at a floor's own intended level now actually cost real HP instead of dying in a
  // couple of hits (see the balance note on monsterAttackPower for the simulated numbers).
  const hp = 80 + (floor - 1) * 90;
  // idBase is unique per dungeon+floor so instance ids from different dungeons never collide
  // even though each dungeon reuses the same near-origin coordinate space (they're never
  // loaded at the same time, but combatStore/lootStore keys off instance_id regardless).
  const idBase = 9000 + DUNGEON_ID_OFFSET[dungeonId] + floor * 100;
  const isLastFloor = floor === maxFloor;
  const captainHp = Math.round(hp * (isLastFloor ? 2.5 : 1.8));
  const rooms = getFloorRoomList(floor);

  const monsters: MonsterInstanceSummary[] = [];
  let slot = 1;
  for (const room of rooms) {
    for (const pos of roomMonsterPositions(room)) {
      monsters.push(regularMonster(config, idBase, slot++, floor, level, hp, pos));
    }
  }

  const lastRoom = rooms[rooms.length - 1];
  monsters.push({
    instance_id: idBase + 99,
    // The final floor's boss reuses this dungeon's own captain model at higher stats — every
    // other floor's captain stays a reskin at its own tier, but the one fight meant to
    // actually feel like "the strong one shows up eventually" gets the bigger numbers.
    monster_template_id: isLastFloor ? config.bossTemplateId : config.captainTemplateId,
    name: isLastFloor ? config.bossName : config.captainName,
    level: level + (isLastFloor ? 5 : 2),
    current_hp: captainHp,
    max_hp: captainHp,
    // The captain is the one monster on this floor that's aggressive on sight (see
    // worldStore's isDungeonEscortAggressive), so it sits toward the near (south) side of the
    // last room — far enough from getExitSpawn (arriving here by ascending from a deeper
    // floor, near the room's far/north edge) that MONSTER_DETECT_RANGE (6) + wander (2.5)
    // can't reach it on arrival — guarding the way deeper rather than ambushing anyone who
    // just walked in.
    position_x: lastRoom.x1 + (lastRoom.x2 - lastRoom.x1) * 0.7,
    position_y: 0,
    position_z: lastRoom.z1 + (lastRoom.z2 - lastRoom.z1) * 0.25,
  });

  return monsters;
}

const DUNGEON_ID_OFFSET: Record<DungeonId, number> = {
  ruined_catacombs: 0,
  orc_stronghold: 10_000,
  ghoul_crypt: 20_000,
};

const COLLIDER_RADIUS = 1.3;
const COLLIDER_OFFSET = 1;

export function getDungeonColliders(floor: number, maxFloor: number): Collider[] {
  const open = rasterize(getFloorRects(floor, maxFloor));
  const walls = wallsFromOpenCells(open);
  const colliders: Collider[] = [];
  for (const w of walls) {
    const alongX = w.rotationY === 0;
    for (const offset of [-COLLIDER_OFFSET, COLLIDER_OFFSET]) {
      colliders.push({ x: w.x + (alongX ? offset : 0), z: w.z + (alongX ? 0 : offset), radius: COLLIDER_RADIUS });
    }
  }

  for (const room of getFloorRoomList(floor)) {
    for (const [x, z] of roomColumnOffsets(room)) colliders.push({ x, z, radius: 0.5 });
  }

  return colliders;
}

function roomColumnOffsets(room: Rect): [number, number][] {
  return [
    [room.x1 + 2.5, room.z1 + 2.5],
    [room.x2 - 2.5, room.z1 + 2.5],
    [room.x1 + 2.5, room.z2 - 2.5],
    [room.x2 - 2.5, room.z2 - 2.5],
  ];
}

function roomTorchOffsets(room: Rect): [number, number][] {
  return [
    [room.x1 + 1, room.z1 + 4],
    [room.x1 + 1, room.z2 - 4],
    [room.x2 - 1, room.z1 + 4],
    [room.x2 - 1, room.z2 - 4],
  ];
}

/** Generic static (non-rigged) KayKit prop — matches Village.tsx's Building component. */
function DungeonProp({
  url,
  position,
  rotationY = 0,
  scale = 1,
}: {
  url: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

function Torch({ position }: { position: [number, number] }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <DungeonProp url={TORCH_MODEL} position={[0, 0.4, 0]} />
      <pointLight position={[0, 1.4, 0]} color="#ff9a3c" intensity={1.4} distance={9} />
    </group>
  );
}

// A flat, dim, opacity-0.35 ground disc with a weak (intensity 0.5) point light used to read
// as "very hard to notice" in the dungeon's own dark ambient/fog (see Scene.tsx's isDungeon
// branch — ambientLight 0.12, fog starting at 14 units) — this is the actual transition
// trigger's only visual, so missing it meant walking past a floor change with zero warning.
// Rebuilt as a much louder "portal" language instead: a bright double ring plus a translucent
// light beam rising straight up, unmistakable through fog from well outside DUNGEON_EXIT_
// RADIUS/DUNGEON_DESCEND_RADIUS (1.8), backed by a much stronger point light.
function FloorMarker({ position, color }: { position: [number, number]; color: string }) {
  const innerRingRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = t * 0.6;
      innerRingRef.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.08);
    }
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 2.2) * 0.1;
    }
  });

  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.0, 1.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={innerRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.5, 0.65, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, 2, 0]}>
        <cylinderGeometry args={[0.12, 0.4, 4, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color={color} intensity={1.8} distance={8} />
      {/* Purely decorative — sits just outside the trigger radius so it never blocks the
          actual walk-in check, see DUNGEON_EXIT_RADIUS/DUNGEON_DESCEND_RADIUS (both 1.8). Its
          own Suspense boundary since FloorMarker renders outside the floor's main one. */}
      <Suspense fallback={null}>
        <DungeonProp url={STAIRS_MODEL} position={[0, 0, 1.6]} rotationY={Math.PI} scale={STAIRS_SCALE} />
      </Suspense>
    </group>
  );
}

/**
 * A self-contained dungeon floor — a genuinely separate instance (unlike the village), so it
 * reuses near-origin coordinates freely for every floor, even across different dungeons (see
 * DUNGEON_META/worldColliders.ts's DUNGEON_ENTRANCES for the 3 dungeons this now renders — they
 * never load at once, so sharing coordinate space is invisible). A chain of rooms (3-5, see
 * FLOOR_PLANS, a shared shape pool every dungeon draws from) linked by winding corridors, a
 * different shape per floor; the entry doorway always leads back toward the field (floor 1) or
 * up a floor, the exit doorway (present on every floor but this dungeon's own last one) leads
 * one floor deeper. See worldStore.ts for the actual floor-swapping logic, and getFloorRects()
 * above for the shape.
 */
export function Dungeon({ dungeonId, floor }: { dungeonId: DungeonId; floor: number }) {
  const maxFloor = DUNGEON_META[dungeonId].maxFloor;
  const hasExit = floor < maxFloor;
  const open = useMemo(() => rasterize(getFloorRects(floor, maxFloor)), [floor, maxFloor]);
  const walls = useMemo(() => wallsFromOpenCells(open), [open]);
  const floorTiles = useMemo(() => floorTilesFromOpenCells(open), [open]);
  const rooms = useMemo(() => getFloorRoomList(floor), [floor]);
  const entryTrigger = useMemo(() => getEntryTrigger(floor), [floor]);
  const exitTrigger = useMemo(() => getExitTrigger(floor, maxFloor), [floor, maxFloor]);

  function handleFloorClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    // See Ground.tsx's handleGroundClick for why this cancels instead of also moving.
    if (useCombatStore.getState().armedSkillId !== null) {
      useCombatStore.getState().cancelAimSkill();
      return;
    }
    setMoveTarget(event.point.x, event.point.z);
  }

  return (
    <group>
      {/* Invisible click-to-move plane, sized to the whole floor's bounding box (a bit more
          than any single room needs, but harmless — clicks outside the actual walkable area
          just resolve against the wall colliders like normal) — the real floor visuals are
          the floor_tile_large instances below, but those are Suspense-boundary GLTF loads and
          shouldn't gate click-to-move working immediately on floor entry. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleFloorClick}
        visible={false}
        position={[0, 0, (rooms[0].z1 + rooms[rooms.length - 1].z2) / 2]}
      >
        <planeGeometry args={[ROOM_HALF_X * 2, ROOM_HALF_Z * 2]} />
      </mesh>

      <Suspense fallback={null}>
        {floorTiles.map(([x, z], i) => (
          <DungeonProp key={`floor-${i}`} url={FLOOR_TILE_MODEL} position={[x, 0, z]} />
        ))}

        {walls.map((w, i) => (
          <DungeonProp key={`wall-${i}`} url={WALL_MODEL} position={[w.x, 0, w.z]} rotationY={w.rotationY} />
        ))}

        {rooms.flatMap((room, ri) =>
          roomColumnOffsets(room).map(([x, z], i) => (
            <DungeonProp key={`column-${ri}-${i}`} url={COLUMN_MODEL} position={[x, 0, z]} />
          )),
        )}

        {rooms.flatMap((room, ri) =>
          roomTorchOffsets(room).map((pos, i) => <Torch key={`torch-${ri}-${i}`} position={pos} />),
        )}
      </Suspense>

      <FloorMarker position={entryTrigger} color="#bcdcf0" />
      {hasExit && exitTrigger && <FloorMarker position={exitTrigger} color="#c084fc" />}
    </group>
  );
}

useGLTF.preload(WALL_MODEL);
useGLTF.preload(FLOOR_TILE_MODEL);
useGLTF.preload(COLUMN_MODEL);
useGLTF.preload(TORCH_MODEL);
useGLTF.preload(STAIRS_MODEL);
