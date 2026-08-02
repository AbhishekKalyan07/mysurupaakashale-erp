import { ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumButton as Button } from '../ui/PremiumButton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLE_HOME_ROUTE, type Role } from '@/shared/constants/roles';

export interface PermissionDeniedProps {
  title?: string;
  description?: string;
  currentRole?: Role | string;
  requiredRole?: Role | string;
}

/**
 * Full-page permission denied state — shown when a user is authenticated but
 * does not have the correct role to view a given resource.
 * 
 * Different from UnauthorizedPage (not logged in at all).
 */
export function PermissionDenied({
  title = 'Access Restricted',
  description = "You don't have permission to view this page. If you believe this is a mistake, please contact your administrator.",
  currentRole,
  requiredRole,
}: PermissionDeniedProps) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const homeTo = role ? ROLE_HOME_ROUTE[role] : '/login';
  
  const displayCurrentRole = currentRole || role;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Shield illustration */}
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-danger-subtle">
          <ShieldOff size={44} className="text-danger" strokeWidth={1.5} />
        </div>
        <div className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-danger flex items-center justify-center">
          <span className="text-white text-xs font-bold">!</span>
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
        <p className="text-sm text-ink-500 leading-relaxed">{description}</p>
      </div>

      {(displayCurrentRole || requiredRole) && (
        <div className="flex gap-4 items-center bg-rice-50 border border-rice-200 rounded-lg p-3 text-sm">
          {displayCurrentRole && (
            <div className="flex flex-col text-left">
              <span className="text-ink-500 text-xs uppercase tracking-wider font-semibold">Your Role</span>
              <span className="text-ink-900 font-medium capitalize">{displayCurrentRole}</span>
            </div>
          )}
          {displayCurrentRole && requiredRole && (
            <div className="w-px h-8 bg-rice-200" />
          )}
          {requiredRole && (
            <div className="flex flex-col text-left">
              <span className="text-ink-500 text-xs uppercase tracking-wider font-semibold">Required Role</span>
              <span className="text-ink-900 font-medium capitalize">{requiredRole}</span>
            </div>
          )}
        </div>
      )}

      <Button onClick={() => navigate(homeTo)} className="mt-2">
        Return to Dashboard
      </Button>
    </div>
  );
}
