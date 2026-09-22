import { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { setMoveTarget } from './moveTarget';
import { useCombatStore } from '../../stores/combatStore';
import type { Collider } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

// KayKit Dungeon Pack — every structural piece (wall/wall_doorway/floor_tile_large) is
// modeled on a 4-unit grid (see each .gltf's own bounding box: width 4, height 4, depth 1 for
// walls; 4x4 for floor tiles).
const KAYKIT_DUNGEON = '/models/kaykit-dungeon/Assets/gltf';
const WALL_MODEL = `${KAYKIT_DUNGEON}/wall.gltf`;
const FLOOR_TILE_MODEL = `${KAYKIT_DUNGEON}/floor_tile_large.gltf`;
const COLUMN_MODEL = `${KAYKIT_DUNGEON}/column.gltf`;
const TORCH_MODEL = `${KAYKIT_DUNGEON}/torch_lit.gltf`;

export const CELL_SIZE = 4;
export const DUNGEON_MAX_FLOOR = 6;

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

// Layout tuning — 3 rooms in a fixed south/middle/north arrangement, connected by L-shaped
// ("dogleg") corridors, with the middle room zigzagging left/right by floor parity. This is a
// hand-authored winding shape rather than a randomized maze generator: simpler to keep
// correct (guaranteed connected, no dead-end generation edge cases) while still reading as a
// real winding dungeon instead of one flat room. The south/north rooms never move, which is
// what lets DUNGEON_EXIT_TRIGGER/DUNGEON_SOUTH_SPAWN/etc. below stay plain fixed constants
// instead of needing to be floor-dependent (see worldStore.ts's enterFloor/AreaTransitions.tsx
// — both already assume fixed trigger points).
const ROOM_HALF = 16;
const CORRIDOR_HALF = 6;
const ROOM_GAP_Z = 80;
const SIDE_OFFSET = 34;
const DOORWAY_STUB_HALF = 3;

const SOUTH_ROOM = rectC(0, -ROOM_GAP_Z, ROOM_HALF, ROOM_HALF);
const NORTH_ROOM = rectC(0, ROOM_GAP_Z, ROOM_HALF, ROOM_HALF);

// Overall bounding half-extents (fixed, covers either zigzag direction) — used by WorldMap.tsx
// and MiniMap.tsx to size the dungeon minimap's view, and by characterStore's blink-in-dungeon
// fallback. Not "half the room" anymore (there is no single room), but "half the whole floor
// plan," padded for the entry/exit doorway stubs.
export const ROOM_HALF_X = SIDE_OFFSET + ROOM_HALF;
export const ROOM_HALF_Z = ROOM_GAP_Z + ROOM_HALF + CELL_SIZE;

// Gap in the south room's south wall — floor 1's exit leads back to the field, deeper floors
// lead up one level. Fixed because SOUTH_ROOM never moves between floors.
export const DUNGEON_EXIT_TRIGGER: [number, number] = [0, SOUTH_ROOM.z1 + 1];
export const DUNGEON_EXIT_RADIUS = 1.8;
// Gap in the north room's north wall (only present on floors below the last) — leads one
// floor deeper. Fixed for the same reason.
export const DUNGEON_DESCEND_TRIGGER: [number, number] = [0, NORTH_ROOM.z2 - 1];
export const DUNGEON_DESCEND_RADIUS = 1.8;

// Spawn a few units in from whichever doorway the player would have just walked through to
// land on this floor. The offset (3, vs. the trigger radius of 1.8) keeps the transition
// cooldown from being the only thing stopping an instant re-trigger.
export const DUNGEON_SOUTH_SPAWN: [number, number] = [0, SOUTH_ROOM.z1 + 3];
export const DUNGEON_NORTH_SPAWN: [number, number] = [0, NORTH_ROOM.z2 - 3];

function sideForFloor(floor: number): number {
  return floor % 2 === 1 ? SIDE_OFFSET : -SIDE_OFFSET;
}

/** The 3 rooms only (no corridors) — used for monster placement and characterStore's
 * blink-in-dungeon, both of which want "somewhere reasonable to stand," not a narrow hallway. */
export function getFloorRooms(floor: number): { south: Rect; middle: Rect; north: Rect } {
  return { south: SOUTH_ROOM, middle: rectC(sideForFloor(floor), 0, ROOM_HALF, ROOM_HALF), north: NORTH_ROOM };
}

/** Every rectangle making up this floor's walkable area — rooms, corridor legs, and the two
 * short doorway stubs that punch the entry/exit gaps into the south/north rooms' outer walls.
 * The whole rendered floor (walls, floor tiles, colliders) derives from this one list via
 * rasterize()/wallsFromOpenCells() below, so there's a single source of truth for the shape. */
export function getFloorRects(floor: number): Rect[] {
  const { south, middle, north } = getFloorRooms(floor);
  const side = sideForFloor(floor);
  const bendZ1 = (south.z2 + middle.z1) / 2;
  const bendZ2 = (middle.z2 + north.z1) / 2;

  const rects = [
    south,
    middle,
    north,
    rectXZ(-CORRIDOR_HALF, CORRIDOR_HALF, south.z2, bendZ1),
    rectXZ(0, side, bendZ1 - CORRIDOR_HALF, bendZ1 + CORRIDOR_HALF),
    rectXZ(side - CORRIDOR_HALF, side + CORRIDOR_HALF, bendZ1, middle.z1),
    rectXZ(side - CORRIDOR_HALF, side + CORRIDOR_HALF, middle.z2, bendZ2),
    rectXZ(side, 0, bendZ2 - CORRIDOR_HALF, bendZ2 + CORRIDOR_HALF),
    rectXZ(-CORRIDOR_HALF, CORRIDOR_HALF, bendZ2, north.z1),
    rectXZ(-DOORWAY_STUB_HALF, DOORWAY_STUB_HALF, south.z1 - CELL_SIZE, south.z1),
  ];
  if (floor < DUNGEON_MAX_FLOOR) {
    rects.push(rectXZ(-DOORWAY_STUB_HALF, DOORWAY_STUB_HALF, north.z2, north.z2 + CELL_SIZE));
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

// Skeletons (monster_template_id 3, same convention as FieldMonsters.ts) join the roster
// from floor 2 onward — floor 1 stays goblins-only so a first-time player learns the basics
// against one enemy type before the mix shows up. Same level/hp formula as the goblins on
// the same floor (species is a visual/variety distinction here, not a separate power tier).
function regularMonster(
  idBase: number,
  slot: number,
  floor: number,
  level: number,
  hp: number,
  position: [number, number],
): MonsterInstanceSummary {
  const isSkeleton = floor >= 2 && (slot === 2 || slot === 6 || slot === 9);
  return {
    instance_id: idBase + slot,
    monster_template_id: isSkeleton ? 3 : 2,
    name: isSkeleton ? '스켈레톤' : '고블린',
    level,
    current_hp: hp,
    max_hp: hp,
    position_x: position[0],
    position_y: 0,
    position_z: position[1],
  };
}

/** Deterministic per-floor monster roster, spread across all 3 rooms (not the corridors)
 * instead of crammed into one — stronger the deeper you go, with a tougher captain guarding
 * the north room (the way to the next floor down) and a named boss on the final floor. */
export function buildFloorMonsters(floor: number): MonsterInstanceSummary[] {
  const level = FLOOR_BASE_LEVEL + (floor - 1) * 3;
  const hp = 60 + (floor - 1) * 40;
  const idBase = 9000 + floor * 100;
  const isLastFloor = floor === DUNGEON_MAX_FLOOR;
  const captainHp = Math.round(hp * (isLastFloor ? 2.5 : 1.8));
  const { south, middle, north } = getFloorRooms(floor);

  return [
    regularMonster(idBase, 1, floor, level, hp, [south.x1 + 8, south.z2 - 12]),
    regularMonster(idBase, 2, floor, level, hp, [south.x2 - 8, south.z2 - 12]),
    regularMonster(idBase, 8, floor, level, hp, [south.x1 + 16, south.z1 + 6]),
    regularMonster(idBase, 3, floor, level, hp, [middle.x1 + 8, middle.z1 + 10]),
    regularMonster(idBase, 5, floor, level, hp, [middle.x2 - 8, middle.z2 - 10]),
    regularMonster(idBase, 9, floor, level, hp, [middle.x1 + 16, middle.z1 + 6]),
    regularMonster(idBase, 6, floor, level, hp, [north.x1 + 8, north.z1 + 12]),
    regularMonster(idBase, 7, floor, level, hp, [north.x2 - 8, north.z1 + 12]),
    regularMonster(idBase, 10, floor, level, hp, [north.x1 + 16, north.z2 - 6]),
    {
      instance_id: idBase + 4,
      monster_template_id: 2,
      name: isLastFloor ? '고블린 군주' : '고블린 대장',
      level: level + (isLastFloor ? 5 : 2),
      current_hp: captainHp,
      max_hp: captainHp,
      // The captain is the one monster on this floor that's aggressive on sight (see
      // worldStore's isDungeonEscortAggressive), so it sits in the north room — far enough
      // from DUNGEON_NORTH_SPAWN (arriving here by ascending from a deeper floor) that
      // MONSTER_DETECT_RANGE (6) + MONSTER_WANDER_RADIUS (2.5) can't reach it on arrival —
      // guarding the way deeper rather than ambushing anyone who just walked in.
      position_x: north.x2 - 8,
      position_y: 0,
      position_z: north.z1 + 4,
    },
  ];
}

const COLLIDER_RADIUS = 1.3;
const COLLIDER_OFFSET = 1;

export function getDungeonColliders(floor: number): Collider[] {
  const open = rasterize(getFloorRects(floor));
  const walls = wallsFromOpenCells(open);
  const colliders: Collider[] = [];
  for (const w of walls) {
    const alongX = w.rotationY === 0;
    for (const offset of [-COLLIDER_OFFSET, COLLIDER_OFFSET]) {
      colliders.push({ x: w.x + (alongX ? offset : 0), z: w.z + (alongX ? 0 : offset), radius: COLLIDER_RADIUS });
    }
  }

  const { south, middle, north } = getFloorRooms(floor);
  for (const room of [south, middle, north]) {
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

function FloorMarker({ position, color }: { position: [number, number]; color: string }) {
  return (
    <group position={[position[0], 0.02, position[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.35} />
      </mesh>
      <pointLight position={[0, 1, 0]} color={color} intensity={0.5} distance={4} />
    </group>
  );
}

/**
 * A self-contained dungeon floor — a genuinely separate instance (unlike the village), so it
 * reuses near-origin coordinates freely for every floor. 3 rooms (south/middle/north) linked
 * by winding corridors; the south doorway always leads back toward the field (floor 1) or up
 * a floor, the north doorway (present on every floor but the last) leads one floor deeper. See
 * worldStore.ts for the actual floor-swapping logic, and getFloorRects() above for the shape.
 */
export function Dungeon({ floor }: { floor: number }) {
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const open = useMemo(() => rasterize(getFloorRects(floor)), [floor]);
  const walls = useMemo(() => wallsFromOpenCells(open), [open]);
  const floorTiles = useMemo(() => floorTilesFromOpenCells(open), [open]);
  const rooms = useMemo(() => getFloorRooms(floor), [floor]);

  function handleFloorClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    // See Ground.tsx's handleGroundClick for why this cancels instead of also moving.
    if (useCombatStore.getState().isAimingSkill) {
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
        position={[0, 0, (rooms.south.z1 + rooms.north.z2) / 2]}
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

        {[rooms.south, rooms.middle, rooms.north].flatMap((room, ri) =>
          roomColumnOffsets(room).map(([x, z], i) => (
            <DungeonProp key={`column-${ri}-${i}`} url={COLUMN_MODEL} position={[x, 0, z]} />
          )),
        )}

        {[rooms.south, rooms.middle, rooms.north].flatMap((room, ri) =>
          roomTorchOffsets(room).map((pos, i) => <Torch key={`torch-${ri}-${i}`} position={pos} />),
        )}
      </Suspense>

      <FloorMarker position={DUNGEON_EXIT_TRIGGER} color="#bcdcf0" />
      {hasNorthGap && <FloorMarker position={DUNGEON_DESCEND_TRIGGER} color="#c084fc" />}
    </group>
  );
}

useGLTF.preload(WALL_MODEL);
useGLTF.preload(FLOOR_TILE_MODEL);
useGLTF.preload(COLUMN_MODEL);
useGLTF.preload(TORCH_MODEL);
