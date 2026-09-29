import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-control border-[3px] border-edge/60 bg-cream-deep/60 px-3 text-base text-ink placeholder:text-ink-soft/70',
        'outline-none transition-colors focus:border-sky-deep focus:bg-white focus:ring-4 focus:ring-sky/70',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
