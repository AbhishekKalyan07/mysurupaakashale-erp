import { FileWarning, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PremiumButton as Button } from './PremiumButton';

export interface UnsavedChangesDialogProps {
  /** Called when the user decides to stay on the page */
  onStay: () => void;
  /** Called when the user confirms they want to leave */
  onLeave: () => void;
}

/**
 * "Leave this page?" warning dialog — shown when a user navigates away
 * from a page with unsaved form changes.
 *
 * Pair with the `useUnsavedChanges` hook:
 * ```tsx
 * const blocker = useUnsavedChanges(isDirty);
 * {blocker.state === 'blocked' && (
 *   <UnsavedChangesDialog
 *     onStay={() => blocker.reset?.()}
 *     onLeave={() => blocker.proceed?.()}
 *   />
 * )}
 * ```
 */
export function UnsavedChangesDialog({ onStay, onLeave }: UnsavedChangesDialogProps) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onStay]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
      aria-describedby="unsaved-dialog-desc"
      onClick={(e) => { if (e.target === e.currentTarget) onStay(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-rice-200 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-subtle">
              <FileWarning size={18} className="text-warning" />
            </div>
            <h2 id="unsaved-dialog-title" className="font-display text-lg font-bold text-ink-900">
              Leave this page?
            </h2>
          </div>
          <button
            onClick={onStay}
            className="text-ink-500 hover:text-ink-600 p-1 rounded-md transition-colors"
            aria-label="Stay on page"
          >
            <X size={18} />
          </button>
        </div>

        <p id="unsaved-dialog-desc" className="text-sm text-ink-500 leading-relaxed mb-6">
          You have unsaved changes that will be lost if you leave this page. Are you sure you want to continue?
        </p>

        {/* Actions — "Stay" is the safe default, styled as primary */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onLeave}
          >
            Leave anyway
          </Button>
          <Button
            ref={stayRef}
            className="flex-1"
            onClick={onStay}
          >
            Stay on page
          </Button>
        </div>
      </div>
    </div>
  );
}
