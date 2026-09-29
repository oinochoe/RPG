import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// Chunky cartoon button: a bright top edge fading to the accent color, a thick outline, and a hard
// shadow underneath that "presses in" when tapped. On touch screens every size is at least 44px tall.
export const buttonVariants = cva(
  [
    'inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-control border-[3px] border-edge',
    'font-display tracking-wide text-ink shadow-chunk transition-[transform,box-shadow,filter] duration-75',
    'hover:brightness-105 active:translate-y-[3px] active:shadow-none',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:active:translate-y-0 disabled:active:shadow-chunk',
    'pointer-coarse:min-h-11',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-b from-[#ffd970] to-gold',
        sky: 'bg-gradient-to-b from-[#e6f4ff] to-sky-deep',
        mint: 'bg-gradient-to-b from-[#e3f8ea] to-mint-deep',
        ghost: 'bg-cream/80 hover:bg-cream',
        danger: 'bg-gradient-to-b from-[#e0566f] to-danger text-cream',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        default: 'h-11 px-5 text-base',
        lg: 'h-13 px-7 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
