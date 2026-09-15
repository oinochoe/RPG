import { useMemo } from 'react';
import { useStoneTexture } from './proceduralTextures';
import type { Collider } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

const ROOM_HALF_X = 12;
const ROOM_HALF_Z = 10;
const DOOR_HALF_WIDTH = 2;
const WALL_HEIGHT = 3;
const WALL_SPACING = 1.8;
const WALL_RADIUS = 1;

export const DUNGEON_MAX_FLOOR = 3;
export const DUNGEON_SPAWN: [number, number] = [0, 0];
// Gap in the south wall — floor 1's exit leads back to the field, deeper floors lead up one level.
export const DUNGEON_EXIT_TRIGGER: [number, number] = [0, -ROOM_HALF_Z + 1];
export const DUNGEON_EXIT_RADIUS = 1.8;
// Gap in the north wall (only present on floors below the last) — leads one level deeper.
export const DUNGEON_DESCEND_TRIGGER: [number, number] = [0, ROOM_HALF_Z - 1];
export const DUNGEON_DESCEND_RADIUS = 1.8;

const FLOOR_BASE_LEVEL = 5;

/** Deterministic per-floor monster roster — stronger the deeper you go, with a tougher
 * captain on every floor and a named boss guarding the final floor. */
export function buildFloorMonsters(floor: number): MonsterInstanceSummary[] {
  const level = FLOOR_BASE_LEVEL + (floor - 1) * 3;
  const hp = 60 + (floor - 1) * 40;
  const idBase = 9000 + floor * 100;
  const isLastFloor = floor === DUNGEON_MAX_FLOOR;
  const captainHp = Math.round(hp * (isLastFloor ? 2.5 : 1.8));

  return [
    { instance_id: idBase + 1, monster_template_id: 2, name: '고블린', level, current_hp: hp, max_hp: hp, position_x: -6, position_y: 0, position_z: 3 },
    { instance_id: idBase + 2, monster_template_id: 2, name: '고블린', level, current_hp: hp, max_hp: hp, position_x: 6, position_y: 0, position_z: 3 },
    { instance_id: idBase + 3, monster_template_id: 2, name: '고블린', level, current_hp: hp, max_hp: hp, position_x: 0, position_y: 0, position_z: 6 },
    { instance_id: idBase + 5, monster_template_id: 2, name: '고블린', level, current_hp: hp, max_hp: hp, position_x: 5, position_y: 0, position_z: -4 },
    {
      instance_id: idBase + 4,
      monster_template_id: 2,
      name: isLastFloor ? '고블린 군주' : '고블린 대장',
      level: level + (isLastFloor ? 5 : 2),
      current_hp: captainHp,
      max_hp: captainHp,
      position_x: -5,
      position_y: 0,
      position_z: -4,
    },
  ];
}

interface WallSegment {
  positions: [number, number][];
}

function line(from: [number, number], to: [number, number]): [number, number][] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.round(len / WALL_SPACING));
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([from[0] + dx * t, from[1] + dz * t]);
  }
  return points;
}

function buildWallSegments(hasNorthGap: boolean): WallSegment[] {
  const segments: WallSegment[] = [];

  if (hasNorthGap) {
    segments.push({ positions: line([-ROOM_HALF_X, ROOM_HALF_Z], [-DOOR_HALF_WIDTH, ROOM_HALF_Z]) });
    segments.push({ positions: line([DOOR_HALF_WIDTH, ROOM_HALF_Z], [ROOM_HALF_X, ROOM_HALF_Z]) });
  } else {
    segments.push({ positions: line([-ROOM_HALF_X, ROOM_HALF_Z], [ROOM_HALF_X, ROOM_HALF_Z]) });
  }
  segments.push({ positions: line([-ROOM_HALF_X, -ROOM_HALF_Z], [-ROOM_HALF_X, ROOM_HALF_Z]) }); // west
  segments.push({ positions: line([ROOM_HALF_X, -ROOM_HALF_Z], [ROOM_HALF_X, ROOM_HALF_Z]) }); // east
  // South wall, split around the doorway gap (always present — floor 1's way out, or the way
  // back up for deeper floors).
  segments.push({ positions: line([-ROOM_HALF_X, -ROOM_HALF_Z], [-DOOR_HALF_WIDTH, -ROOM_HALF_Z]) });
  segments.push({ positions: line([DOOR_HALF_WIDTH, -ROOM_HALF_Z], [ROOM_HALF_X, -ROOM_HALF_Z]) });

  return segments;
}

export function getDungeonColliders(floor: number): Collider[] {
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  return buildWallSegments(hasNorthGap).flatMap((seg) =>
    seg.positions.map(([x, z]) => ({ x, z, radius: WALL_RADIUS })),
  );
}

const TORCH_POSITIONS: [number, number][] = [
  [-ROOM_HALF_X + 0.5, -ROOM_HALF_Z + 4],
  [-ROOM_HALF_X + 0.5, ROOM_HALF_Z - 4],
  [ROOM_HALF_X - 0.5, -ROOM_HALF_Z + 4],
  [ROOM_HALF_X - 0.5, ROOM_HALF_Z - 4],
];

function Wall({ positions }: { positions: [number, number][] }) {
  return (
    <>
      {positions.map(([x, z], i) => (
        <mesh key={i} castShadow receiveShadow position={[x, WALL_HEIGHT / 2, z]}>
          <boxGeometry args={[WALL_SPACING * 1.05, WALL_HEIGHT, WALL_SPACING * 1.05]} />
          <meshStandardMaterial color="#4a4750" roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

function Torch({ position }: { position: [number, number] }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh castShadow position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 1.4, 6]} />
        <meshStandardMaterial color="#3a2a1a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#ff9a3c" emissive="#ff6a1a" emissiveIntensity={2} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 1.95, 0]} color="#ff9a3c" intensity={1.4} distance={9} />
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
  const stoneTexture = useStoneTexture();
  const hasNorthGap = floor < DUNGEON_MAX_FLOOR;
  const wallSegments = useMemo(() => buildWallSegments(hasNorthGap), [hasNorthGap]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_X * 2, ROOM_HALF_Z * 2]} />
        <meshStandardMaterial map={stoneTexture} roughness={0.95} metalness={0} />
      </mesh>

      {wallSegments.map((seg, i) => (
        <Wall key={i} positions={seg.positions} />
      ))}

      {TORCH_POSITIONS.map((pos, i) => (
        <Torch key={i} position={pos} />
      ))}

      <FloorMarker position={DUNGEON_EXIT_TRIGGER} color="#bcdcf0" />
      {hasNorthGap && <FloorMarker position={DUNGEON_DESCEND_TRIGGER} color="#c084fc" />}
    </group>
  );
}
