import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_HOME_ROUTE } from '@/shared/constants/roles';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';

/**
 * `/` never renders content of its own — it just figures out where a
 * visitor belongs. Login/Signup navigate here after success, and it hands
 * off to the right role home once auth state has resolved.
 */
export function RootRedirect() {
  const { status, role } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'unauthenticated' || !role) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={ROLE_HOME_ROUTE[role]} replace />;
}
