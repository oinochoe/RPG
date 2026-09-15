import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-gold/30 bg-black/25 px-3 text-sm text-ink placeholder:text-gold-dim',
        'outline-none focus:border-gold focus:ring-2 focus:ring-gold/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
