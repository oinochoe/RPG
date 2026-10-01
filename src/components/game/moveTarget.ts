import { Vec3 } from './playerTransform';
import type { ShopNpcKind } from '../../stores/uiStore';

/** Who a clicked NPC talks as: opens their shop or their quest dialogue. */
export type TalkTarget =
  | { type: 'shop'; kind: ShopNpcKind; villageIndex: number }
  | { type: 'quest'; name: string }
  | { type: 'discovery'; id: string };

/** Mutated by ground/monster clicks, read every frame by CharacterMesh. Same
 * out-of-React-state pattern as playerTransform, for the same reason. */
interface MoveTargetState {
  point: Vec3 | null;
  attackTargetId: number | null;
  // Set when an aimed skill's clicked monster was out of range — walk to the standoff point
  // like a basic-attack move-target, but fire one castSkill on arrival instead of repeated
  // attackNearest calls (see CharacterMesh's useFrame block). The monster to cast on is
  // whatever's already locked as combatStore's targetId (set by the same click), not tracked
  // here — this is just "cast once you arrive." Which skill to cast IS tracked here (a class
  // now has 3), as the skill's id rather than a bare boolean.
  pendingSkillCastId: number | null;
  // Set when a clicked world item drop (see ItemDropMesh's onClick) was out of pickup range —
  // walk to it like the other move-then-act targets, then pick it up once on arrival (see
  // CharacterMesh's useFrame block), the same one-shot-on-arrival shape pendingSkillCastId
  // already has.
  lootTargetId: number | null;
  // Set when a clicked NPC was out of talking range — walk next to them, then open their dialogue
  // once on arrival (see CharacterMesh's useFrame block), the same one-shot shape as lootTargetId.
  talkTarget: TalkTarget | null;
}

export const moveTarget: MoveTargetState = {
  point: null,
  attackTargetId: null,
  pendingSkillCastId: null,
  lootTargetId: null,
  talkTarget: null,
};

export function setMoveTarget(x: number, z: number): void {
  moveTarget.point = new Vec3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = null;
}

export function setAttackMoveTarget(x: number, z: number, instanceId: number): void {
  moveTarget.point = new Vec3(x, 0, z);
  moveTarget.attackTargetId = instanceId;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = null;
}

export function setAttackTargetOnly(instanceId: number): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = instanceId;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = null;
}

export function setSkillMoveTarget(x: number, z: number, skillId: number): void {
  moveTarget.point = new Vec3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = skillId;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = null;
}

export function setLootMoveTarget(x: number, z: number, dropId: number): void {
  moveTarget.point = new Vec3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = dropId;
  moveTarget.talkTarget = null;
}

export function setTalkMoveTarget(x: number, z: number, target: TalkTarget): void {
  moveTarget.point = new Vec3(x, 0, z);
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = target;
}

export function clearMoveTarget(): void {
  moveTarget.point = null;
  moveTarget.attackTargetId = null;
  moveTarget.pendingSkillCastId = null;
  moveTarget.lootTargetId = null;
  moveTarget.talkTarget = null;
}
