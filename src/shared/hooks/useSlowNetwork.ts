import { useState, useEffect, useRef } from 'react';

/**
 * Returns `true` when a loading operation has been in-flight longer than
 * `thresholdMs` (default 4 000 ms). Resets automatically when `isLoading`
 * drops back to `false`.
 *
 * Usage:
 * ```tsx
 * const isSlow = useSlowNetwork(isFetching);
 * {isSlow && <SlowNetwork />}
 * ```
 */
export function useSlowNetwork(isLoading: boolean, thresholdMs = 4000): boolean {
  const [isSlow, setIsSlow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => setIsSlow(true), thresholdMs);
    } else {
      setIsSlow(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, thresholdMs]);

  return isSlow;
}
