import { useCombatStore } from '../../stores/combatStore';
import { StatusEffectIcon, formatRemaining, useTimedEffect } from './StatusEffectIcon';

/** Sits right next to BuffIndicator (left: 68 vs. its own left: 16) so a buff and a debuff
 * active at the same time read as one row rather than overlapping. This is that component's
 * debuff mirror for 구울 군주's own poison skill (see combatStore's tickPoison/POISON_TICK_MS).
 * No ItemIcon to reuse here (poison isn't a consumable) — a plain skull glyph instead. */
export function PoisonIndicator() {
  const poisonUntil = useCombatStore((s) => s.player.poisonUntil);
  const poisonStartedAt = useCombatStore((s) => s.player.poisonStartedAt);
  const { remainingMs, sweepDeg } = useTimedEffect(poisonUntil, poisonStartedAt);

  if (remainingMs <= 0) return null;

  return (
    <StatusEffectIcon left={68} tone="debuff" sweepDeg={sweepDeg} label={formatRemaining(remainingMs)}>
      ☠
    </StatusEffectIcon>
  );
}
