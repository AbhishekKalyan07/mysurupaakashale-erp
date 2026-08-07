import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { dailyProductionRepository, type DailyProductionState } from '@/shared/services/firestore/dailyProductionRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getTodayIST } from './useKitchenDashboard';
import type { Order, OrderStatus } from '@/shared/types';
import { useReferenceData } from '@/shared/hooks/useReferenceData';
import { serverTimestamp } from 'firebase/firestore';

export { getTodayIST };

export type KitchenWorkflowStatus = Extract<
  OrderStatus,
  'scheduled' | 'preparing' | 'ready_for_pickup'
>;

export function useProductionBoard() {
  const date = getTodayIST();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.kitchen.dayOrders(date);
  const { firebaseUser, role, profile } = useAuth();

  // 1. Single realtime listener for today's orders
  useEffect(() => {
    const unsubscribe = orderRepository.subscribeToDayOrders(
      date,
      (orders) => queryClient.setQueryData(queryKey, orders),
      (err) => console.error(`[useProductionBoard] orders onSnapshot error:`, err)
    );
    return unsubscribe;
  }, [date, queryClient, queryKey]);

  const { data: orders = [], isLoading: isOrdersLoading } = useQuery<Order[]>({
    queryKey,
    queryFn: () => orderRepository.getByDate(date),
    staleTime: 0,
  });

  // 2. Fetch Reference Data
  const customerIds = orders.map((o) => o.customerId);
  const { zoneMap, partnerMap, customerMap, isReferenceLoading } = useReferenceData(customerIds);

  // 3. Daily Production State (Realtime)
  const [productionState, setProductionState] = useState<DailyProductionState | null>(null);
  useEffect(() => {
    const unsubscribe = dailyProductionRepository.subscribeToState(date, setProductionState);
    return unsubscribe;
  }, [date]);

  const advanceStatus = async (
    orderId: string,
    newStatus: string
  ): Promise<void> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const oldStatus = order.kitchenStatus || 'Preparing';

    const slaField = `${newStatus.toLowerCase()}At`;
    const updatePayload: any = { 
      kitchenStatus: newStatus,
      [slaField]: serverTimestamp() as unknown as import('@/shared/types').Timestamp,
      updatedAt: serverTimestamp() as unknown as import('@/shared/types').Timestamp
    };

    if (newStatus === 'Ready') {
      updatePayload.status = 'ready_for_pickup';
    }

    await orderRepository.update(orderId, updatePayload);

    if (newStatus === 'Ready' && order.deliveryPartnerId) {
      import('@/shared/services/firestore/notificationService').then(m => {
        m.notifyReadyForPickup(order.deliveryPartnerId!, orderId, order.mealType || 'meal').catch(console.error);
      }).catch(console.error);
    }

    if (firebaseUser) {
      await auditRepository.logAction(
        'advanced_order_status',
        firebaseUser.uid,
        profile?.fullName || firebaseUser.email || 'Unknown User',
        orderId,
        'order',
        { from: oldStatus, to: newStatus }
      );
      
      if (newStatus === 'Packed') {
        await auditRepository.logAction(
          'production_packed',
          firebaseUser.uid,
          profile?.role || 'kitchen',
          orderId,
          'order'
        );
      }
    }
  };

  return {
    orders,
    zoneMap,
    partnerMap,
    customerMap,
    isLoading: isOrdersLoading || isReferenceLoading || !productionState,
    advanceStatus,
    productionState,
    role,
    user: firebaseUser,
    profile,
  };
}
