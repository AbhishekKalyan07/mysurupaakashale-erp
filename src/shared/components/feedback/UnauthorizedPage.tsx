import { LogIn, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

/**
 * Shown when a user tries to access a protected resource WITHOUT being
 * logged in at all. Different from PermissionDenied (user IS logged in but
 * lacks the required role).
 */
export function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-rice-50 px-6 text-center">
      {/* Icon */}
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-info-subtle">
        <LogIn size={44} className="text-info" strokeWidth={1.5} />
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink-900">
          Authentication Required
        </h1>
        <p className="text-sm text-ink-500 leading-relaxed">
          You need to be logged in to access this page. Please log in to continue.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft size={16} />
          Go Back
        </Button>
        <Button onClick={() => navigate('/login')} className="gap-2">
          <LogIn size={16} />
          Log In
        </Button>
      </div>
    </div>
  );
}
