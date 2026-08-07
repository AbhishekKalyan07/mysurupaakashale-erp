import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/shared/lib/queryKeys';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { orderService } from '@/shared/services/business/orderService';
import type { Subscription } from '@/shared/types';

/**
 * Real-time hook – subscribes to the customer's active subscription via
 * Firestore onSnapshot so the page updates immediately whenever the admin
 * changes anything (e.g. assigns a delivery partner, approves payment, etc.)
 */
export function useMySubscription() {
  const { firebaseUser } = useAuth();
  const customerId = firebaseUser?.uid;

  const [data, setData] = useState<Subscription | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!customerId) {
      setData(null);
      return;
    }

    setData(undefined); // loading
    setError(null);

    const unsub = subscriptionRepository.subscribeActiveSubscription(
      customerId,
      (sub) => setData(sub),
      (err) => setError(err),
    );

    return () => unsub();
  }, [customerId]);

  return {
    data,
    isLoading: data === undefined && !error,
    error,
    // Kept for backward-compat with callers that call refetch()
    refetch: () => Promise.resolve(),
  };
}


export function useHasPastOrders() {
  const { firebaseUser } = useAuth();
  const customerId = firebaseUser?.uid;

  return useQuery({
    queryKey: ['hasPastOrders', customerId],
    queryFn: async () => {
      if (!customerId) return false;
      const { orderRepository } = await import('@/shared/services/firestore/orderRepository');
      const orders = await orderRepository.getCustomerOrders(customerId);
      return orders.length > 0;
    },
    enabled: !!customerId,
  });
}

export function useSkipDay() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      date,
      mealTypes,
      reason,
      creditAmount
    }: {
      subscriptionId: string;
      date: string;
      mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
      reason: string;
      creditAmount: number;
    }) => {
      if (!firebaseUser?.uid) throw new Error('Not authenticated');
      
      // Kitchen Lock: This will throw an error if orders are already being prepared
      await orderService.cancelOrdersForSkipDay(firebaseUser.uid, date, mealTypes);

      await subscriptionRepository.addSkip(
        subscriptionId,
        date,
        mealTypes,
        reason,
        firebaseUser.uid,
        creditAmount
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(firebaseUser?.uid || ''),
      });
      // Also invalidate the skips subcollection if we ever fetch it explicitly
    },
  });
}

export function useSubscriptionAccruedBill(subscriptionId?: string) {
  const { firebaseUser } = useAuth();
  const customerId = firebaseUser?.uid;

  return useQuery({
    queryKey: ['accruedBill', customerId, subscriptionId],
    queryFn: async () => {
      if (!customerId || !subscriptionId) return 0;
      const { orderRepository } = await import('@/shared/services/firestore/orderRepository');
      const orders = await orderRepository.getCustomerOrders(customerId);
      
      // Filter orders for this subscription that are delivered
      const subOrders = orders.filter(
        o => o.subscriptionId === subscriptionId && o.status === 'delivered'
      );
      
      return subOrders.reduce((sum, order) => sum + (order.price || 0), 0);
    },
    enabled: !!customerId && !!subscriptionId,
  });
}

export function useSubscriptionStats(subscriptionId?: string, customerId?: string) {
  return useQuery({
    queryKey: ['subscriptionStats', subscriptionId, customerId],
    queryFn: async () => {
      if (!subscriptionId || !customerId) return { daysOrdered: 0, pausedDates: [] };
      const [{ orderRepository }, { subscriptionRepository }] = await Promise.all([
        import('@/shared/services/firestore/orderRepository'),
        import('@/shared/services/firestore/subscriptionRepository')
      ]);
      
      const [orders, skips] = await Promise.all([
        orderRepository.getCustomerOrders(customerId),
        subscriptionRepository.getSkips(subscriptionId)
      ]);

      const subOrders = orders.filter(o => o.subscriptionId === subscriptionId && o.status === 'delivered');
      const uniqueDaysOrdered = new Set(subOrders.map(o => o.date)).size;

      return {
        daysOrdered: uniqueDaysOrdered,
        pausedDates: skips.map(s => s.date)
      };
    },
    enabled: !!subscriptionId && !!customerId,
  });
}
