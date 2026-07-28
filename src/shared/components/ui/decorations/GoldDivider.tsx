import { type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface GoldDividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function GoldDivider({ orientation = 'horizontal', className, ...props }: GoldDividerProps) {
  return (
    <div
      className={cn(
        'bg-gradient-to-r from-transparent via-gold to-transparent opacity-50',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full bg-gradient-to-b',
        className
      )}
      {...props}
    />
  );
}
