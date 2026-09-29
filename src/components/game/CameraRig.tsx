import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';

// Exported so CharacterMesh can derive camera-relative movement directions from the same
// offset — WASD needs to move the character relative to what's "up"/"right" on screen under
// this angled view, not raw world axes (see CAMERA_FORWARD/CAMERA_RIGHT there).
export const OFFSET = new THREE.Vector3(18, 16, 18);

// Desktop-tuned orthographic zoom. A phone screen is a third of the width, so at the same zoom
// only ~3.5 world units fit across a portrait screen — the character fills the view and
// monsters are on top of you before they're visible. Scale the zoom down with the screen
// width (never up), with a floor so nothing shrinks to specks.
const BASE_ZOOM = 110;
const FULL_ZOOM_WIDTH = 1100;
const MIN_ZOOM_SCALE = 0.5;

export function cameraZoomFor(viewportWidth: number): number {
  const scale = Math.min(1, Math.max(MIN_ZOOM_SCALE, viewportWidth / FULL_ZOOM_WIDTH));
  return BASE_ZOOM * scale;
}

export function CameraRig() {
  const viewportWidth = useThree((s) => s.size.width);
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const lookTarget = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((_, delta) => {
    const cam = camRef.current;
    if (!cam) return;
    const followSpeed = Math.min(1, delta * 4);
    const desiredPos = new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z).add(OFFSET);
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
      zoom={cameraZoomFor(viewportWidth)}
      near={0.1}
      far={200}
    />
  );
}
