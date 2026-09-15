import { useStoneTexture } from './proceduralTextures';
import type { Collider } from './worldColliders';
import type { MonsterInstanceSummary } from '../../types/api';

const ROOM_HALF_X = 12;
const ROOM_HALF_Z = 10;
const DOOR_HALF_WIDTH = 2;
const WALL_HEIGHT = 3;
const WALL_SPACING = 1.8;
const WALL_RADIUS = 1;

export const DUNGEON_SPAWN: [number, number] = [0, 0];
// Where the player has to walk back to in order to leave — the gap left in the south wall.
export const DUNGEON_EXIT_TRIGGER: [number, number] = [0, -ROOM_HALF_Z + 1];
export const DUNGEON_EXIT_RADIUS = 1.8;

export const DUNGEON_MONSTERS: MonsterInstanceSummary[] = [
  { instance_id: 9001, monster_template_id: 2, name: '고블린', level: 5, current_hp: 60, max_hp: 60, position_x: -6, position_y: 0, position_z: 3 },
  { instance_id: 9002, monster_template_id: 2, name: '고블린', level: 5, current_hp: 60, max_hp: 60, position_x: 6, position_y: 0, position_z: 3 },
  { instance_id: 9003, monster_template_id: 2, name: '고블린', level: 5, current_hp: 60, max_hp: 60, position_x: 0, position_y: 0, position_z: 6 },
  { instance_id: 9004, monster_template_id: 2, name: '고블린 대장', level: 7, current_hp: 110, max_hp: 110, position_x: -5, position_y: 0, position_z: -4 },
  { instance_id: 9005, monster_template_id: 2, name: '고블린', level: 5, current_hp: 60, max_hp: 60, position_x: 5, position_y: 0, position_z: -4 },
];

interface WallSegment {
  positions: [number, number][];
}

function buildWallSegments(): WallSegment[] {
  const segments: WallSegment[] = [];

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

  segments.push({ positions: line([-ROOM_HALF_X, ROOM_HALF_Z], [ROOM_HALF_X, ROOM_HALF_Z]) }); // north
  segments.push({ positions: line([-ROOM_HALF_X, -ROOM_HALF_Z], [-ROOM_HALF_X, ROOM_HALF_Z]) }); // west
  segments.push({ positions: line([ROOM_HALF_X, -ROOM_HALF_Z], [ROOM_HALF_X, ROOM_HALF_Z]) }); // east
  // South wall, split around the doorway gap.
  segments.push({ positions: line([-ROOM_HALF_X, -ROOM_HALF_Z], [-DOOR_HALF_WIDTH, -ROOM_HALF_Z]) });
  segments.push({ positions: line([DOOR_HALF_WIDTH, -ROOM_HALF_Z], [ROOM_HALF_X, -ROOM_HALF_Z]) });

  return segments;
}

const WALL_SEGMENTS = buildWallSegments();

export const dungeonColliders: Collider[] = WALL_SEGMENTS.flatMap((seg) =>
  seg.positions.map(([x, z]) => ({ x, z, radius: WALL_RADIUS })),
);

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

function ExitMarker() {
  return (
    <group position={[DUNGEON_EXIT_TRIGGER[0], 0.02, DUNGEON_EXIT_TRIGGER[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 24]} />
        <meshStandardMaterial
          color="#bcdcf0"
          emissive="#8fc7ea"
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
        />
      </mesh>
      <pointLight position={[0, 1, 0]} color="#bcdcf0" intensity={0.5} distance={4} />
    </group>
  );
}

/**
 * A self-contained dungeon room — a genuinely separate instance (unlike the village), so it
 * reuses near-origin coordinates freely. Entered/exited by walking through the gap in the
 * south wall; see worldStore.ts for the actual area-switching logic.
 */
export function Dungeon() {
  const stoneTexture = useStoneTexture();

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_X * 2, ROOM_HALF_Z * 2]} />
        <meshStandardMaterial map={stoneTexture} roughness={0.95} metalness={0} />
      </mesh>

      {WALL_SEGMENTS.map((seg, i) => (
        <Wall key={i} positions={seg.positions} />
      ))}

      {TORCH_POSITIONS.map((pos, i) => (
        <Torch key={i} position={pos} />
      ))}

      <ExitMarker />
    </group>
  );
}
