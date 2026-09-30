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
