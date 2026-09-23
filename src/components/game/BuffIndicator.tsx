import { useEffect, useState } from 'react';
import { useCombatStore } from '../../stores/combatStore';
import { ItemIcon } from './itemIcons';

// Smooth enough for a depletion ring to read as continuous motion without re-rendering every
// frame for something this cheap to compute.
const TICK_MS = 200;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec >= 60) return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
  return `${totalSec}`;
}

/** Top-left buff tracker — currently just 초록 물약/강화 초록 물약's haste buff (real user
 * feedback: "버프 받으면 버프 표시해줘야되는데.. 얼마나 버프 되는지 ... 모래시계처럼"), but
 * reads generically off combatStore's player state so a second buff later just adds another
 * icon here rather than a whole new component. */
export function BuffIndicator() {
  const hasteUntil = useCombatStore((s) => s.player.hasteUntil);
  const hasteStartedAt = useCombatStore((s) => s.player.hasteStartedAt);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (performance.now() >= hasteUntil) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [hasteUntil]);

  const remainingMs = hasteUntil - now;
  if (remainingMs <= 0) return null;

  const totalMs = Math.max(1, hasteUntil - hasteStartedAt);
  const elapsedRatio = Math.min(1, Math.max(0, (now - hasteStartedAt) / totalMs));
  const sweepDeg = elapsedRatio * 360;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
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
          border: '1px solid rgba(93, 220, 90, 0.6)',
          background: 'rgba(15, 17, 13, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <ItemIcon itemName="초록 물약" size={30} />
        {/* Depletion sweep, hourglass-style — an opaque wedge that grows clockwise from
            nothing (buff just applied) to covering the whole icon (buff about to expire). */}
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
          color: '#9be86f',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {formatRemaining(remainingMs)}
      </span>
    </div>
  );
}
