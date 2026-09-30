import { useCombatStore } from '../../stores/combatStore';
import { playerPosition } from './playerTransform';
import { clearMoveTarget, setAttackMoveTarget, setAttackTargetOnly, setSkillMoveTarget } from './moveTarget';

/**
 * Start fighting a monster — what clicking one does, pulled out of MonsterMesh so a touch "attack"
 * button can do exactly the same thing to the nearest monster (tiny monsters are hard to tap on a
 * phone).
 *
 * Locks the target, then either fires an armed skill or starts a basic attack: in range, attack in
 * place; out of range, walk to a standoff point and let the auto-attack connect on arrival.
 */
export function engageMonster(instanceId: number, position: [number, number, number]): void {
  const combat = useCombatStore.getState();
  // The actual combat lock (see resolveTarget in combatStore) — attacks/skills go only to this monster
  // from now on until it dies or another one is engaged, regardless of which one ends up nearest.
  combat.setTarget(instanceId);
  const attackRange = combat.player.attackRange;
  const dx = playerPosition.x - position[0];
  const dz = playerPosition.z - position[2];
  const dist = Math.hypot(dx, dz) || 1;
  const standoff = attackRange * 0.85;
  const inRange = dist <= attackRange;
  const standX = position[0] + (dx / dist) * standoff;
  const standZ = position[2] + (dz / dist) * standoff;

  // Skill aiming armed (see combatStore's armedSkillId/toggleAimSkill) — this IS the target
  // designation Ragnarok-style ability targeting calls for. In range, fire on the spot; out of range,
  // walk to a standoff point first and fire once arrival lands (see CharacterMesh's
  // pendingSkillCastId watcher).
  const armedSkillId = combat.armedSkillId;
  if (armedSkillId !== null) {
    combat.cancelAimSkill();
    if (inRange) {
      // Firing on the spot supersedes any walk-to-attack still in flight from an earlier engage on a
      // different monster — otherwise the character kept marching toward the old one.
      clearMoveTarget();
      combat.requestCastSkill(armedSkillId);
    } else {
      setSkillMoveTarget(standX, standZ, armedSkillId);
    }
    return;
  }

  // setAttackTargetOnly/setAttackMoveTarget are movement-only: they just walk the player to (or stop
  // them at) a range where the lock set above can connect.
  if (inRange) {
    // Already in range (common for ranged classes) — attack in place instead of walking to a
    // standoff point, which could otherwise mean stepping backward.
    setAttackTargetOnly(instanceId);
    return;
  }
  setAttackMoveTarget(standX, standZ, instanceId);
}

export interface NearbyMonster {
  id: number;
  name: string;
  position: [number, number, number];
  distance: number;
}

/** The closest living monster within `maxDistance` world units of the player, or null. */
export function nearestMonster(maxDistance = 12): NearbyMonster | null {
  const monsters = useCombatStore.getState().monsters;
  let best: NearbyMonster | null = null;
  for (const m of Object.values(monsters)) {
    if (!m.alive) continue;
    const distance = Math.hypot(m.position[0] - playerPosition.x, m.position[2] - playerPosition.z);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { id: m.instanceId, name: m.name, position: m.position, distance };
  }
  return best;
}

/** Engage the nearest monster (see nearestMonster). Returns whether there was one. */
export function attackNearestMonster(maxDistance = 12): boolean {
  const target = nearestMonster(maxDistance);
  if (!target) return false;
  engageMonster(target.id, target.position);
  return true;
}

/**
 * Touch: tapping a skill slot uses the skill right away — on the monster you are already fighting,
 * or otherwise the nearest one — instead of the desktop two-step "arm the skill, then click a monster"
 * (the second step means precisely tapping a monster that is ~20px wide).
 *
 * The skill is armed first so the usual checks (skill learned, enough MP, off cooldown) still apply;
 * if none are near it stays armed and a second tap either fires it (a monster showed up) or cancels.
 */
export function castSkillOnTouch(skillId: number): void {
  const combat = useCombatStore.getState();
  const wasArmed = combat.armedSkillId === skillId;
  if (!wasArmed) {
    combat.toggleAimSkill(skillId);
    if (useCombatStore.getState().armedSkillId !== skillId) return; // refused: not learned / no MP / cooling down
  }
  const state = useCombatStore.getState();
  const locked = state.targetId !== null ? state.monsters[state.targetId] : undefined;
  const target = locked?.alive ? { id: locked.instanceId, position: locked.position } : nearestMonster();
  if (target) {
    engageMonster(target.id, target.position);
  } else if (wasArmed) {
    // Nothing to aim at on the second tap either — treat it as "never mind".
    state.cancelAimSkill();
  }
}
