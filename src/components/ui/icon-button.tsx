import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Icon buttons have no visible text, so the accessible name is required. */
  label: string;
  /** Highlights the button (e.g. the panel it toggles is open). */
  active?: boolean;
  size?: 'sm' | 'md';
}

// A rounded square that holds one icon. `md` is 44px — the minimum comfortable touch target.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, active = false, size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-control border-[3px] border-edge text-ink',
        'shadow-chunk-sm transition-[transform,box-shadow,filter] duration-75 hover:brightness-105 active:translate-y-0.5 active:shadow-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'bg-gradient-to-b from-sky-light to-sky-deep' : 'bg-gradient-to-b from-cream to-cream-deep',
        size === 'md' ? 'size-11' : 'size-9 pointer-coarse:size-11',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
