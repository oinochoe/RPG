import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Purely visual flourish for a ranged basic attack — damage is already applied instantly by
 * attackNearest (see CharacterMesh's handleAttackResult), same instant-hit model as the melee
 * swing. This just animates a mesh from the attacker to the target over `duration` and then
 * tells the parent to drop it via onArrive.
 */
export function Projectile({
  from,
  to,
  duration = 220,
  variant,
  onArrive,
}: {
  from: [number, number, number];
  to: [number, number, number];
  duration?: number;
  variant: 'arrow' | 'bolt';
  onArrive: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef(performance.now());
  const arrived = useRef(false);
  const fromVec = useMemo(() => new THREE.Vector3(...from), [from]);
  const toVec = useMemo(() => new THREE.Vector3(...to), [to]);
  const quaternion = useMemo(() => {
    const direction = toVec.clone().sub(fromVec).normalize();
    // Our geometries (cone/cylinder for the arrow, sphere for the bolt) run along +Y by
    // default, so aligning +Y to the travel direction points them the right way.
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }, [fromVec, toVec]);

  useFrame(() => {
    if (!groupRef.current || arrived.current) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / duration);
    groupRef.current.position.lerpVectors(fromVec, toVec, t);
    if (t >= 1) {
      arrived.current = true;
      onArrive();
    }
  });

  return (
    <group ref={groupRef} position={from} quaternion={quaternion}>
      {variant === 'arrow' ? (
        <group>
          <mesh position={[0, 0.19, 0]}>
            <coneGeometry args={[0.03, 0.1, 6]} />
            <meshStandardMaterial color="#6b6a63" />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.014, 0.014, 0.34, 6]} />
            <meshStandardMaterial color="#c9b48a" />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#9be7ff" emissive="#5ec8ff" emissiveIntensity={2} />
          </mesh>
          <pointLight color="#9be7ff" intensity={1.2} distance={2.5} />
        </group>
      )}
    </group>
  );
}
