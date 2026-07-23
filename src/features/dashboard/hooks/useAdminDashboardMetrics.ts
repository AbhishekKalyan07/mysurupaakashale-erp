import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { where, collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { APP_CONFIG } from '@/shared/config/appConfig';

export interface AdminMetrics {
  totalCustomers: number;
  activeSubscriptions: number;
  todayOrders: {
    total: number;
    delivered: number;
    pending: number;
  };
  lowStockItems: number;
  openComplaints: number;
}

export function useAdminDashboardMetrics() {
  const queryClient = useQueryClient();
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { 
    timeZone: APP_CONFIG.timezone 
  }).format(new Date());

  const queryKey = ['admin', 'dashboard', 'metrics', today];

  useEffect(() => {
    // Phase 6: Real-Time Synchronization across Dashboards
    // We attach live listeners to the collections instead of polling.
    
    // Create an updater function to merge partial metrics into the query cache
    const updateMetrics = (partial: Partial<AdminMetrics>) => {
      queryClient.setQueryData<AdminMetrics>(queryKey, (old) => {
        if (!old) return {
          totalCustomers: 0,
          activeSubscriptions: 0,
          todayOrders: { total: 0, delivered: 0, pending: 0 },
          lowStockItems: 0,
          openComplaints: 0,
          ...partial
        };
        return { ...old, ...partial };
      });
    };

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'customer')),
      (snap) => updateMetrics({ totalCustomers: snap.size })
    );

    const unsubSubs = onSnapshot(
      query(collection(db, 'subscriptions'), where('status', '==', 'active')),
      (snap) => updateMetrics({ activeSubscriptions: snap.size })
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('date', '==', today)),
      (snap) => {
        const total = snap.size;
        let delivered = 0;
        snap.forEach(doc => { if (doc.data().status === 'delivered') delivered++; });
        updateMetrics({ todayOrders: { total, delivered, pending: total - delivered } });
      }
    );

    const unsubInv = onSnapshot(
      collection(db, 'inventory'),
      (snap) => {
        let low = 0;
        snap.forEach(doc => {
          const d = doc.data();
          if (d.quantity <= (d.lowStockThreshold || 0)) low++;
        });
        updateMetrics({ lowStockItems: low });
      }
    );

    const unsubFeedback = onSnapshot(
      query(collection(db, 'feedback'), where('status', 'in', ['new', 'investigating'])),
      (snap) => updateMetrics({ openComplaints: snap.size })
    );

    return () => {
      unsubUsers();
      unsubSubs();
      unsubOrders();
      unsubInv();
      unsubFeedback();
    };
  }, [queryClient, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery({
    queryKey,
    // Return empty initial state until snapshots fire (usually < 50ms)
    queryFn: async (): Promise<AdminMetrics> => ({
      totalCustomers: 0,
      activeSubscriptions: 0,
      todayOrders: { total: 0, delivered: 0, pending: 0 },
      lowStockItems: 0,
      openComplaints: 0,
    }),
    staleTime: Infinity, // Never stale, governed entirely by onSnapshot
  });
}
