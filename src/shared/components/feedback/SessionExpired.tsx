import { Clock, LogIn } from 'lucide-react';
import { Button } from '../ui/Button';

export interface SessionExpiredProps {
  onLoginAgain?: () => void;
}

/**
 * Shown as a full-page or modal-style overlay when Firebase Auth session
 * has expired. On acknowledgement, redirect to `/login` (or call onLoginAgain).
 * 
 * Wire this up in your auth listener where you detect token expiry.
 */
export function SessionExpired({ onLoginAgain }: SessionExpiredProps) {
  const handleLogin = () => {
    if (onLoginAgain) {
      onLoginAgain();
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-rice-200 p-8 text-center flex flex-col items-center gap-5">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-subtle">
          <Clock size={32} className="text-warning" strokeWidth={1.5} />
        </div>

        <div className="space-y-1.5">
          <h2 id="session-expired-title" className="font-display text-xl font-bold text-ink-900">
            Session Expired
          </h2>
          <p id="session-expired-desc" className="text-sm text-ink-500 leading-relaxed">
            Your session has timed out for security. Please log in again to continue where you left off.
          </p>
        </div>

        <Button onClick={handleLogin} className="w-full gap-2">
          <LogIn size={16} />
          Log In Again
        </Button>
      </div>
    </div>
  );
}
