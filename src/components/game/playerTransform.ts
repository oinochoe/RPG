import * as THREE from 'three';

/** Mutated every frame by CharacterMesh, read every frame by CameraRig. Avoids routing
 * 60fps position updates through React state/props. */
export const playerPosition = new THREE.Vector3();
