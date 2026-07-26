import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import type { OrderWorkflowHistory, OrderStatus } from '@/shared/types';

export function useWorkflowHistory(orderId: string) {
  const [history, setHistory] = useState<OrderWorkflowHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orderId) {
      setHistory([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = orderRepository.subscribeWorkflowHistory(
      orderId,
      (data) => {
        setHistory(data);
        setIsLoading(false);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orderId]);

  return { history, isLoading, error };
}

export function useOrderWorkflow() {
  return useMutation({
    mutationFn: async ({ orderId, newStatus, notes }: { orderId: string; newStatus: OrderStatus; notes?: string }) => {
      await orderRepository.updateWorkflow(orderId, newStatus, notes);
    },
  });
}
