import { useState, useEffect, useRef } from 'react';

export type NetworkState = 'fast' | 'slow' | 'stalled';

/**
 * Returns the current network state based on loading duration:
 * - 'fast': < 4s
 * - 'slow': > 4s
 * - 'stalled': > 15s
 * Resets automatically when `isLoading` drops back to `false`.
 */
export function useSlowNetwork(isLoading: boolean, slowThreshold = 4000, stalledThreshold = 15000): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>('fast');
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      slowTimerRef.current = setTimeout(() => setNetworkState('slow'), slowThreshold);
      stalledTimerRef.current = setTimeout(() => setNetworkState('stalled'), stalledThreshold);
    } else {
      setNetworkState('fast');
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (stalledTimerRef.current) clearTimeout(stalledTimerRef.current);
    }

    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (stalledTimerRef.current) clearTimeout(stalledTimerRef.current);
    };
  }, [isLoading, slowThreshold, stalledThreshold]);

  return networkState;
}
