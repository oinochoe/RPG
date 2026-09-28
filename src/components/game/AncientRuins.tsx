import * as THREE from 'three';
import { NameTag } from './NameTag';

// Sits just off 태고의 거인's own spawn point (see FieldMonsters.ts's WORLD_BOSS_POSITION,
// [300, -260]) rather than on top of it — a visible "something old is buried here" landmark
// backing up the main quest's own reveal ("던전 저 너머 평원에서 뭔가 아주 오래된 것이 눈을
// 떴다더군", see questStore's 잊혀진 재앙). Built from primitive geometry, same choice
// CaveEntrance.tsx already made for its own rock piles, rather than sourcing a new ruins GLB —
// no new asset risk, and broken/tilted columns read fine as procedural shapes.
// Exported so FieldMonsters.ts's buildRuinsGuardian can spawn 유적의 파수병 exactly here,
// rather than duplicating this coordinate as a second magic number that could drift out of
// sync with where the landmark actually renders.
export const RUINS_POSITION: [number, number] = [285, -240];

interface ColumnDef {
  offset: [number, number];
  height: number;
  tiltX: number;
  tiltZ: number;
}

// Deliberately irregular heights/tilts (not a tidy ring) — a temple that's been broken for a
// very long time, not a preserved one.
const COLUMNS: ColumnDef[] = [
  { offset: [-3.2, -2], height: 3.4, tiltX: 0, tiltZ: 0.03 },
  { offset: [-1, -3.4], height: 1.6, tiltX: 0.4, tiltZ: -0.1 },
  { offset: [2.6, -2.6], height: 2.8, tiltX: -0.05, tiltZ: 0.02 },
  { offset: [3.4, 0.8], height: 0.9, tiltX: 0.6, tiltZ: 0.3 },
  { offset: [0.6, 2.6], height: 3.1, tiltX: 0, tiltZ: -0.04 },
  { offset: [-2.8, 1.6], height: 2.1, tiltX: 0.15, tiltZ: 0.25 },
];

function Column({ def }: { def: ColumnDef }) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={[def.offset[0], def.height / 2, def.offset[1]]}
      rotation={[def.tiltX, 0, def.tiltZ]}
    >
      <cylinderGeometry args={[0.45, 0.55, def.height, 8]} />
      <meshStandardMaterial color="#4a463e" roughness={0.95} flatShading />
    </mesh>
  );
}

/** A ruined temple landmark in 구울 평원, giving 태고의 거인's resting place some visible
 * history rather than just an empty patch of ground with a monster standing on it. Purely
 * decorative — no collider, same as CaveEntrance's own rock piles. */
export function AncientRuins() {
  return (
    <group position={[RUINS_POSITION[0], 0, RUINS_POSITION[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[5.5, 32]} />
        <meshStandardMaterial color="#2e2b26" roughness={1} />
      </mesh>
      {COLUMNS.map((def, i) => (
        <Column key={i} def={def} />
      ))}
      {/* A faint rune glow at the center — the "something old woke up here" cue, same idea as
          CaveEntrance's own pointLight, just a colder/eerier tone matching 태고의 거인 rather
          than a cave's warm torchlight. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[1.2, 1.5, 32]} />
        <meshBasicMaterial color="#7c4dff" transparent opacity={0.55} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color="#7c4dff" intensity={0.6} distance={9} />
      <NameTag position={[0, 3.8, 0]} label="고대 유적" accent="#7c4dff" />
    </group>
  );
}
