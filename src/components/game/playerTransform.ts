import * as THREE from 'three';

/** Mutated every frame by CharacterMesh, read every frame by CameraRig. Avoids routing
 * 60fps position updates through React state/props. */
export const playerPosition = new THREE.Vector3();

/** Same pattern, for the character's current facing angle (radians, atan2(dx,dz) convention
 * — see CharacterMesh's own `facing` ref) — WorldMap.tsx polls this to point the minimap's
 * player marker in the direction the character is actually facing, not just its position. */
export const playerFacing = { radians: 0 };
