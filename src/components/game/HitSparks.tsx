import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { subscribeHit } from './combatFx';
import { SparkPool } from './sparkPool';

const POOL_SIZE = 96;
const COLOR: Record<'normal' | 'heavy' | 'player', number> = { normal: 0xffffff, heavy: 0xffd54a, player: 0xff5a5a };

/**
 * All hit sparks in one InstancedMesh (one draw call, no lights). Colors are plain hex on purpose:
 * three.js materials cannot resolve CSS variables.
 */
export function HitSparks() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo(() => new SparkPool(POOL_SIZE), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  useEffect(
    () =>
      subscribeHit((e) => {
        if (e.kind === 'playerHit') pool.spawn(e.position, 8, 3.5, 0.35, 0.09, COLOR.player);
        else if (e.kind === 'kill') pool.spawn(e.position, 26, 5.5, 0.55, 0.13, COLOR.heavy);
        else if (e.heavy) pool.spawn(e.position, 14, 4.5, 0.45, 0.11, COLOR.heavy);
        else pool.spawn(e.position, 6, 3.2, 0.3, 0.08, COLOR.normal);
      }),
    [pool],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    pool.step(Math.min(delta, 0.05));
    for (let i = 0; i < POOL_SIZE; i++) {
      if (pool.isAlive(i)) {
        dummy.position.set(pool.x[i], pool.y[i], pool.z[i]);
        dummy.scale.setScalar(pool.scale[i] * pool.remaining(i));
        tint.setHex(pool.color[i]);
        mesh.setColorAt(i, tint);
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, POOL_SIZE]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
