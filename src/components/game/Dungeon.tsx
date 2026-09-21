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
// walls; 4x4 for floor tiles). The room is sized to an exact 5x5 cell grid of that size so a
// doorway cell can sit dead-center in a wall run without needing a half-width filler piece.
const KAYKIT_DUNGEON = '/models/kaykit-dungeon/Assets/gltf';
const WALL_MODEL = `${KAYKIT_DUNGEON}/wall.gltf`;
const DOORWAY_MODEL = `${KAYKIT_DUNGEON}/wall_doorway.gltf`;
const FLOOR_TILE_MODEL = `${KAYKIT_DUNGEON}/floor_tile_large.gltf`;
const COLUMN_MODEL = `${KAYKIT_DUNGEON}/column.gltf`;
const TORCH_MODEL = `${KAYKIT_DUNGEON}/torch_lit.gltf`;

const CELL_SIZE = 4;
const GRID_CELLS = 5; // odd, so the middle cell (the doorway) sits exactly on the room's center line
export const ROOM_HALF_X = (GRID_CELLS * CELL_SIZE) / 2;
export const ROOM_HALF_Z = (GRID_CELLS * CELL_SIZE) / 2;
const CELL_OFFSETS = Array.from({ length: GRID_CELLS }, (_, i) => (i - (GRID_CELLS - 1) / 2) * CELL_SIZE);
const DOOR_CELL_INDEX = (GRID_CELLS - 1) / 2;

export const DUNGEON_MAX_FLOOR = 3;
// Gap in the south wall — floor 1's exit leads back to the field, deeper floors lead up one level.
export const DUNGEON_EXIT_TRIGGER: [number, number] = [0, -ROOM_HALF_Z + 1];
export const DUNGEON_EXIT_RADIUS = 1.8;
// Gap in the north wall (only present on floors below the last) — leads one level deeper.
export const DUNGEON_DESCEND_TRIGGER: [number, number] = [0, ROOM_HALF_Z - 1];
export const DUNGEON_DESCEND_RADIUS = 1.8;

// Spawn a few units in from whichever doorway the player would have just walked through to
// land on this floor, rather than always the room's center — arriving via the south doorway
// (from the field, or up from a deeper floor) lands you just inside the south door; arriving
// via the north doorway (down from a shallower floor) lands you just inside the north door.
// The offset (3, vs. the trigger radius of 1.8) keeps the transition cooldown from being the
// only thing stopping an instant re-trigger.
export const DUNGEON_SOUTH_SPAWN: [number, number] = [0, -ROOM_HALF_Z + 3];
export const DUNGEON_NORTH_SPAWN: [number, number] = [0, ROOM_HALF_Z - 3];

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
  const isSkeleton = floor >= 2 && (slot === 2 || slot === 4);
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

/** Deterministic per-floor monster roster — stronger the deeper you go, with a tougher
 * captain on every floor and a named boss guarding the final floor. */
export function buildFloorMonsters(floor: number): MonsterInstanceSummary[] {
  const level = FLOOR_BASE_LEVEL + (floor - 1) * 3;
  const hp = 60 + (floor - 1) * 40;
  const idBase = 9000 + floor * 100;
  const isLastFloor = floor === DUNGEON_MAX_FLOOR;
  const captainHp = Math.round(hp * (isLastFloor ? 2.5 : 1.8));

  return [
    regularMonster(idBase, 1, floor, level, hp, [-6, 3]),
    regularMonster(idBase, 2, floor, level, hp, [6, 3]),
    regularMonster(idBase, 3, floor, level, hp, [0, 6]),
    regularMonster(idBase, 5, floor, level, hp, [5, -4]),
    {
      instance_id: idBase + 4,
      monster_template_id: 2,
      name: isLastFloor ? '고블린 군주' : '고블린 대장',
      level: level + (isLastFloor ? 5 : 2),
      current_hp: captainHp,
      max_hp: captainHp,
      // The captain is the one monster on this floor that's aggressive on sight (see
      // worldStore's isDungeonEscortAggressive, and combatStore's MONSTER_LEASH_RANGE note —
      // aggressive monsters chase without a leash once engaged), and idle monsters wander up
      // to MONSTER_WANDER_RADIUS (2.5) from their spawn point — so its static distance from
      // wherever the player actually enters (DUNGEON_SOUTH_SPAWN/DUNGEON_NORTH_SPAWN, both
      // near a doorway rather than room center) needs to clear MONSTER_DETECT_RANGE (6) by
      // more than that wander radius, or an unlucky wander leg can drift it into detect range
      // and trigger an immediate chase even though the player never approached it. 8 units
      // against the east wall (ROOM_HALF_X is 10 since the KayKit visual pass) leaves a safe
      // margin either way without sitting flush against the new wall geometry.
      position_x: 8,
      position_y: 0,
      position_z: 0,
    },
  ];
}

type WallCellType = 'wall' | 'doorway';

interface WallCell {
  x: number;
  z: number;
  rotationY: number;
  type: WallCellType;
}

/** One cell per CELL_SIZE step along each of the room's 4 edges. West/east runs are the
 * south/north wall module rotated 90° (the model's own width axis is X, so a run along Z
 * needs that turn). Corner cells are left as plain wall modules on both intersecting runs —
 * KayKit ships dedicated corner pieces with their own asymmetric pivot per rotation, which
 * needs eyes-on-the-render tuning to get right; two plain modules overlapping by their
 * shared 1-unit thickness at each corner reads fine and never leaves a gap. */
function buildWallCells(hasNorthGap: boolean): WallCell[] {
  const cells: WallCell[] = [];

  CELL_OFFSETS.forEach((x, i) => {
    cells.push({ x, z: -ROOM_HALF_Z, rotationY: 0, type: i === DOOR_CELL_INDEX ? 'doorway' : 'wall' });
    cells.push({
      x,
      z: ROOM_HALF_Z,
      rotationY: 0,
      type: i === DOOR_CELL_INDEX && hasNorthGap ? 'doorway' : 'wall',
    });
  });
  CELL_OFFSETS.forEach((z) => {
    cells.push({ x: -ROOM_HALF_X, z, rotationY: Math.PI / 2, type: 'wall' });
    cells.push({ x: ROOM_HALF_X, z, rotationY: Math.PI / 2, type: 'wall' });
  });

  return cells;
}

const COLLIDER_RADIUS = 1.3;
const COLLIDER_OFFSET = 1;

export function getDungeonColliders(floor: number): Collider[] {
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const colliders: Collider[] = [];

  for (const cell of buildWallCells(hasNorthGap)) {
    if (cell.type === 'doorway') continue;
    // Two circles per module, offset along its length axis, approximate the 4-unit-wide
    // wall well enough for the simple circle-based collision in worldColliders.ts.
    const alongX = cell.rotationY === 0;
    for (const offset of [-COLLIDER_OFFSET, COLLIDER_OFFSET]) {
      colliders.push({
        x: cell.x + (alongX ? offset : 0),
        z: cell.z + (alongX ? 0 : offset),
        radius: COLLIDER_RADIUS,
      });
    }
  }

  for (const [x, z] of COLUMN_POSITIONS) {
    colliders.push({ x, z, radius: 0.5 });
  }

  return colliders;
}

const TORCH_POSITIONS: [number, number][] = [
  [-ROOM_HALF_X + 1, -ROOM_HALF_Z + 4],
  [-ROOM_HALF_X + 1, ROOM_HALF_Z - 4],
  [ROOM_HALF_X - 1, -ROOM_HALF_Z + 4],
  [ROOM_HALF_X - 1, ROOM_HALF_Z - 4],
];

const COLUMN_POSITIONS: [number, number][] = [
  [-ROOM_HALF_X + 2.5, -ROOM_HALF_Z + 2.5],
  [ROOM_HALF_X - 2.5, -ROOM_HALF_Z + 2.5],
  [-ROOM_HALF_X + 2.5, ROOM_HALF_Z - 2.5],
  [ROOM_HALF_X - 2.5, ROOM_HALF_Z - 2.5],
];

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
 * A self-contained dungeon room — a genuinely separate instance (unlike the village), so it
 * reuses near-origin coordinates freely for every floor. The south gap always leads back
 * toward the field (floor 1) or up a floor; a north gap (present on every floor but the
 * last) leads one floor deeper. See worldStore.ts for the actual floor-swapping logic.
 */
export function Dungeon({ floor }: { floor: number }) {
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const wallCells = useMemo(() => buildWallCells(hasNorthGap), [hasNorthGap]);

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
      {/* Invisible click-to-move plane, sized to the room — the real floor visuals are the
          floor_tile_large instances below, but those are Suspense-boundary GLTF loads and
          shouldn't gate click-to-move working immediately on floor entry. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleFloorClick} visible={false}>
        <planeGeometry args={[ROOM_HALF_X * 2, ROOM_HALF_Z * 2]} />
      </mesh>

      <Suspense fallback={null}>
        {CELL_OFFSETS.map((x) =>
          CELL_OFFSETS.map((z) => (
            <DungeonProp key={`floor-${x}-${z}`} url={FLOOR_TILE_MODEL} position={[x, 0, z]} />
          )),
        )}

        {wallCells.map((cell, i) => (
          <DungeonProp
            key={`wall-${i}`}
            url={cell.type === 'doorway' ? DOORWAY_MODEL : WALL_MODEL}
            position={[cell.x, 0, cell.z]}
            rotationY={cell.rotationY}
          />
        ))}

        {COLUMN_POSITIONS.map(([x, z], i) => (
          <DungeonProp key={`column-${i}`} url={COLUMN_MODEL} position={[x, 0, z]} />
        ))}

        {TORCH_POSITIONS.map((pos, i) => (
          <Torch key={i} position={pos} />
        ))}
      </Suspense>

      <FloorMarker position={DUNGEON_EXIT_TRIGGER} color="#bcdcf0" />
      {hasNorthGap && <FloorMarker position={DUNGEON_DESCEND_TRIGGER} color="#c084fc" />}
    </group>
  );
}

useGLTF.preload(WALL_MODEL);
useGLTF.preload(DOORWAY_MODEL);
useGLTF.preload(FLOOR_TILE_MODEL);
useGLTF.preload(COLUMN_MODEL);
useGLTF.preload(TORCH_MODEL);
