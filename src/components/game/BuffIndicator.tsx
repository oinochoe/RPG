import { useCombatStore } from '../../stores/combatStore';
import { ItemIcon } from './itemIcons';
import { StatusEffectIcon, formatRemaining, useTimedEffect } from './StatusEffectIcon';

/** Top-left buff tracker — currently just 초록 물약/강화 초록 물약's haste buff (real user
 * feedback: "버프 받으면 버프 표시해줘야되는데.. 얼마나 버프 되는지 ... 모래시계처럼"), but
 * reads generically off combatStore's player state so a second buff later just adds another
 * icon here rather than a whole new component. */
export function BuffIndicator() {
  const hasteUntil = useCombatStore((s) => s.player.hasteUntil);
  const hasteStartedAt = useCombatStore((s) => s.player.hasteStartedAt);
  const { remainingMs, sweepDeg } = useTimedEffect(hasteUntil, hasteStartedAt);

  if (remainingMs <= 0) return null;

  return (
    <StatusEffectIcon left={16} tone="buff" sweepDeg={sweepDeg} label={formatRemaining(remainingMs, true)}>
      <ItemIcon itemName="초록 물약" size={30} />
    </StatusEffectIcon>
  );
}
