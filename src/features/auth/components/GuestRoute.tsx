import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLE_HOME_ROUTE } from '@/shared/constants/roles';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useAuth } from '../hooks/useAuth';

export function GuestRoute() {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'authenticated' && role) {
    const from = (location.state as any)?.from?.pathname || ROLE_HOME_ROUTE[role];
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
