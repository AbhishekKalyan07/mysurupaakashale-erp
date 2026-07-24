import { Link } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_HOME_ROUTE } from '@/shared/constants/roles';

export function NotFoundPage() {
  const { role } = useAuth();
  const dashboardTo = role ? ROLE_HOME_ROUTE[role] : '/login';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-rice-50 px-6 text-center">
      {/* Huge 404 display */}
      <div className="relative select-none">
        <p className="font-display text-[10rem] leading-none font-bold text-rice-200 tracking-tighter">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl bg-white border border-rice-200 shadow-card px-6 py-3">
            <p className="font-display text-base font-semibold text-ink-700">Page not found</p>
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="space-y-2 max-w-md">
        <h1 className="font-display text-2xl font-bold text-ink-900">
          Looks like you're lost
        </h1>
        <p className="text-sm text-ink-500 leading-relaxed">
          The page you're looking for doesn't exist, has been moved, or you may not have access to it.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap justify-center">
        <Link to="/">
          <Button variant="secondary" className="gap-2">
            <Home size={16} />
            Go Home
          </Button>
        </Link>
        <Link to={dashboardTo}>
          <Button className="gap-2">
            <LayoutDashboard size={16} />
            Dashboard
          </Button>
        </Link>
      </div>

      {/* Brand mark */}
      <p className="text-xs text-ink-400 font-sans">
        Mysuru Paakashale ERP
      </p>
    </div>
  );
}

