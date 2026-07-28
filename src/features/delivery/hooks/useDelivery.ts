import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deliveryRepository } from '@/shared/services/firestore/deliveryRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import type { Order } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';
import {
  notifyOrderOutForDelivery,
  notifyOrderDelivered,
  notifyDeliveryFailed,
} from '@/shared/services/firestore/notificationService';

export function useUnassignedOrders(date: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.delivery.unassignedOrders(date);

  useEffect(() => {
    if (!date) return;
    const unsub = deliveryRepository.subscribeUnassignedOrders(
      date,
      (data) => queryClient.setQueryData(queryKey, data)
    );
    return () => unsub();
  }, [date, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => deliveryRepository.getUnassignedOrders(date),
    enabled: !!date,
    staleTime: Infinity,
  });
}

export function useAssignedOrders(date: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.delivery.assignedOrders(date);

  useEffect(() => {
    if (!date) return;
    const unsub = deliveryRepository.subscribeAssignedOrders(
      date,
      (data) => queryClient.setQueryData(queryKey, data)
    );
    return () => unsub();
  }, [date, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => deliveryRepository.getAssignedOrders(date),
    enabled: !!date,
    staleTime: Infinity,
  });
}

export function useDeliveryPartnerOrders(partnerId: string, date: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!partnerId || !date) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = deliveryRepository.subscribePartnerOrders(
      partnerId,
      date,
      (data) => {
        setOrders(data);
        setIsLoading(false);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [partnerId, date]);

  return { orders, isLoading, error };
}

export function useAssignDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, partnerId }: { orderIds: string[]; partnerId: string }) => {
      await deliveryRepository.assignOrders(orderIds, partnerId);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('order_assigned', user.uid, user.displayName || 'Staff', orderIds.join(','), 'order', { partnerId });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base }); // because orders were updated
      toast.success('Orders assigned successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to assign orders');
    },
  });
}

export function useReassignDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, partnerId }: { orderId: string; partnerId: string | null }) => {
      await deliveryRepository.reassignOrder(orderId, partnerId);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          partnerId ? 'order_reassigned' : 'order_unassigned',
          user.uid,
          user.displayName || 'Staff',
          orderId,
          'order',
          { partnerId }
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
      toast.success('Order reassigned successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to reassign order');
    },
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: string }) => {
      await deliveryRepository.updateDeliveryStatus(orderId, newStatus);

      // Send customer notification — fire-and-forget (never block the status update).
      // Resolve order from cache first; fall back to a single Firestore read.
      const resolveOrder = async (): Promise<Order | null> => {
        // Try to find the order in any kitchen query cache entry
        const cached = queryClient.getQueriesData<Order[]>({ queryKey: queryKeys.kitchen.base })
          .flatMap(([, data]) => data ?? [])
          .find(o => o.id === orderId);
        if (cached) return cached;
        // Fall back to Firestore
        return orderRepository.getById(orderId).catch(() => null);
      };

      resolveOrder()
        .then((order) => {
          if (!order) return;
          const mealType = order.mealType ?? 'meal';
          if (newStatus === 'out_for_delivery') {
            return notifyOrderOutForDelivery(order.customerId, orderId, mealType);
          } else if (newStatus === 'delivered') {
            return notifyOrderDelivered(order.customerId, orderId, mealType);
          } else if (newStatus === 'failed_delivery') {
            return notifyDeliveryFailed(order.customerId, orderId, mealType);
          }
        })
        .catch((err) => console.error('[useUpdateDeliveryStatus] notification failed:', err));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
      toast.success('Status updated successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update status');
    },
  });
}
