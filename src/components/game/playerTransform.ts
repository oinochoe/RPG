import * as THREE from 'three';

/** Mutated every frame by CharacterMesh, read every frame by CameraRig. Avoids routing
 * 60fps position updates through React state/props. */
export const playerPosition = new THREE.Vector3();

/** Same pattern, for the character's current facing angle (radians, atan2(dx,dz) convention
 * — see CharacterMesh's own `facing` ref) — WorldMap.tsx polls this to point the minimap's
 * player marker in the direction the character is actually facing, not just its position. */
export const playerFacing = { radians: 0 };

/** Set by CharacterMesh's own stuck-detection heuristic (sustained movement intent with near-
 * zero actual displacement — see its STUCK_THRESHOLD_MS), cleared once the player actually
 * moves again or successfully uses the unstuck escape. SystemMenu polls this to gate its
 * emergency-teleport button so it can't be used as a free village-return outside that case
 * (there's already an item — 마을 귀환 주문서 — for that). */
export const playerStuck = { value: false };
