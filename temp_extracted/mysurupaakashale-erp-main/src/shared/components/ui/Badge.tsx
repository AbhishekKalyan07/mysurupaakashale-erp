import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  neutral: 'bg-rice-200 text-ink-700',
};

/** Deliberately conventional colors (see index.css) — status needs to be read at a glance, not branded. */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium font-data', TONE_CLASSES[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
