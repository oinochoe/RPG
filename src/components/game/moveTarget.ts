import * as THREE from 'three';

/** Mutated by ground/monster clicks, read every frame by CharacterMesh. Same
 * out-of-React-state pattern as playerTransform, for the same reason. */
interface MoveTargetState {
  point: THREE.Vector3 | null;
  attackTargetId: number | null;
}

export const moveTarget: MoveTargetState = { point: null, attackTargetId: null };

export function setMoveTarget(x: number, z: number): void {
  moveTarget.point = new THREE.Vector3(x, 0, z);
  moveTarget.attackTargetId = null;
}

export function setAttackMoveTarget(x: number, z: number, instanceId: number): void {
  moveTarget.point = new THREE.Vector3(x, 0, z);
  moveTarget.attackTargetId = instanceId;
}

export function setAttackTargetOnly(instanceId: number): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = instanceId;
}

export function clearMoveTarget(): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = null;
}
