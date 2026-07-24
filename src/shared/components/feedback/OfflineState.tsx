import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { useEffect, useState } from 'react';

/**
 * Full-page offline indicator. Renders `children` while online and
 * overlays a blocking offline screen the moment connectivity drops.
 * Automatically recovers and hides itself when the connection returns.
 */
export function OfflineGuard({ children }: { children: React.ReactNode }) {
  const isOnline = useOnlineStatus();
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    // Small delay to avoid flashing on brief connection hiccups
    let timeout: ReturnType<typeof setTimeout>;
    if (!isOnline) {
      timeout = setTimeout(() => setShowOffline(true), 800);
    } else {
      setShowOffline(false);
    }
    return () => clearTimeout(timeout);
  }, [isOnline]);

  return (
    <>
      {children}
      {showOffline && <OfflineState />}
    </>
  );
}

/**
 * Standalone offline page/overlay component.
 */
export function OfflineState() {
  const isOnline = useOnlineStatus();

  const handleRetry = () => {
    if (isOnline) window.location.reload();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-rice-50 px-6 text-center"
    >
      {/* Icon */}
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-rice-200">
          <WifiOff size={44} className="text-ink-400" strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink-900">You're Offline</h1>
        <p className="text-sm text-ink-500 leading-relaxed">
          It looks like you've lost your internet connection. Check your Wi-Fi or mobile data, then try again.
        </p>
      </div>

      {isOnline ? (
        <div className="flex items-center gap-2 text-success text-sm font-medium">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          Connection restored — click retry to continue
        </div>
      ) : (
        <div className="flex items-center gap-2 text-ink-400 text-sm">
          <div className="h-2 w-2 rounded-full bg-ink-300 animate-pulse" />
          Waiting for connection...
        </div>
      )}

      <Button onClick={handleRetry} disabled={!isOnline} className="gap-2">
        <RefreshCw size={16} />
        Retry
      </Button>
    </div>
  );
}
