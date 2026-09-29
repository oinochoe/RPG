import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { rarityColor, type Rarity } from '../../lib/theme';

export interface TooltipCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  rarity?: Rarity | null;
  children?: ReactNode;
}

// The info card shown for an item or skill (hover on desktop, long-press on a phone).
export function TooltipCard({ title, rarity, className, children, ...props }: TooltipCardProps) {
  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none w-max max-w-64 rounded-control border-[3px] bg-cream px-3 py-2 text-ink shadow-panel',
        className,
      )}
      style={{ borderColor: rarity ? rarityColor(rarity) : 'var(--color-edge)' }}
      {...props}
    >
      <div className="font-display text-base leading-tight">{title}</div>
      {children && <div className="mt-1 space-y-0.5 text-xs leading-snug text-ink-soft">{children}</div>}
    </div>
  );
}
