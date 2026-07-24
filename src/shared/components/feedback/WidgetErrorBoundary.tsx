import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { logError, errorInfoToContext } from '@/shared/lib/errorLogger';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called with the caught error instead of the default logger — hook a specific error-tracking service here for one boundary without changing the default for every other. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Custom fallback renderer. Defaults to the built-in friendly screen below. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere in its subtree and shows a friendly
 * fallback instead of an unmounted blank screen.
 * Component-level boundary to prevent one widget from crashing an entire page.
 */
export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  public state: State = {
    hasError: false,
  };


interface DefaultErrorFallbackProps {
  error: Error;
  onRetry: () => void;
}

function DefaultErrorFallback({ error, onRetry }: DefaultErrorFallbackProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-rice-50 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle size={28} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h1 className="font-display text-xl text-ink-900">Something went wrong</h1>
        <p className="text-sm text-ink-500">
          The page hit an unexpected error. Try again — if it keeps happening, going home and starting over usually
          clears it up.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => window.location.assign('/')}>
          <Home size={16} />
          Go home
        </Button>
        <Button onClick={onRetry}>
          <RotateCcw size={16} />
          Try again
        </Button>
      </div>
      {import.meta.env.DEV && (
        <details className="mt-4 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs text-ink-400">Error details (visible in dev only)</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-900 p-3 text-left text-xs text-rice-100">
            {error.stack || error.message}
          </pre>
        </details>
      )}
    </div>
  );
}
