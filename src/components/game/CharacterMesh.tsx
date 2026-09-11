import { Html } from '@react-three/drei';
import type { CharacterProfile } from '../../types/api';

const CLASS_COLORS: Record<CharacterProfile['character_class'], string> = {
  warrior: '#c0392b',
  mage: '#2980b9',
  archer: '#27ae60',
};

export function CharacterMesh({ character }: { character: CharacterProfile }) {
  const position: [number, number, number] = [
    character.position_x,
    character.position_y + 1,
    character.position_z,
  ];

  return (
    <group position={position}>
      <mesh castShadow>
        <capsuleGeometry args={[0.5, 1, 4, 8]} />
        <meshStandardMaterial color={CLASS_COLORS[character.character_class]} />
      </mesh>
      <Html position={[0, 1.2, 0]} center>
        <div>{character.name}</div>
      </Html>
    </group>
  );
}
