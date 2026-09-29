import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border-2 border-edge/70 px-2 py-0.5 text-xs font-bold leading-none text-ink',
  {
    variants: {
      tone: {
        neutral: 'bg-cream-deep',
        sky: 'bg-sky',
        mint: 'bg-mint',
        gold: 'bg-gold',
        danger: 'bg-danger text-cream',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** A small pill label — level, class, "NEW" and the like. */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
