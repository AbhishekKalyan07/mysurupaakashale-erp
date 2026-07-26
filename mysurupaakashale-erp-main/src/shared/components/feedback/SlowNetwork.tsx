import { Wifi, X, RefreshCcw } from 'lucide-react';
import { LeafSpinner } from '../ui/LeafSpinner';
import type { NetworkState } from '@/shared/hooks/useSlowNetwork';
import { useState, useEffect } from 'react';

export interface SlowNetworkProps {
  state: NetworkState;
  onRetry?: () => void;
}

/**
 * Subtle top-of-page banner shown when loading has exceeded the slow-network
 * threshold. If the network becomes "stalled" (>15s), it prompts the user with
 * options to Retry, Cancel (hide warning), or continue waiting.
 */
export function SlowNetwork({ state, onRetry }: SlowNetworkProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Auto-reset dismissal if state becomes fast again
  useEffect(() => {
    if (state === 'fast') setIsDismissed(false);
  }, [state]);

  if (state === 'fast' || isDismissed) return null;

  const isStalled = state === 'stalled';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2.5 bg-warning-subtle border-b border-warning/30 px-4 py-2.5 text-sm font-sans text-ink-700 shadow-sm transition-all"
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <LeafSpinner size={14} className="text-warning shrink-0" />
        <Wifi size={14} className="text-warning shrink-0" />
        <span className="truncate">
          <strong className="font-semibold">
            {isStalled ? 'Still loading...' : 'Slow connection detected.'}
          </strong>{' '}
          {isStalled 
            ? 'This is taking longer than expected.' 
            : 'Loading your data — this may take a moment.'}
        </span>
      </div>
      
      {isStalled && (
        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={() => setIsDismissed(true)}
            className="text-ink-500 hover:text-ink-700 font-medium transition-colors"
          >
            Wait
          </button>
          {onRetry && (
            <button 
              onClick={onRetry}
              className="flex items-center gap-1.5 text-warning-700 hover:text-warning-800 font-medium transition-colors"
            >
              <RefreshCcw size={14} />
              Retry
            </button>
          )}
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-md hover:bg-warning/20 text-ink-500 transition-colors"
            aria-label="Dismiss warning"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
