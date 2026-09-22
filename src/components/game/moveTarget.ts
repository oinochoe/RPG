import * as THREE from 'three';

/** Mutated by ground/monster clicks, read every frame by CharacterMesh. Same
 * out-of-React-state pattern as playerTransform, for the same reason. */
interface MoveTargetState {
  point: THREE.Vector3 | null;
  attackTargetId: number | null;
  // Set when an aimed skill's clicked monster was out of range — walk to the standoff point
  // like a basic-attack move-target, but fire one castSkill on arrival instead of repeated
  // attackNearest calls (see CharacterMesh's useFrame block). The monster to cast on is
  // whatever's already locked as combatStore's targetId (set by the same click), not tracked
  // here — this is just "cast once you arrive." Which skill to cast IS tracked here (a class
  // now has 3), as the skill's id rather than a bare boolean.
  pendingSkillCastId: number | null;
}

export const moveTarget: MoveTargetState = { point: null, attackTargetId: null, pendingSkillCastId: null };

export function setMoveTarget(x: number, z: number): void {
  moveTarget.point = new THREE.Vector3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
}

export function setAttackMoveTarget(x: number, z: number, instanceId: number): void {
  moveTarget.point = new THREE.Vector3(x, 0, z);
  moveTarget.attackTargetId = instanceId;
  moveTarget.pendingSkillCastId = null;
}

export function setAttackTargetOnly(instanceId: number): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = instanceId;
  moveTarget.pendingSkillCastId = null;
}

export function setSkillMoveTarget(x: number, z: number, skillId: number): void {
  moveTarget.point = new THREE.Vector3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = skillId;
}

export function clearMoveTarget(): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
}
