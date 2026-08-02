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
import { serverTimestamp, Timestamp } from 'firebase/firestore';

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

  // 4. Status advancement with Audit Log
  const advanceStatus = async (
    orderId: string,
    newStatus: KitchenWorkflowStatus
  ): Promise<void> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const oldStatus = order.status;

    await orderRepository.update(orderId, { 
      status: newStatus,
      updatedAt: serverTimestamp() as unknown as Timestamp
    });

    if (firebaseUser) {
      await auditRepository.logAction(
        'advanced_order_status',
        firebaseUser.uid,
        profile?.fullName || firebaseUser.email || 'Unknown User',
        orderId,
        'order',
        { from: oldStatus, to: newStatus }
      );
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
