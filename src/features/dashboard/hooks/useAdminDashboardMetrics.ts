import { useQuery } from '@tanstack/react-query';
import { db } from '@/shared/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { orderRepository } from '@/shared/services/firestore/orderRepository';

export interface AdminMetrics {
  totalCustomers: number;
  activeSubscriptions: number;
  todayOrders: {
    total: number;
    delivered: number;
    pending: number;
  };
}

export function useAdminDashboardMetrics() {
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { 
    timeZone: APP_CONFIG.timezone 
  }).format(new Date());

  return useQuery({
    queryKey: ['admin', 'dashboard', 'metrics', today],
    queryFn: async (): Promise<AdminMetrics> => {
      // 1. Total Customers
      const customersQ = query(collection(db, 'users'), where('role', '==', 'customer'));
      const customersSnap = await getDocs(customersQ);
      const totalCustomers = customersSnap.size;

      // 2. Active Subscriptions
      // We can query subscriptions where status is active
      const activeSubsQ = query(collection(db, 'subscriptions'), where('status', '==', 'active'));
      const activeSubsSnap = await getDocs(activeSubsQ);
      const activeSubscriptions = activeSubsSnap.size;

      // 3. Today's Orders
      const orders = await orderRepository.getByDate(today);
      const totalOrders = orders.length;
      const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
      const pendingOrders = totalOrders - deliveredOrders;

      return {
        totalCustomers,
        activeSubscriptions,
        todayOrders: {
          total: totalOrders,
          delivered: deliveredOrders,
          pending: pendingOrders,
        }
      };
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });
}
