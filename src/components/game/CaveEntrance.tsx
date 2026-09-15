import { FIELD_ENTRANCE_POINT } from './worldColliders';

/**
 * The dungeon's cave mouth, visible from the field. Purely decorative — the actual
 * enter-dungeon trigger is a proximity check in AreaTransitions.tsx, not a click.
 */
export function CaveEntrance() {
  return (
    <group position={[FIELD_ENTRANCE_POINT[0], 0, FIELD_ENTRANCE_POINT[1]]}>
      <mesh castShadow receiveShadow position={[-2.2, 1.1, -1.2]}>
        <dodecahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color="#6b655a" roughness={0.95} flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[2.2, 1.3, -1.2]}>
        <dodecahedronGeometry args={[2.2, 0]} />
        <meshStandardMaterial color="#5e584e" roughness={0.95} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[1.6, 24]} />
        <meshStandardMaterial color="#0a0a0c" roughness={1} />
      </mesh>
      <pointLight position={[0, 1, 0.5]} color="#ff9a3c" intensity={0.5} distance={5} />
    </group>
  );
}
