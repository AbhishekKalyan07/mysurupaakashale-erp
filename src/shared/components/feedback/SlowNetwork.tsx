import { Wifi } from 'lucide-react';
import { LeafSpinner } from '../ui/LeafSpinner';

/**
 * Subtle top-of-page banner shown when loading has exceeded the slow-network
 * threshold. Does NOT block the UI — data continues loading in the background.
 * 
 * Pair with the `useSlowNetwork` hook.
 */
export function SlowNetwork() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2.5 bg-warning-subtle border-b border-warning/30 px-4 py-2.5 text-sm font-sans text-ink-700 shadow-sm"
    >
      <LeafSpinner size={14} className="text-warning shrink-0" />
      <Wifi size={14} className="text-warning shrink-0" />
      <span>
        <strong className="font-semibold">Slow connection detected.</strong>{' '}
        Loading your data — this may take a moment.
      </span>
    </div>
  );
}
