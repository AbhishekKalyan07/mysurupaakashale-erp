import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_HOME_ROUTE } from '@/shared/constants/roles';

export function NotFoundPage() {
  const { role } = useAuth();
  const homeTo = role ? ROLE_HOME_ROUTE[role] : '/login';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-rice-50 px-6 text-center">
      <p className="font-display text-5xl text-leaf-700">404</p>
      <h1 className="font-display text-xl text-ink-900">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-500">
        The page you're looking for doesn't exist, or you may not have access to it.
      </p>
      <Link to={homeTo}>
        <Button className="mt-2">Back to safety</Button>
      </Link>
    </div>
  );
}
