import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, useMemo } from 'react';
import { deliveryRepository } from '@/shared/services/firestore/deliveryRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { dailyDeliveryRepository, type DriverSession } from '@/shared/services/firestore/dailyDeliveryRepository';
import type { Order, OrderStatus } from '@/shared/types';

import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  notifyOrderOutForDelivery,
  notifyOrderDelivered,
  notifyDeliveryFailed,
} from '@/shared/services/firestore/notificationService';
import { deliveryService } from '@/shared/services/business/deliveryService';

export function usePartnerBoard(partnerId: string, date: string, mealType: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [session, setSession] = useState<DriverSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!partnerId || !date || !mealType) {
      setOrders([]);
      setSession(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let ordersUnsub = () => {};
    let sessionUnsub = () => {};

    ordersUnsub = deliveryRepository.subscribePartnerOrders(
      partnerId,
      date,
      mealType,
      (data) => {
        setOrders(data);
        setIsLoading(false);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
      }
    );

    sessionUnsub = dailyDeliveryRepository.subscribeDriverSession(
      date,
      partnerId,
      (data) => setSession(data),
      (err) => console.error(err)
    );

    return () => {
      ordersUnsub();
      sessionUnsub();
    };
  }, [partnerId, date, mealType]);

  const allTerminal = useMemo(() => {
    if (orders.length === 0) return false;
    return orders.every(o => ['delivered', 'failed_delivery', 'returned_delivery'].includes(o.status));
  }, [orders]);

  const updateMutation = useMutation({
    mutationFn: async ({ 
      orderId, 
      newStatus, 
      deliveryResult 
    }: { 
      orderId: string; 
      newStatus: OrderStatus;
      deliveryResult?: { reasonCode: string; notes?: string }
    }) => {
      
      const currentOrder = orders.find(o => o.id === orderId);

      const payload: Partial<Order> = {
        status: newStatus,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      };

      if (newStatus === 'out_for_delivery' && (!currentOrder || !currentOrder.outForDeliveryAt)) {
        payload.outForDeliveryAt = serverTimestamp() as unknown as Timestamp;
      }

      if (newStatus === 'delivered' && (!currentOrder || !currentOrder.deliveredAt)) {
        payload.deliveredAt = serverTimestamp() as unknown as Timestamp;
      }

      if (deliveryResult) {
        payload.deliveryResult = deliveryResult;
      }

      await orderRepository.update(orderId, payload);

      const user = getAuth().currentUser;
      if (user) {
        const actionMap: Record<string, string> = {
          'picked_up': 'delivery_pickup_started',
          'out_for_delivery': 'delivery_out',
          'delivered': 'delivery_completed',
          'failed_delivery': 'delivery_failed',
          'returned_delivery': 'delivery_returned'
        };
        const action = actionMap[newStatus] || 'delivery_status_updated';
        await auditRepository.logAction(action, user.uid, user.displayName || 'Delivery Partner', orderId, 'order', deliveryResult);
      }

      // Automatically update driver session stats
      if (newStatus === 'picked_up') {
                // If it's the first pickup, or just keep updating total Picked Up
        await dailyDeliveryRepository.updateDriverSession(date, partnerId, {
          status: 'picked_up',
          pickup: {
            pickedUpAt: serverTimestamp() as unknown as Timestamp,
            pickedUpBy: partnerId,
            totalOrders: orders.length,
          }
        });
      } else if (newStatus === 'out_for_delivery' && session?.status !== 'in_progress') {
        await dailyDeliveryRepository.updateDriverSession(date, partnerId, {
          status: 'in_progress',
          deliverySession: {
            ...session?.deliverySession,
            startedAt: serverTimestamp() as unknown as Timestamp,
            totalAssigned: orders.length,
            delivered: 0,
            failed: 0,
            returned: 0
          } as any
        });
      }

      // Send notifications fire-and-forget
      const order = await orderRepository.getById(orderId).catch(() => null);
      if (order) {
        const mealType = order.mealType ?? 'meal';
        if (newStatus === 'out_for_delivery') {
          notifyOrderOutForDelivery(order.customerId, orderId, mealType).catch(console.error);
        } else if (newStatus === 'delivered') {
          notifyOrderDelivered(order.customerId, orderId, mealType).catch(console.error);
        } else if (newStatus === 'failed_delivery' || newStatus === 'returned_delivery') {
          notifyDeliveryFailed(order.customerId, orderId, mealType).catch(console.error);
        }
      }
    },
    onSuccess: () => {
      toast.success('Status updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update status');
    },
  });

  const completeRouteMutation = useMutation({
    mutationFn: async () => {
      if (!allTerminal) throw new Error('Not all orders are complete.');
      
      const summary = deliveryService.getDeliverySummary(orders);
      
      await dailyDeliveryRepository.updateDriverSession(date, partnerId, {
        status: 'completed',
        deliverySession: {
          startedAt: session?.deliverySession?.startedAt || null,
          completedAt: serverTimestamp() as unknown as Timestamp,
          totalAssigned: summary.assigned,
          delivered: summary.delivered,
          failed: summary.failed,
          returned: summary.returned
        }
      });

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('delivery_route_completed', user.uid, user.displayName || 'Delivery Partner', partnerId, 'route', {
          delivered: summary.delivered,
          failed: summary.failed,
          returned: summary.returned
        });
      }
    },
    onSuccess: () => {
      toast.success('Route completed successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to complete route');
    }
  });

  return { orders, session, allTerminal, isLoading, error, updateMutation, completeRouteMutation };
}
