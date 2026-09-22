import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/**
 * A billboarded, additively-blended sprite that snaps to size and fades out over `duration` —
 * the "화려한" visual layer for a skill cast/impact, on top of the plain swing/projectile
 * every attack already has (see CharacterMesh's skillEffects). Damage is already applied
 * instantly by castSkill; this is purely decorative and never gates gameplay.
 */
export function FxSprite({
  position,
  texturePath,
  color,
  size = 1.4,
  duration = 320,
  onDone,
}: {
  position: [number, number, number];
  texturePath: string;
  color: THREE.ColorRepresentation;
  size?: number;
  duration?: number;
  onDone: () => void;
}) {
  const texture = useTexture(texturePath);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startedAt = useRef(performance.now());
  const doneRef = useRef(false);
  const { camera } = useThree();

  useFrame(() => {
    if (doneRef.current || !meshRef.current || !materialRef.current) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / duration);
    // Reaches full size in the first 30% of the lifetime, then holds while fading — reads as
    // a quick flash/burst rather than a slow blossom.
    const growT = Math.min(1, t / 0.3);
    meshRef.current.scale.setScalar(size * (0.5 + 0.5 * growT));
    meshRef.current.quaternion.copy(camera.quaternion);
    materialRef.current.opacity = 1 - t;
    if (t >= 1) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        color={color}
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * A flat expanding-and-fading ring on the ground — the "this is an area attack" visual for
 * AOE skills (see combatStore's SkillDef.type/aoeRadius), sized to the skill's actual
 * aoeRadius so it communicates the real hit area rather than just another point burst. Lies
 * flat (unlike FxSprite, deliberately not billboarded — a ground decal shouldn't face the
 * camera) and needs no texture asset: a plain ring geometry reads clearly on its own.
 */
export function SkillRing({
  position,
  color,
  radius,
  duration = 450,
  onDone,
}: {
  position: [number, number, number];
  color: THREE.ColorRepresentation;
  radius: number;
  duration?: number;
  onDone: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startedAt = useRef(performance.now());
  const doneRef = useRef(false);

  useFrame(() => {
    if (doneRef.current || !meshRef.current || !materialRef.current) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / duration);
    meshRef.current.scale.setScalar(0.15 + t * 0.85);
    materialRef.current.opacity = (1 - t) * 0.85;
    if (t >= 1) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.7, radius, 40]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
