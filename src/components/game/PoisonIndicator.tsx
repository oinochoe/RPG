import { useIsTouch } from '../../lib/device';
import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';

// Same cadence/shape as BuffIndicator.tsx — this is that component's debuff mirror for 구울
// 군주's own poison skill (see combatStore's tickPoison/POISON_TICK_MS).
const TICK_MS = 200;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${totalSec}`;
}

/** Sits right next to BuffIndicator (left: 68 vs. its own left: 16) so a buff and a debuff
 * active at the same time read as one row rather than overlapping. No ItemIcon to reuse here
 * (poison isn't a consumable) — a plain skull glyph on a red-tinted box instead. */
export function PoisonIndicator() {
  const isTouch = useIsTouch();
  const poisonUntil = useCombatStore((s) => s.player.poisonUntil);
  const poisonStartedAt = useCombatStore((s) => s.player.poisonStartedAt);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (performance.now() >= poisonUntil) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [poisonUntil]);

  const remainingMs = poisonUntil - now;
  if (remainingMs <= 0) return null;

  const totalMs = Math.max(1, poisonUntil - poisonStartedAt);
  const elapsedRatio = Math.min(1, Math.max(0, (now - poisonStartedAt) / totalMs));
  const sweepDeg = elapsedRatio * 360;

  return (
    <div
      style={{
        position: 'fixed',
        top: isTouch ? 132 : 16,
        left: 68,
        zIndex: 2147483000,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 10,
          border: '1px solid rgba(180, 90, 220, 0.7)',
          background: 'rgba(24, 12, 22, 0.78)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          fontSize: 20,
        }}
      >
        ☠
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `conic-gradient(rgba(10, 11, 8, 0.78) ${sweepDeg}deg, transparent ${sweepDeg}deg)`,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#d68af0',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {formatRemaining(remainingMs)}
      </span>
    </div>
  );
}
