import { useState, useEffect } from 'react';

/**
 * Returns the current online/offline status of the browser.
 * Subscribes to the native `online` / `offline` events and
 * automatically updates. Components using this hook will re-render
 * the moment connectivity changes — no polling required.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
