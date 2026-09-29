import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/** A cream card with a thick outline — the frame of the auth screens and other page-level boxes. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-panel border-[3px] border-edge bg-cream p-8 text-ink shadow-panel',
        className,
      )}
      {...props}
    />
  );
}
