import { serverTimestamp } from 'firebase/firestore';
import { orderRepository } from '../firestore/orderRepository';
import { notifyOrderDelivered, notifyOrderOutForDelivery, notifyDeliveryFailed } from '../firestore/notificationService';
import type { OrderStatus } from '@/shared/types';

class DeliveryService {
  /**
   * Assign a delivery partner to an order and update its status.
   */
  async assignDelivery(orderId: string, partnerId: string): Promise<void> {
    await orderRepository.update(orderId, {
      deliveryPartnerId: partnerId,
      status: 'out_for_delivery',
      updatedAt: serverTimestamp() as any,
    });
    
    // Add push notification to partner here if necessary
  }

  /**
   * Update the status of a delivery (e.g., delivered, failed).
   */
  async updateDeliveryStatus(orderId: string, customerId: string, status: OrderStatus, mealType: string): Promise<void> {
    await orderRepository.update(orderId, {
      status,
      updatedAt: serverTimestamp() as any,
    });
    
    if (status === 'out_for_delivery') {
      notifyOrderOutForDelivery(customerId, orderId, mealType).catch(console.error);
    } else if (status === 'delivered') {
      notifyOrderDelivered(customerId, orderId, mealType).catch(console.error);
    } else if (status === 'failed_delivery' || status === 'cancelled') {
      notifyDeliveryFailed(customerId, orderId, mealType).catch(console.error);
    }
  }
}

export const deliveryService = new DeliveryService();
