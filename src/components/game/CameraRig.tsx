import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { playerPosition } from './playerTransform';

// Exported so CharacterMesh can derive camera-relative movement directions from the same
// offset — WASD needs to move the character relative to what's "up"/"right" on screen under
// this angled view, not raw world axes (see CAMERA_FORWARD/CAMERA_RIGHT there).
export const OFFSET = new THREE.Vector3(18, 16, 18);

// Orthographic zoom = screen pixels per world unit. Desktop (1100px and wider) is tuned to 110: about
// 10 world units fit across. A phone screen is a third of the width, so at the same zoom only ~3.5
// units fit across a portrait screen — the character fills the view and monsters are on top of you
// before they are visible. The old fix scaled the zoom down with the width but stopped at half, which
// still left just ~7 units across on a 390px phone (the "too narrow" feedback). Now the zoom is
// chosen so a fixed number of world units fit across the screen: 10 on desktop, easing up to 11 on
// phones, so a phone sees at least as much as a desktop. Characters get correspondingly smaller.
const BASE_ZOOM = 110;
const FULL_ZOOM_WIDTH = 1100;
const PHONE_WIDTH = 500;
const DESKTOP_WORLD_WIDTH = 10;
const PHONE_WORLD_WIDTH = 11;
// Below this nothing is legible anyway; keeps a tiny window from shrinking the world to specks.
const MIN_ZOOM = 28;

/** World units that fit across a screen of this width. */
export function visibleWorldWidth(viewportWidth: number): number {
  return viewportWidth / cameraZoomFor(viewportWidth);
}

export function cameraZoomFor(viewportWidth: number): number {
  const t = Math.min(1, Math.max(0, (FULL_ZOOM_WIDTH - viewportWidth) / (FULL_ZOOM_WIDTH - PHONE_WIDTH)));
  const worldWidth = DESKTOP_WORLD_WIDTH + t * (PHONE_WORLD_WIDTH - DESKTOP_WORLD_WIDTH);
  return Math.max(MIN_ZOOM, Math.min(BASE_ZOOM, viewportWidth / worldWidth));
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
