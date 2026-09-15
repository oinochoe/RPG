import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';

const OFFSET = new THREE.Vector3(18, 16, 18);

export function CameraRig() {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const lookTarget = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((_, delta) => {
    const cam = camRef.current;
    if (!cam) return;
    const followSpeed = Math.min(1, delta * 4);
    const desiredPos = new THREE.Vector3().addVectors(playerPosition, OFFSET);
    cam.position.lerp(desiredPos, followSpeed);
    lookTarget.current.lerp(
      new THREE.Vector3(playerPosition.x, playerPosition.y + 1, playerPosition.z),
      followSpeed,
    );
    cam.lookAt(lookTarget.current);
  });

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      position={[18, 16, 18]}
      zoom={70}
      near={0.1}
      far={200}
    />
  );
}
