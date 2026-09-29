import { useCombatStore } from '../../stores/combatStore';
import { StatusEffectIcon, formatRemaining, useTimedEffect } from './StatusEffectIcon';

/** Sibling of PoisonIndicator for 버섯 군주's own spore-cloud slow (see combatStore's
 * SLOW_MOVE_SPEED_MULTIPLIER). Sits one slot further right (left: 120) so haste/poison/slow can
 * all be visible at once without overlapping. */
export function SlowIndicator() {
  const slowUntil = useCombatStore((s) => s.player.slowUntil);
  const slowStartedAt = useCombatStore((s) => s.player.slowStartedAt);
  const { remainingMs, sweepDeg } = useTimedEffect(slowUntil, slowStartedAt);

  if (remainingMs <= 0) return null;

  return (
    <StatusEffectIcon left={120} tone="debuff" sweepDeg={sweepDeg} label={formatRemaining(remainingMs)}>
      🐌
    </StatusEffectIcon>
  );
}
