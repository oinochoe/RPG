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
  skill = false,
  color,
  onArrive,
}: {
  from: [number, number, number];
  to: [number, number, number];
  duration?: number;
  variant: 'arrow' | 'bolt';
  // A skill's projectile is the same shape as a basic attack's, just bigger and glowing in
  // the skill's own color — reusing the geometry keeps this from needing a whole separate
  // asset just to look "more active-ability" than a plain arrow/bolt.
  skill?: boolean;
  color?: THREE.ColorRepresentation;
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

  const skillColor = color ?? (variant === 'arrow' ? '#eaffb0' : '#ff6a2b');

  return (
    <group ref={groupRef} position={from} quaternion={quaternion} scale={skill ? 1.7 : 1}>
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
          {skill && <pointLight color={skillColor} intensity={1.6} distance={3} />}
        </group>
      ) : (
        <group>
          <mesh>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial
              color={skill ? skillColor : '#9be7ff'}
              emissive={skill ? skillColor : '#5ec8ff'}
              emissiveIntensity={skill ? 3 : 2}
            />
          </mesh>
          <pointLight color={skill ? skillColor : '#9be7ff'} intensity={skill ? 2.2 : 1.2} distance={skill ? 3.5 : 2.5} />
        </group>
      )}
    </group>
  );
}
