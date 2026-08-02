import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/shared/lib/queryKeys';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';

export function useMySubscription() {
  const { firebaseUser } = useAuth();
  const customerId = firebaseUser?.uid;

  return useQuery({
    queryKey: queryKeys.subscriptions.active(customerId || ''),
    queryFn: async () => {
      if (!customerId) return null;
      return subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
    },
    enabled: !!customerId,
  });
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
