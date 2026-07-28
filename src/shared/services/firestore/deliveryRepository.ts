import { Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Order } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';
import { where, orderBy, type Unsubscribe } from 'firebase/firestore';
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';

class DeliveryRepository extends BaseRepository<Order> {
  constructor() {
    super(db, 'orders', createConverter<Order>());
  }

  /**
   * Fetch all unassigned orders for a specific date (i.e. deliveryPartnerId is null)
   */
  async getUnassignedOrders(date: string): Promise<Order[]> {
    return this.list(
      where('date', '==', date),
      where('deliveryPartnerId', '==', null),
      orderBy('zoneId', 'asc'),
      orderBy('mealType', 'asc')
    );
  }

  /**
   * Fetch all assigned orders for a specific date (i.e. deliveryPartnerId is not null)
   */
  async getAssignedOrders(date: string): Promise<Order[]> {
    return this.list(
      where('date', '==', date),
      where('deliveryPartnerId', '!=', null),
      orderBy('deliveryPartnerId', 'asc')
    );
  }

  subscribeUnassignedOrders(date: string, onNext: (orders: Order[]) => void, onError?: (error: Error) => void): Unsubscribe {
    return this.subscribeToList(
      onNext,
      onError,
      where('date', '==', date),
      where('deliveryPartnerId', '==', null),
      orderBy('zoneId', 'asc'),
      orderBy('mealType', 'asc')
    );
  }

  subscribeAssignedOrders(date: string, onNext: (orders: Order[]) => void, onError?: (error: Error) => void): Unsubscribe {
    return this.subscribeToList(
      onNext,
      onError,
      where('date', '==', date),
      where('deliveryPartnerId', '!=', null),
      orderBy('deliveryPartnerId', 'asc')
    );
  }

  /**
   * Fetch orders for a specific delivery partner on a specific date.
   */
  async getDeliveryPartnerOrders(partnerId: string, date: string): Promise<Order[]> {
    return this.list(
      where('date', '==', date),
      where('deliveryPartnerId', '==', partnerId),
      orderBy('mealType', 'asc'),
      orderBy('routeSequence', 'asc')
    );
  }

  /**
   * Real-time subscription to orders assigned to a specific delivery partner.
   */
  subscribePartnerOrders(
    partnerId: string,
    date: string,
    onNext: (orders: Order[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return this.subscribeToList(
      onNext,
      onError,
      where('date', '==', date),
      where('deliveryPartnerId', '==', partnerId),
      orderBy('mealType', 'asc'),
      orderBy('routeSequence', 'asc')
    );
  }

  /**
   * Assigns multiple orders to a specific delivery partner.
   */
  async assignOrders(orderIds: string[], partnerId: string): Promise<void> {
    // Phase 1: Client-side batch assignment
    const batch = writeBatch(db);
    for (const orderId of orderIds) {
      batch.update(doc(db, 'orders', orderId), { 
        deliveryPartnerId: partnerId,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp
      });
    }
    await batch.commit();
  }

  /**
   * Reassigns an order to a different delivery partner.
   */
  async reassignOrder(orderId: string, partnerId: string | null): Promise<void> {
    // Phase 1: Client-side reassignment
    await this.update(orderId, { 
      deliveryPartnerId: partnerId,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp
    });
  }

  /**
   * Updates the delivery status of an order directly in Firestore.
   * Moved from Cloud Function to client-side direct write (Spark plan — no Functions).
   */
  async updateDeliveryStatus(orderId: string, newStatus: string): Promise<void> {
    // Phase 7: Client-side delivery status update
    await this.update(orderId, {
      status: newStatus,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp
    } as Partial<Order>);
  }
}

export const deliveryRepository = new DeliveryRepository();
