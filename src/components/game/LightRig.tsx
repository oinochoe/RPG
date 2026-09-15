import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';

const LIGHT_OFFSET = new THREE.Vector3(12, 22, 8);

/**
 * The directional light (and its shadow frustum) follows the player instead of sitting
 * fixed at the world origin. The field+village world is now much larger than the shadow
 * camera's frustum, so a static light would leave most of it unshadowed. (drei's
 * ContactShadows was tried here too for extra ground-contact AO, but repositioning it every
 * frame produced streaking artifacts — it isn't built for continuous movement — so plain
 * directional-light shadows carry the whole scene now.)
 */
export function LightRig() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  }, []);

  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.position.set(
        playerPosition.x + LIGHT_OFFSET.x,
        LIGHT_OFFSET.y,
        playerPosition.z + LIGHT_OFFSET.z,
      );
    }
    targetRef.current?.position.set(playerPosition.x, 0, playerPosition.z);
  });

  return (
    <>
      <directionalLight
        ref={lightRef}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-camera-near={1}
        shadow-camera-far={75}
        shadow-bias={-0.0006}
      />
      <object3D ref={targetRef} />
    </>
  );
}
