import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
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

export function useCustomerOrderHistory(customerId?: string) {
  return useQuery({
    queryKey: ['orderHistory', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { orderRepository } = await import('@/shared/services/firestore/orderRepository');
      const orders = await orderRepository.getCustomerOrders(customerId);
      return orders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!customerId,
  });
}

export function useCustomerOrderHistoryPaginated(customerId?: string) {
  return useInfiniteQuery({
    queryKey: ['orderHistoryPaginated', customerId],
    queryFn: async ({ pageParam = null }) => {
      if (!customerId) return { orders: [], lastDoc: null };
      const { orderRepository } = await import('@/shared/services/firestore/orderRepository');
      return orderRepository.getCustomerOrdersPaginated(customerId, 20, pageParam as any);
    },
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
    initialPageParam: null,
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
    }: {
      subscriptionId: string;
      date: string;
      mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
      reason: string;
    }) => {
      if (!firebaseUser?.uid) throw new Error('Not authenticated');
      
      // Kitchen Lock: This will throw an error if orders are already being prepared
      await orderService.cancelOrdersForSkipDay(subscriptionId, firebaseUser.uid, date, mealTypes);

      await subscriptionRepository.addSkip(
        subscriptionId,
        date,
        mealTypes,
        reason,
        firebaseUser.uid
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(firebaseUser?.uid || ''),
      });
      await queryClient.invalidateQueries({
        queryKey: ['orderHistory', firebaseUser?.uid],
      });
    },
  });
}

export function useUnskipDay() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      date,
      mealTypes,
    }: {
      subscriptionId: string;
      date: string;
      mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
    }) => {
      if (!firebaseUser?.uid) throw new Error('Not authenticated');

      // 1. Write an audit/queue record FIRST. Setting status='pending' ensures the
      //    trusted daily automation job will securely generate any missing orders.
      //    Creating this first ensures that if subsequent steps fail, the automation
      //    can still pick it up and retry the restoration.
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/shared/lib/firebase');
      // Use a timestamp to prevent ID collisions on repeated requests
      const requestId = `${subscriptionId}_${date}_${[...mealTypes].sort().join('_')}_${Date.now()}`;
      await setDoc(doc(db, 'unskipRequests', requestId), {
        customerId: firebaseUser.uid,
        subscriptionId,
        date,
        mealTypes,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // 2. Remove the skip from the subscription subcollection.
      //    validateSkipWindow() inside removeSkip enforces the meal-specific
      //    cutoff and throws if the window has already closed — this is the
      //    authoritative client-side cutoff check.
      await subscriptionRepository.removeSkip(
        subscriptionId,
        date,
        mealTypes,
        firebaseUser.uid
      );

      // 3. Immediately restore existing cancelled orders.
      //    We pass generateMissing = false because the browser cannot securely
      //    create new source:'subscription' orders. Missing orders will be handled
      //    by the trusted daily automation job.
      await orderService.restoreOrdersForUnskipDay(
        firebaseUser.uid,
        subscriptionId,
        date,
        mealTypes,
        false
      );

      // 4. Log audit event.
      const { auditRepository } = await import('@/shared/services/firestore/auditRepository');
      await auditRepository.logAction('skip_removed', firebaseUser.uid, 'Customer', subscriptionId, 'subscription', {
        date,
        mealTypes,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(firebaseUser?.uid || ''),
      });
      await queryClient.invalidateQueries({
        queryKey: ['orderHistory', firebaseUser?.uid],
      });
      await queryClient.invalidateQueries({
        queryKey: ['subscriptionStats'],
      });
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
      
      const [
        { orderRepository }, 
        { subscriptionRepository }
      ] = await Promise.all([
        import('@/shared/services/firestore/orderRepository'),
        import('@/shared/services/firestore/subscriptionRepository')
      ]);

      const [orders, subscription] = await Promise.all([
        orderRepository.getCustomerOrders(customerId),
        subscriptionRepository.getById(subscriptionId)
      ]);
      
      const { calculateAccruedBill } = await import('@/shared/utils/billing');
      return calculateAccruedBill(orders, subscription as any);
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
        pausedDates: skips.map(s => s.date),
        skips: skips
      };
    },
    enabled: !!subscriptionId && !!customerId,
  });
}
