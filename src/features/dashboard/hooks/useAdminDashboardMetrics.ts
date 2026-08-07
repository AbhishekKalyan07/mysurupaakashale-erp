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
    scheduled: number;
    preparing: number;
    ready: number;
    outForDelivery: number;
    delivered: number;
    cancelled: number;
    unassigned: number;
    failedDeliveries: number;
    avgDeliveryTimeMins: number;
  };
  revenueToday: number;
  failedPayments: number;
  openComplaints: number;
  kitchenSLA: number; // percentage ready out of expected
  deliverySLA: number; // percentage delivered out of outForDelivery
  kitchenSLAStats: {
    preparingCount: number;
    packingCount: number;
    packedCount: number;
    readyCount: number;
    avgPrepTimeMins: number;
    avgPackTimeMins: number;
  };
  driverStats: {
    active: number;
    busy: number;
    available: number;
    assignedOrders: number;
    deliveredOrders: number;
    pendingOrders: number;
    avgOrdersPerDriver: number;
    utilizationPercent: number;
  };
  systemStatus: 'healthy' | 'degraded' | 'down';
  firestoreStatus: 'connected' | 'offline';
  generationRuns: import('@/shared/types').OrderGenerationRun[];
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
          todayOrders: { total: 0, scheduled: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, unassigned: 0, failedDeliveries: 0, avgDeliveryTimeMins: 0 },
          revenueToday: 0,
          failedPayments: 0,
          openComplaints: 0,
          kitchenSLA: 100,
          deliverySLA: 100,
          kitchenSLAStats: { preparingCount: 0, packingCount: 0, packedCount: 0, readyCount: 0, avgPrepTimeMins: 0, avgPackTimeMins: 0 },
          driverStats: { active: 0, busy: 0, available: 0, assignedOrders: 0, deliveredOrders: 0, pendingOrders: 0, avgOrdersPerDriver: 0, utilizationPercent: 0 },
          systemStatus: 'healthy',
          firestoreStatus: 'connected',
          generationRuns: [],
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
        let scheduled = 0, preparing = 0, ready = 0, outForDelivery = 0;
        let delivered = 0, cancelled = 0, unassigned = 0, failedDeliveries = 0;
        let revenue = 0;

        let preparingCount = 0, packingCount = 0, packedCount = 0, readyCount = 0;
        let totalPrepMins = 0, prepSamples = 0;
        let totalPackMins = 0, packSamples = 0;
        let totalDeliveryMins = 0, deliverySamples = 0;

        snap.forEach(doc => {
          const data = doc.data() as Order;
          if (data.status === 'scheduled') scheduled++;
          if (data.status === 'preparing') preparing++;
          if (data.status === 'ready_for_pickup') ready++;
          if (data.status === 'out_for_delivery') outForDelivery++;
          if (data.status === 'delivered') delivered++;
          if (data.status === 'cancelled') cancelled++;
          if (data.status === 'failed_delivery') failedDeliveries++;
          
          if (data.kitchenStatus === 'Preparing') preparingCount++;
          if (data.kitchenStatus === 'Packing') packingCount++;
          if (data.kitchenStatus === 'Packed') packedCount++;
          if (data.kitchenStatus === 'Ready') readyCount++;

          if (data.packingAt && data.preparingAt) {
            const prepTime = (data.packingAt.toMillis() - data.preparingAt.toMillis()) / 60000;
            if (prepTime > 0 && prepTime < 300) { totalPrepMins += prepTime; prepSamples++; }
          }
          if (data.readyAt && data.packingAt) {
            const packTime = (data.readyAt.toMillis() - data.packingAt.toMillis()) / 60000;
            if (packTime > 0 && packTime < 300) { totalPackMins += packTime; packSamples++; }
          }
          
          if (data.outForDeliveryAt && (data.deliveredAt || data.updatedAt) && data.status === 'delivered') {
            const endMillis = data.deliveredAt ? data.deliveredAt.toMillis() : data.updatedAt?.toMillis();
            if (endMillis) {
              const delTime = (endMillis - data.outForDeliveryAt.toMillis()) / 60000;
              if (delTime > 0 && delTime < 600) { totalDeliveryMins += delTime; deliverySamples++; }
            }
          }
          
          if (!data.deliveryPartnerId && data.status !== 'cancelled' && data.status !== 'delivered' && data.status !== 'failed_delivery' && data.status !== 'skipped') {
            unassigned++;
          }

          if (data.status === 'delivered') {
             revenue += data.price || 0;
          }
        });
        
        const totalKitchenExpected = scheduled + preparing + ready + outForDelivery + delivered;
        const kitchenSLA = totalKitchenExpected === 0 ? 100 : Math.round(((ready + outForDelivery + delivered) / totalKitchenExpected) * 100);
        
        const totalDeliveryExpected = outForDelivery + delivered + failedDeliveries;
        const deliverySLA = totalDeliveryExpected === 0 ? 100 : Math.round((delivered / totalDeliveryExpected) * 100);

        const avgPrepTimeMins = prepSamples > 0 ? Math.round(totalPrepMins / prepSamples) : 0;
        const avgPackTimeMins = packSamples > 0 ? Math.round(totalPackMins / packSamples) : 0;
        const avgDeliveryTimeMins = deliverySamples > 0 ? Math.round(totalDeliveryMins / deliverySamples) : 0;

        // Calculate Driver Stats
        const driverAssignments = new Map<string, { pending: number; delivered: number; total: number }>();
        
        snap.forEach(doc => {
          const data = doc.data() as Order;
          if (data.deliveryPartnerId && !['cancelled', 'skipped'].includes(data.status)) {
            const current = driverAssignments.get(data.deliveryPartnerId) || { pending: 0, delivered: 0, total: 0 };
            current.total++;
            if (['ready_for_pickup', 'out_for_delivery', 'scheduled', 'preparing'].includes(data.status)) {
              current.pending++;
            }
            if (data.status === 'delivered') {
              current.delivered++;
            }
            driverAssignments.set(data.deliveryPartnerId, current);
          }
        });

        // The overall active drivers are captured in unsubUsers, so we will merge this with previous state
        // For the sake of this scope, busy drivers are those with pending > 0
        const busyDrivers = Array.from(driverAssignments.values()).filter(d => d.pending > 0).length;
        const assignedOrders = Array.from(driverAssignments.values()).reduce((sum, d) => sum + d.total, 0);
        const deliveredOrders = Array.from(driverAssignments.values()).reduce((sum, d) => sum + d.delivered, 0);
        const pendingOrders = Array.from(driverAssignments.values()).reduce((sum, d) => sum + d.pending, 0);

        queryClient.setQueryData<AdminMetrics>(queryKey, (old) => {
          const totalActiveDrivers = old?.activeDrivers || 0;
          const available = Math.max(0, totalActiveDrivers - busyDrivers);
          const avgOrdersPerDriver = totalActiveDrivers > 0 ? Math.round((assignedOrders / totalActiveDrivers) * 10) / 10 : 0;
          const utilizationPercent = totalActiveDrivers > 0 ? Math.round((busyDrivers / totalActiveDrivers) * 100) : 0;

          return {
            ...old!,
            todayOrders: { total: snap.size, scheduled, preparing, ready, outForDelivery, delivered, cancelled, unassigned, failedDeliveries, avgDeliveryTimeMins },
            revenueToday: revenue,
            kitchenSLA,
            deliverySLA,
            kitchenSLAStats: {
              preparingCount, packingCount, packedCount, readyCount, avgPrepTimeMins, avgPackTimeMins
            },
            driverStats: {
              active: totalActiveDrivers,
              busy: busyDrivers,
              available,
              assignedOrders,
              deliveredOrders,
              pendingOrders,
              avgOrdersPerDriver,
              utilizationPercent
            }
          };
        });
      },
      (_error) => {
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

    const unsubRuns = onSnapshot(
      query(collection(db, 'orderGenerationRuns'), where('date', '==', today)),
      (snap) => {
        const runs = snap.docs.map(doc => doc.data() as import('@/shared/types').OrderGenerationRun);
        updateMetrics({ generationRuns: runs });
      }
    );

    return () => {
      unsubUsers();
      unsubSubs();
      unsubOrders();
      unsubFeedback();
      unsubPayments();
      unsubRuns();
    };
  }, [queryClient, today, queryKey]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<AdminMetrics> => ({
      totalCustomers: 0,
      activeDrivers: 0,
      activeSubscriptions: 0,
      todayOrders: { total: 0, scheduled: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, unassigned: 0, failedDeliveries: 0, avgDeliveryTimeMins: 0 },
      revenueToday: 0,
      failedPayments: 0,
      openComplaints: 0,
      kitchenSLA: 100,
      deliverySLA: 100,
      kitchenSLAStats: { preparingCount: 0, packingCount: 0, packedCount: 0, readyCount: 0, avgPrepTimeMins: 0, avgPackTimeMins: 0 },
      driverStats: { active: 0, busy: 0, available: 0, assignedOrders: 0, deliveredOrders: 0, pendingOrders: 0, avgOrdersPerDriver: 0, utilizationPercent: 0 },
      systemStatus: 'degraded',
      firestoreStatus: 'connected',
      generationRuns: [],
    }),
    staleTime: Infinity,
  });
}
