import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';

// ── Inline Success Banner ─────────────────────────────────────────────────────
export interface SuccessStateProps {
  title: string;
  description?: string;
  /** Optional action (e.g. "View", "Download") */
  action?: ReactNode;
  className?: string;
}

/**
 * Inline success feedback — use after a form save, export, approval, etc.
 * For transient toast notifications, continue using `react-hot-toast` directly.
 */
export function SuccessState({ title, description, action, className }: SuccessStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-xl border border-success/30 bg-success-subtle px-6 py-10 text-center',
        className,
      )}
      role="status"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <CheckCircle2 size={28} className="text-success" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
        {description && (
          <p className="text-sm text-ink-500 leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ── Success Page (full-page confirmation) ─────────────────────────────────────
export interface SuccessPageProps {
  title: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function SuccessPage({
  title,
  description,
  primaryLabel = 'Continue',
  onPrimary,
  secondaryLabel,
  onSecondary,
}: SuccessPageProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Animated checkmark ring */}
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-success-subtle">
        <CheckCircle2 size={44} className="text-success" strokeWidth={1.5} />
        <span className="absolute inset-0 rounded-full border-2 border-success/30 animate-ping opacity-30" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
        {description && (
          <p className="text-sm text-ink-500 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        {secondaryLabel && onSecondary && (
          <Button variant="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        {onPrimary && (
          <Button onClick={onPrimary}>{primaryLabel}</Button>
        )}
      </div>
    </div>
  );
}
