import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { deliveryRepository } from '@/shared/services/firestore/deliveryRepository';

import { queryKeys } from '@/shared/lib/queryKeys';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';
import { deliveryService } from '@/shared/services/business/deliveryService';

export function useDeliveryBoard(date: string) {
  const queryClient = useQueryClient();
  
  // Reuse the exact same query key as Kitchen Production Board to share a single source of truth and avoid extra reads.
  const queryKey = useMemo(() => queryKeys.kitchen.dayOrders(date), [date]);

  useEffect(() => {
    if (!date) return;
    const unsub = orderRepository.subscribeToDayOrders(
      date,
      undefined,
      (data: Order[]) => queryClient.setQueryData(queryKey, data)
    );
    return () => unsub();
  }, [date, queryClient, queryKey]);

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => orderRepository.getByDate(date),
    enabled: !!date,
    staleTime: Infinity,
  });

  const summary = useMemo(() => deliveryService.getDeliverySummary(allOrders), [allOrders]);

  const assignMutation = useMutation({
    mutationFn: async ({ orderIds, partnerId }: { orderIds: string[]; partnerId: string }) => {
      await deliveryRepository.assignOrders(orderIds, partnerId);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('order_assigned', user.uid, user.displayName || 'Staff', orderIds.join(','), 'order', { partnerId });
      }
    },
    onSuccess: () => {
      toast.success('Orders assigned successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to assign orders');
    },
  });

  const reassignMutation = useMutation({
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
    onSuccess: () => {
      toast.success('Order assignment updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update assignment');
    },
  });

  return {
    allOrders,
    summary,
    isLoading,
    assignMutation,
    reassignMutation,
  };
}
