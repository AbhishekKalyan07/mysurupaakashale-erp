import type { Order } from '@/shared/types';
import { orderRepository } from '../firestore/orderRepository';

export interface DeliverySummary {
  assigned: number;
  pickedUp: number;
  outForDelivery: number;
  delivered: number;
  failed: number;
  returned: number;
  remaining: number;
  completionPercentage: number;
}

export interface DeliveryAreaGroup {
  areaName: string;
  orders: Order[];
}

export interface DeliveryPartnerGroup {
  partnerName: string;
  areas: DeliveryAreaGroup[];
}

export class DeliveryService {
  /**
   * Summarizes total delivery KPIs based on order statuses.
   */
  getDeliverySummary(orders: Order[]): DeliverySummary {
    let assigned = 0;
    let pickedUp = 0;
    let outForDelivery = 0;
    let delivered = 0;
    let failed = 0;
    let returned = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;

      // In the context of delivery operations, "assigned" means it has a deliveryPartnerId.
      if (o.deliveryPartnerId) {
        assigned++;
      }

      if (o.status === 'picked_up') pickedUp++;
      else if (o.status === 'out_for_delivery') outForDelivery++;
      else if (o.status === 'delivered') delivered++;
      else if (o.status === 'failed_delivery') failed++;
      else if (o.status === 'returned_delivery') returned++;
    }

    const remaining = assigned - delivered - failed - returned;
    
    // Completion percentage based only on terminal states relative to total assigned.
    const completionPercentage = assigned === 0 ? 0 : Math.round(((delivered + failed + returned) / assigned) * 100);

    return {
      assigned,
      pickedUp,
      outForDelivery,
      delivered,
      failed,
      returned,
      remaining,
      completionPercentage,
    };
  }

  /**
   * Groups deliveries hierarchically: Partner -> Area -> Orders
   */
  getAreaDeliveryGroups(
    orders: Order[],
    partnerMap: Map<string, string>,
    zoneMap: Map<string, string>
  ): DeliveryPartnerGroup[] {
    const partnerGroups = new Map<string, Map<string, Order[]>>();

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;
      if (!o.deliveryPartnerId) continue; // Only group assigned orders

      const partnerName = partnerMap.get(o.deliveryPartnerId) || o.deliveryPartnerId;
      const areaName = o.zoneId ? (zoneMap.get(o.zoneId) || o.zoneId) : 'Unassigned Area';

      if (!partnerGroups.has(partnerName)) {
        partnerGroups.set(partnerName, new Map<string, Order[]>());
      }
      const areaGroups = partnerGroups.get(partnerName)!;

      if (!areaGroups.has(areaName)) {
        areaGroups.set(areaName, []);
      }
      areaGroups.get(areaName)!.push(o);
    }

    // Convert to sorted arrays
    const result: DeliveryPartnerGroup[] = [];
    
    const sortedPartners = Array.from(partnerGroups.keys()).sort();
    
    for (const partnerName of sortedPartners) {
      const areaMap = partnerGroups.get(partnerName)!;
      const sortedAreas = Array.from(areaMap.keys()).sort();
      
      const areas: DeliveryAreaGroup[] = sortedAreas.map(areaName => {
        const sortedOrders = areaMap.get(areaName)!.sort((a, b) => {
          // Sort by routeSequence if available, then by time window start
          if (a.routeSequence !== b.routeSequence) {
            return (a.routeSequence || 999) - (b.routeSequence || 999);
          }
          return (a.deliveryWindow?.start || '').localeCompare(b.deliveryWindow?.start || '');
        });
        return { areaName, orders: sortedOrders };
      });

      result.push({ partnerName, areas });
    }

    return result;
  }
  /**
   * Assigns or reassigns a driver to an order.
   */
  async assignDriver(orderId: string, driverId: string, adminId: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.deliveryPartnerId === driverId) return; // Idempotency
    
    await orderRepository.update(orderId, { deliveryPartnerId: driverId });
    const { auditRepository } = await import('../firestore/auditRepository');
    await auditRepository.logAction('driver_assigned', adminId, 'Admin', orderId, 'order', { oldDriverId: order.deliveryPartnerId, newDriverId: driverId });
  }

  /**
   * Driver marks an order as picked up.
   */
  async markPickedUp(orderId: string, driverId: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'picked_up') return; // Idempotency
    if (order.deliveryPartnerId !== driverId) throw new Error('Cannot update order assigned to another driver.');
    if (order.status !== 'ready_for_pickup') throw new Error(`Cannot transition from ${order.status} to picked_up.`);
    
    await orderRepository.update(orderId, { status: 'picked_up' });
  }

  /**
   * Driver starts route.
   */
  async startDelivery(orderId: string, driverId: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'out_for_delivery') return;
    if (order.deliveryPartnerId !== driverId) throw new Error('Cannot update order assigned to another driver.');
    if (order.status !== 'picked_up') throw new Error(`Cannot transition from ${order.status} to out_for_delivery.`);
    
    await orderRepository.update(orderId, { status: 'out_for_delivery' });
  }

  /**
   * Driver marks as delivered.
   */
  async markDelivered(orderId: string, driverId: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'delivered') return;
    if (order.deliveryPartnerId !== driverId) throw new Error('Cannot update order assigned to another driver.');
    if (order.status !== 'out_for_delivery') throw new Error(`Cannot transition from ${order.status} to delivered.`);
    
    await orderRepository.update(orderId, { status: 'delivered' });
  }

  /**
   * Driver or admin marks as failed.
   */
  async markFailed(orderId: string, driverId: string, reason: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'failed_delivery') return;
    if (order.deliveryPartnerId !== driverId) throw new Error('Cannot update order assigned to another driver.');
    if (order.status !== 'out_for_delivery') throw new Error(`Cannot transition from ${order.status} to failed_delivery.`);
    
    await orderRepository.update(orderId, { status: 'failed_delivery', failureReason: reason } as any);
  }

  /**
   * Driver or admin marks as returned.
   */
  async markReturned(orderId: string, driverId: string): Promise<void> {
    if (!orderId || !driverId) throw new Error('Order ID and Driver ID are required.');

    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'returned_delivery') return;
    if (order.deliveryPartnerId !== driverId) throw new Error('Cannot update order assigned to another driver.');
    if (order.status !== 'failed_delivery') throw new Error(`Cannot transition from ${order.status} to returned_delivery.`);
    
    await orderRepository.update(orderId, { status: 'returned_delivery' });
  }
}

export const deliveryService = new DeliveryService();
