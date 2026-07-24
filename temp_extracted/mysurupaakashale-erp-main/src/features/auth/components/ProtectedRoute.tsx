import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLE_HOME_ROUTE, type Role } from '@/shared/constants/roles';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useAuth } from '../hooks/useAuth';

export interface ProtectedRouteProps {
  /** Roles allowed into this route's subtree. Omit to just require "signed in, any role". */
  allowedRoles?: Role[];
}

/**
 * Used as a layout route:
 *   <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]} />}>
 *     <Route path="/admin" element={<AdminDashboardPage />} />
 *   </Route>
 *
 * - Auth state still resolving → a loading screen, never a flash of /login.
 * - Not signed in → redirect to /login, remembering where they were headed.
 * - Signed in but wrong role for this subtree → redirect to their OWN
 *   home, not a bare "403" page — a Delivery Partner hitting /admin should
 *   land somewhere useful, not a dead end.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'unauthenticated' || !role) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME_ROUTE[role]} replace />;
  }

  return <Outlet />;
}
