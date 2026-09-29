import { forwardRef, HTMLAttributes, KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';
import { rarityColor, type Rarity } from '../../lib/theme';

export interface SlotProps extends HTMLAttributes<HTMLDivElement> {
  /** 1 (common) … 5 (legendary). null/undefined = an empty or unrated slot. */
  rarity?: Rarity | null;
  selected?: boolean;
  equipped?: boolean;
  disabled?: boolean;
  quantity?: number;
  /** Enchant level; shown as "+N" when above 0. */
  enchant?: number;
  size?: number;
}

// An item cell (inventory, hotbar, shop, equipment). `position: relative` on purpose: the tooltip
// hook anchors its bubble to the hovered element and needs a positioned parent.
export const Slot = forwardRef<HTMLDivElement, SlotProps>(
  (
    {
      rarity,
      selected = false,
      equipped = false,
      disabled = false,
      quantity,
      enchant,
      size = 52,
      className,
      style,
      children,
      onClick,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const interactive = !!onClick && !disabled;

    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      onKeyDown?.(e);
      if (interactive && !e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.currentTarget.click();
      }
    }

    return (
      <div
        ref={ref}
        role={onClick ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-disabled={onClick && disabled ? true : undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative box-border flex shrink-0 select-none items-center justify-center rounded-control border-[3px] bg-cream-deep',
          selected ? 'shadow-[0_0_0_3px_var(--color-gold)]' : 'shadow-chunk-sm',
          interactive && 'cursor-pointer transition-transform duration-75 hover:brightness-105 active:translate-y-0.5',
          disabled && 'opacity-45',
          className,
        )}
        style={{
          width: size,
          height: size,
          borderColor: rarity ? rarityColor(rarity) : 'var(--color-edge)',
          ...style,
        }}
        {...props}
      >
        {children}
        {enchant != null && enchant > 0 && (
          <span className="absolute -left-1 -top-1 rounded-full border-2 border-edge bg-gold px-1 text-[10px] font-bold leading-4 text-ink">
            +{enchant}
          </span>
        )}
        {quantity != null && quantity > 1 && (
          <span
            className="absolute bottom-0.5 right-1 text-[11px] font-bold leading-none text-ink"
            style={{ textShadow: '0 0 3px var(--color-cream), 0 0 3px var(--color-cream)' }}
          >
            {quantity}
          </span>
        )}
        {equipped && (
          <span className="absolute -bottom-1 -left-1 rounded-full border-2 border-edge bg-mint-deep px-1 text-[10px] font-bold leading-4 text-ink">
            착용
          </span>
        )}
      </div>
    );
  },
);
Slot.displayName = 'Slot';
