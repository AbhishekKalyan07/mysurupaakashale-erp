import { lazy, Suspense } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLES } from '@/shared/constants/roles';
import { Loader2 } from 'lucide-react';

const AdminDashboardPage = lazy(() => import('./AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const CustomerDashboardPage = lazy(() => import('./CustomerDashboardPage').then(m => ({ default: m.CustomerDashboardPage })));
const KitchenDashboardPage = lazy(() => import('./KitchenDashboardPage').then(m => ({ default: m.KitchenDashboardPage })));
const DeliveryPartnerDashboardPage = lazy(() => import('./DeliveryPartnerDashboardPage').then(m => ({ default: m.DeliveryPartnerDashboardPage })));
const AccountsDashboardPage = lazy(() => import('./AccountsDashboardPage').then(m => ({ default: m.AccountsDashboardPage })));

function DashboardFallback() {
  return (
    <div className="flex h-[30vh] items-center justify-center">
      <Loader2 className="animate-spin text-primary/40" size={32} />
    </div>
  );
}

/**
 * Acts as the central hub for all users.
 * Renders role-specific widgets based on the authenticated user's role.
 * Uses lazy loading so users only download the dashboard code they actually need.
 */
export function UnifiedDashboardPage() {
  const { role } = useAuth();

  const renderDashboard = () => {
    switch (role) {
      case ROLES.ADMIN:
        return <AdminDashboardPage />;
      case ROLES.CUSTOMER:
        return <CustomerDashboardPage />;
      case ROLES.KITCHEN:
        return <KitchenDashboardPage />;
      case ROLES.DELIVERY_PARTNER:
        return <DeliveryPartnerDashboardPage />;
      case ROLES.ACCOUNTS:
        return <AccountsDashboardPage />;
      default:
        return (
          <div className="flex h-[50vh] items-center justify-center text-leaf-500">
            <p>Role not recognized or not authorized.</p>
          </div>
        );
    }
  };

  return (
    <Suspense fallback={<DashboardFallback />}>
      {renderDashboard()}
    </Suspense>
  );
}
