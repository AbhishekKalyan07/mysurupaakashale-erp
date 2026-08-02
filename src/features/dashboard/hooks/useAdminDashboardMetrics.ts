import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { where, collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { APP_CONFIG } from '@/shared/config/appConfig';
import type { Order } from '@/shared/types';

export interface AdminMetrics {
  totalCustomers: number;
  activeDrivers: number;
  activeSubscriptions: number;
  todayOrders: {
    total: number;
    pending: number;
    preparing: number;
    ready: number;
    outForDelivery: number;
    delivered: number;
    cancelled: number;
    unassigned: number;
    failedDeliveries: number;
  };
  revenueToday: number;
  failedPayments: number;
  openComplaints: number;
  kitchenSLA: number; // percentage ready out of expected
  deliverySLA: number; // percentage delivered out of outForDelivery
  systemStatus: 'healthy' | 'degraded' | 'down';
  firestoreStatus: 'connected' | 'offline';
}

export function useAdminDashboardMetrics() {
  const queryClient = useQueryClient();
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { 
    timeZone: APP_CONFIG.timezone 
  }).format(new Date());

  const queryKey = useMemo(() => ['admin', 'dashboard', 'metrics', today], [today]);

  useEffect(() => {
    const updateMetrics = (partial: Partial<AdminMetrics>) => {
      queryClient.setQueryData<AdminMetrics>(queryKey, (old) => {
        if (!old) return {
          totalCustomers: 0,
          activeDrivers: 0,
          activeSubscriptions: 0,
          todayOrders: { total: 0, pending: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, unassigned: 0, failedDeliveries: 0 },
          revenueToday: 0,
          failedPayments: 0,
          openComplaints: 0,
          kitchenSLA: 100,
          deliverySLA: 100,
          systemStatus: 'healthy',
          firestoreStatus: 'connected',
          ...partial
        };
        return { ...old, ...partial };
      });
    };

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', ['customer', 'delivery'])),
      (snap) => {
        let customers = 0;
        let drivers = 0;
        snap.forEach(doc => {
          if (doc.data().role === 'customer') customers++;
          if (doc.data().role === 'delivery') drivers++;
        });
        updateMetrics({ totalCustomers: customers, activeDrivers: drivers });
      }
    );

    const unsubSubs = onSnapshot(
      query(collection(db, 'subscriptions'), where('status', '==', 'active')),
      (snap) => updateMetrics({ activeSubscriptions: snap.size })
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('date', '==', today)),
      (snap) => {
        let pending = 0, preparing = 0, ready = 0, outForDelivery = 0;
        let delivered = 0, cancelled = 0, unassigned = 0, failedDeliveries = 0;
        let revenue = 0;

        snap.forEach(doc => {
          const data = doc.data() as Order;
          if (data.status === 'pending') pending++;
          if (data.status === 'preparing') preparing++;
          if (data.status === 'ready_for_pickup') ready++;
          if (data.status === 'out_for_delivery') outForDelivery++;
          if (data.status === 'delivered') delivered++;
          if (data.status === 'cancelled') cancelled++;
          if (data.status === 'failed_delivery') failedDeliveries++;
          
          if (!data.deliveryPartnerId && data.status !== 'cancelled' && data.status !== 'delivered' && data.status !== 'failed_delivery' && data.status !== 'skipped') {
            unassigned++;
          }

          if (data.status === 'delivered') {
             revenue += data.price || 0;
          }
        });
        
        const totalKitchenExpected = pending + preparing + ready + outForDelivery + delivered;
        const kitchenSLA = totalKitchenExpected === 0 ? 100 : Math.round(((ready + outForDelivery + delivered) / totalKitchenExpected) * 100);
        
        const totalDeliveryExpected = outForDelivery + delivered + failedDeliveries;
        const deliverySLA = totalDeliveryExpected === 0 ? 100 : Math.round((delivered / totalDeliveryExpected) * 100);

        updateMetrics({ 
          todayOrders: { total: snap.size, pending, preparing, ready, outForDelivery, delivered, cancelled, unassigned, failedDeliveries },
          revenueToday: revenue,
          kitchenSLA,
          deliverySLA
        });
      },
      (error) => {
        // If offline or permission denied
        updateMetrics({ firestoreStatus: 'offline', systemStatus: 'degraded' });
      }
    );

    const unsubFeedback = onSnapshot(
      query(collection(db, 'feedback'), where('status', 'in', ['new', 'investigating'])),
      (snap) => updateMetrics({ openComplaints: snap.size })
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('status', '==', 'failed')),
      (snap) => {
        // Approximate failed payments for today/recent based on size (simplified)
        updateMetrics({ failedPayments: snap.size });
      }
    );

    return () => {
      unsubUsers();
      unsubSubs();
      unsubOrders();
      unsubFeedback();
      unsubPayments();
    };
  }, [queryClient, today, queryKey]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<AdminMetrics> => ({
      totalCustomers: 0,
      activeDrivers: 0,
      activeSubscriptions: 0,
      todayOrders: { total: 0, pending: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, unassigned: 0, failedDeliveries: 0 },
      revenueToday: 0,
      failedPayments: 0,
      openComplaints: 0,
      kitchenSLA: 100,
      deliverySLA: 100,
      systemStatus: 'healthy',
      firestoreStatus: 'connected',
    }),
    staleTime: Infinity,
  });
}
