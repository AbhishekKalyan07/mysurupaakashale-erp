import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';
import { PremiumButton as Button } from '../ui/PremiumButton';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

/** Errors state plainly what happened and how to recover — never vague, never apologetic in tone. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  onBack,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-danger/20 bg-danger-subtle px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <AlertTriangle size={26} className="text-danger" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
        {description && <p className="text-sm text-ink-500 leading-relaxed">{description}</p>}
      </div>
      {(onRetry || onBack) && (
        <div className="flex gap-3 flex-wrap justify-center mt-1">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft size={14} />
              Go back
            </Button>
          )}
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5">
              <RotateCcw size={14} />
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
