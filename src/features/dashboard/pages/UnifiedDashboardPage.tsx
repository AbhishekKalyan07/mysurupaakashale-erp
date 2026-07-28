import { useAuth } from '@/features/auth/hooks/useAuth';
import { ROLES } from '@/shared/constants/roles';
import { AdminDashboardPage } from './AdminDashboardPage';
import { CustomerDashboardPage } from './CustomerDashboardPage';
import { KitchenDashboardPage } from './KitchenDashboardPage';
import { DeliveryDashboardPage } from '@/features/delivery/pages/DeliveryDashboardPage';
import { AccountsDashboardPage } from './AccountsDashboardPage';
import { useAutomatedDailyOrders } from '../hooks/useAutomatedDailyOrders';

/**
 * Acts as the central hub for all users.
 * Renders role-specific widgets based on the authenticated user's role.
 */
export function UnifiedDashboardPage() {
  const { role } = useAuth();
  
  // Triggers daily order generation invisibly in the background if it hasn't run today
  useAutomatedDailyOrders();

  switch (role) {
    case ROLES.ADMIN:
      return <AdminDashboardPage />;
    case ROLES.CUSTOMER:
      return <CustomerDashboardPage />;
    case ROLES.KITCHEN:
      return <KitchenDashboardPage />;
    case ROLES.DELIVERY_PARTNER:
      return <DeliveryDashboardPage />;
    case ROLES.ACCOUNTS:
      return <AccountsDashboardPage />;
    default:
      return (
        <div className="flex h-[50vh] items-center justify-center text-leaf-500">
          <p>Role not recognized or not authorized.</p>
        </div>
      );
  }
}
