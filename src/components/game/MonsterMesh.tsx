import { Html } from '@react-three/drei';
import type { MonsterInstanceSummary } from '../../types/api';

export function MonsterMesh({ monster }: { monster: MonsterInstanceSummary }) {
  const position: [number, number, number] = [
    monster.position_x,
    monster.position_y + 0.5,
    monster.position_z,
  ];

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7f2d8f" />
      </mesh>
      <Html position={[0, 1, 0]} center>
        <div>
          {monster.name} (Lv.{monster.level})
        </div>
      </Html>
    </group>
  );
}
