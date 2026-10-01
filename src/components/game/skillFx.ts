// Skill presentation is decoupled from skill rules: CharacterMesh reports "this skill was cast from A
// to B" once, and SkillFxRoot decides what that looks like. Nothing here touches combatStore.

export type Vec3 = [number, number, number];

export interface SkillCastEvent {
  skillId: number;
  /** Caster, at hand/chest height. */
  from: Vec3;
  /** Target, at hit height. */
  to: Vec3;
  aoeRadius?: number;
  /** How long the projectile flies before landing (0 for melee). Impact parts start this late. */
  travelMs: number;
}

const listeners = new Set<(e: SkillCastEvent) => void>();

export function subscribeSkillCast(fn: (e: SkillCastEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitSkillCast(e: SkillCastEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(e);
    } catch (err) {
      // A presentation bug must never stall combat or starve the other listeners.
      console.error('[skillFx] listener failed', err);
    }
  }
}
