import { CSSProperties } from 'react';
import { cn } from '../../lib/utils';

export type BarKind = 'hp' | 'mp' | 'xp';

const KIND_COLOR: Record<BarKind, string> = {
  hp: 'var(--color-hp)',
  mp: 'var(--color-mp)',
  xp: 'var(--color-xp)',
};

export interface BarProps {
  /** 0..1 — values outside the range are clamped. */
  ratio: number;
  /** A preset (hp/mp/xp) or any CSS color for one-off bars such as a boss's. */
  kind?: BarKind;
  color?: string;
  label?: string;
  height?: number;
  width?: number | string;
  className?: string;
}

// Status bar: a cream trough with a thick outline, a fill with a glossy highlight stripe, and the
// value centered on top with a cream halo so it stays readable over any fill color.
export function Bar({ ratio, kind = 'hp', color, label, height = 18, width = '100%', className }: BarProps) {
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const fill = color ?? KIND_COLOR[kind];
  const style: CSSProperties = { height, width };
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn(
        'relative overflow-hidden rounded-full border-[3px] border-edge bg-cream-deep shadow-chunk-sm',
        className,
      )}
      style={style}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-out"
        style={{
          width: `${clamped * 100}%`,
          background: `linear-gradient(180deg, rgb(255 255 255 / 0.45) 0%, rgb(255 255 255 / 0) 45%), ${fill}`,
        }}
      />
      {label && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none text-ink"
          style={{ textShadow: '0 0 3px var(--color-cream), 0 0 3px var(--color-cream)' }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
