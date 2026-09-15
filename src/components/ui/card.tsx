import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-2xl border border-gold/25 bg-[#152217]/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}
