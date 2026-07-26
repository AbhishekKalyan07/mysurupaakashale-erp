import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns the user before navigating away from a page with unsaved changes.
 *
 * - Shows the native browser `beforeunload` prompt when the tab is closed/refreshed.
 * - Returns a React Router `blocker` object you can pass to `<UnsavedChangesDialog />`
 *   to intercept in-app navigations.
 *
 * Usage:
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
export function useUnsavedChanges(isDirty: boolean) {
  // Native browser guard (tab close / refresh)
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Legacy support
        e.returnValue = '';
      }
    },
    [isDirty],
  );

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  // React Router in-app navigation guard
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return blocker;
}
