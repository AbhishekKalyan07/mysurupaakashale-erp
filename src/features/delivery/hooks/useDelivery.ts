import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deliveryRepository } from '@/shared/services/firestore/deliveryRepository';
import type { Order } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';

export function useUnassignedOrders(date: string) {
  return useQuery({
    queryKey: queryKeys.delivery.unassignedOrders(date),
    queryFn: () => deliveryRepository.getUnassignedOrders(date),
    enabled: !!date,
  });
}

export function useAssignedOrders(date: string) {
  return useQuery({
    queryKey: queryKeys.delivery.assignedOrders(date),
    queryFn: () => deliveryRepository.getAssignedOrders(date),
    enabled: !!date,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base }); // because orders were updated
    },
  });
}

export function useReassignDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, partnerId }: { orderId: string; partnerId: string | null }) => {
      await deliveryRepository.reassignOrder(orderId, partnerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: string }) => {
      await deliveryRepository.updateDeliveryStatus(orderId, newStatus);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.delivery.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.base });
    },
  });
}
