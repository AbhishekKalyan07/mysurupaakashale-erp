import { cn } from '@/shared/lib/cn';

export interface LeafSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * The app's one signature motion — see frontend design notes in
 * README.md. Color comes from `currentColor`, so it automatically matches
 * whatever text color context it's placed in (e.g. white inside a primary
 * Button, leaf-600 on a plain page). Respects prefers-reduced-motion via
 * the global rule in index.css.
 */
export function LeafSpinner({ size = 24, className, label = 'Loading' }: LeafSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="status"
      aria-label={label}
      className={cn('animate-leaf-sway', className)}
    >
      <path d="M16 3C9 6 4 12 4 19c0 6 5 10 12 10s12-4 12-10c0-7-5-13-12-16z" fill="currentColor" />
      <path
        d="M16 6.5v19"
        stroke="var(--color-turmeric-400)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
