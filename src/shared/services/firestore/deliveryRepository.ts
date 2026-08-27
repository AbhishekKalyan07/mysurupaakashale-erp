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
    // NOTE: routeSequence is optional and not currently populated during order
    // generation. Using it in orderBy() caused Firestore composite index queries
    // to silently exclude ALL documents without the field. Sorting by mealType
    // only; client-side route sorting can be applied when routeSequence is set.
    return this.list(
      where('date', '==', date),
      where('deliveryPartnerId', '==', partnerId),
      orderBy('mealType', 'asc')
    );
  }

  /**
   * Real-time subscription to orders assigned to a specific delivery partner.
   */
  subscribePartnerOrders(
    partnerId: string,
    date: string,
    mealType: string | undefined,
    onNext: (orders: Order[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const conditions: any[] = [
      where('date', '==', date),
      where('deliveryPartnerId', '==', partnerId)
    ];
    if (mealType) {
      conditions.push(where('mealType', '==', mealType));
    }
    return this.subscribeToList(
      onNext,
      onError,
      ...conditions
    );
  }

  /**
   * Fetch all delivered orders for a delivery partner within a date range.
   * Used for monthly dashboard statistics.
   */
  async getMonthlyDeliveries(partnerId: string, startDate: string, endDate: string): Promise<Order[]> {
    return this.list(
      where('deliveryPartnerId', '==', partnerId),
      where('status', '==', 'delivered'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
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
    const order = await this.getById(orderId);
    if (!order) throw new Error('Order not found');

    const lockedStatuses = ['picked_up', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned_delivery'];
    if (lockedStatuses.includes(order.status)) {
      throw new Error(`Cannot reassign order in status: ${order.status}`);
    }

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
    const order = await this.getById(orderId);
    if (!order) return;

    const payload: Partial<Order> = {
      status: newStatus as import('@/shared/types').OrderStatus,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp
    };

    if (newStatus === 'out_for_delivery' && !order.outForDeliveryAt) {
      payload.outForDeliveryAt = serverTimestamp() as unknown as Timestamp as unknown as Timestamp;
    }
    if (newStatus === 'delivered' && !order.deliveredAt) {
      payload.deliveredAt = serverTimestamp() as unknown as Timestamp as unknown as Timestamp;
    }

    await this.update(orderId, payload);
  }
}

export const deliveryRepository = new DeliveryRepository();
