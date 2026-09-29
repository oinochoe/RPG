import { useIsTouch } from '../../lib/device';
import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';

// Same shape as PoisonIndicator.tsx — this is that component's sibling for 버섯 군주's own
// spore-cloud slow (see combatStore's SLOW_MOVE_SPEED_MULTIPLIER). Sits one slot further
// right (left: 120) so haste/poison/slow can all be visible at once without overlapping.
const TICK_MS = 200;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${totalSec}`;
}

export function SlowIndicator() {
  const isTouch = useIsTouch();
  const slowUntil = useCombatStore((s) => s.player.slowUntil);
  const slowStartedAt = useCombatStore((s) => s.player.slowStartedAt);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (performance.now() >= slowUntil) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [slowUntil]);

  const remainingMs = slowUntil - now;
  if (remainingMs <= 0) return null;

  const totalMs = Math.max(1, slowUntil - slowStartedAt);
  const elapsedRatio = Math.min(1, Math.max(0, (now - slowStartedAt) / totalMs));
  const sweepDeg = elapsedRatio * 360;

  return (
    <div
      style={{
        position: 'fixed',
        top: isTouch ? 132 : 16,
        left: 120,
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
          border: '1px solid rgba(230, 168, 208, 0.7)',
          background: 'rgba(24, 14, 20, 0.78)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          fontSize: 20,
        }}
      >
        🐌
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
          color: '#e6a8d0',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {formatRemaining(remainingMs)}
      </span>
    </div>
  );
}
