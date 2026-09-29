import { useEffect, useState, type ReactNode } from 'react';
import { useIsTouch } from '../../lib/device';
import { cn } from '../../lib/utils';
import { TOUCH_TOP_INSET } from './hudLayout';

// Smooth enough for a depletion ring to read as continuous motion without re-rendering every
// frame for something this cheap to compute.
const TICK_MS = 200;

/** Time left and how far the hourglass sweep has gone for a timed effect that lasts until `until`. */
export function useTimedEffect(until: number, startedAt: number): { remainingMs: number; sweepDeg: number } {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (performance.now() >= until) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [until]);

  const remainingMs = until - now;
  const totalMs = Math.max(1, until - startedAt);
  const elapsedRatio = Math.min(1, Math.max(0, (now - startedAt) / totalMs));
  return { remainingMs, sweepDeg: elapsedRatio * 360 };
}

/** "1:05" for a minute or more, plain seconds below that. */
export function formatRemaining(ms: number, withMinutes = false): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (withMinutes && totalSec >= 60) return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
  return `${totalSec}`;
}

/**
 * One buff/debuff tile: an icon in a chunky frame, an hourglass-style sweep that grows clockwise from
 * nothing (effect just applied) to covering the whole icon (about to expire), and the seconds left.
 * `left` is the tile's slot along the top-left row so haste/poison/slow can all show at once.
 */
export function StatusEffectIcon({
  left,
  tone,
  sweepDeg,
  label,
  children,
}: {
  left: number;
  tone: 'buff' | 'debuff';
  sweepDeg: number;
  label: string;
  children: ReactNode;
}) {
  const isTouch = useIsTouch();
  return (
    <div
      style={{
        position: 'fixed',
        top: isTouch ? TOUCH_TOP_INSET : 16,
        left,
        zIndex: 2147483000,
        pointerEvents: 'none',
      }}
      className="flex flex-col items-center gap-0.5"
    >
      <div
        className={cn(
          'relative flex size-11 items-center justify-center overflow-hidden rounded-control border-[3px] bg-cream/95 text-xl shadow-chunk-sm',
          tone === 'buff' ? 'border-mint-deep' : 'border-danger',
        )}
      >
        {children}
        <div
          className="absolute inset-0"
          style={{ background: `conic-gradient(rgb(58 46 42 / 0.55) ${sweepDeg}deg, transparent ${sweepDeg}deg)` }}
        />
      </div>
      <span className="rounded-full border-2 border-edge bg-cream/95 px-1.5 text-[11px] font-bold leading-4 text-ink">
        {label}
      </span>
    </div>
  );
}
