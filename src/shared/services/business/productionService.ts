import type { Order, MealType } from '@/shared/types';

import { orderRepository } from '../firestore/orderRepository';
import { auditRepository } from '../firestore/auditRepository';

export interface ProductionProgress {
  total: number;
  packing: number;
  packed: number;
  ready: number;
  remaining: number;
  completionPercentage: number;
}

export interface ProductionSummary {
  breakfast: number;
  lunch: number;
  dinner: number;
  total: number;
}

export interface PlanSummary {
  basic: number;
  regular: number;
  oneTime: number;
}

export interface MealBreakdownItem {
  itemName: string;
  count: number;
}

export interface AreaPackingGroup {
  areaName: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  basic: number;
  regular: number;
  oneTime: number;
}

export interface PrintPackingRow {
  area: string;
  customerName: string;
  meal: string;
  plan: string;
  deliveryPartner: string;
}

export class ProductionService {
  /**
   * Summarizes total meal counts by meal type.
   */
  static getProductionSummary(orders: Order[]): ProductionSummary {
    let breakfast = 0;
    let lunch = 0;
    let dinner = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;
      if (o.mealType === 'breakfast') breakfast++;
      else if (o.mealType === 'lunch') lunch++;
      else if (o.mealType === 'dinner') dinner++;
    }

    return { breakfast, lunch, dinner, total: breakfast + lunch + dinner };
  }

  /**
   * Summarizes order counts by Plan Tier (or one-time).
   */
  static getPlanSummary(orders: Order[]): PlanSummary {
    let basic = 0;
    let regular = 0;
    let oneTime = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;
      if (o.source === 'one_time') {
        oneTime++;
      } else if (o.planTier === 'basic') {
        basic++;
      } else if (o.planTier === 'regular') {
        regular++;
      }
    }

    return { basic, regular, oneTime };
  }

  /**
   * Breaks down EXACT item counts per meal type (e.g. 40 Idli, 25 Dose)
   */
  static getMealBreakdown(orders: Order[], mealType: MealType): MealBreakdownItem[] {
    const counts = new Map<string, number>();

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;
      if (o.mealType !== mealType) continue;

      const label = o.itemsLabel || 'Unknown Item';
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([itemName, count]) => ({ itemName, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Calculates progress for a given set of orders.
   * Progress % = (Ready + Out for Delivery + Delivered) / Total
   */
  static getProductionProgress(orders: Order[]): ProductionProgress {
    let total = 0;
    let packing = 0;
    let packed = 0;
    let ready = 0;
    let completed = 0;

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;
      total++;
      if (o.status === 'packing') packing++;
      if (o.status === 'packed') packed++;
      if (o.status === 'ready_for_pickup') ready++;
      if (['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(o.status)) {
        completed++;
      }
    }

    const remaining = total - packing - packed - ready;
    const completionPercentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      packing,
      packed,
      ready,
      remaining,
      completionPercentage,
    };
  }

  /**
   * Groups packing requirements by Delivery Area.
   */
  static getAreaPacking(
    orders: Order[],
    zoneMap: Map<string, string>
  ): AreaPackingGroup[] {
    const areaMap = new Map<string, AreaPackingGroup>();

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;

      const areaId = o.zoneId;
      const areaName = areaId ? (zoneMap.get(areaId) || areaId) : 'Unassigned Area';

      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          areaName,
          breakfast: 0,
          lunch: 0,
          dinner: 0,
          basic: 0,
          regular: 0,
          oneTime: 0,
        });
      }

      const group = areaMap.get(areaName)!;

      if (o.mealType === 'breakfast') group.breakfast++;
      else if (o.mealType === 'lunch') group.lunch++;
      else if (o.mealType === 'dinner') group.dinner++;

      if (o.source === 'one_time') group.oneTime++;
      else if (o.planTier === 'basic') group.basic++;
      else if (o.planTier === 'regular') group.regular++;
    }

    return Array.from(areaMap.values()).sort((a, b) => a.areaName.localeCompare(b.areaName));
  }

  /**
   * Formats data specifically for the printable packing sheet.
   */
  static getPrintPackingSheet(
    orders: Order[],
    zoneMap: Map<string, string>,
    partnerMap: Map<string, string>,
    customerMap: Map<string, string>
  ): PrintPackingRow[] {
    const rows: PrintPackingRow[] = [];

    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'skipped') continue;

      const areaId = o.zoneId;
      const areaName = areaId ? (zoneMap.get(areaId) || areaId) : 'Unassigned Area';
      
      const partnerId = o.deliveryPartnerId;
      const deliveryPartner = partnerId ? (partnerMap.get(partnerId) || partnerId) : 'Unassigned';

      const customerName = o.customerName || customerMap.get(o.customerId) || o.customerId;
      
      let plan = 'One-Time';
      if (o.source === 'subscription' && o.planTier) {
        plan = o.planTier.charAt(0).toUpperCase() + o.planTier.slice(1);
      }

      const meal = o.itemsLabel || o.mealType;

      rows.push({
        area: areaName,
        customerName,
        meal,
        plan,
        deliveryPartner,
      });
    }

    // Sort by Area, then Customer Name
    return rows.sort((a, b) => {
      const areaCompare = a.area.localeCompare(b.area);
      if (areaCompare !== 0) return areaCompare;
      return a.customerName.localeCompare(b.customerName);
    });
  }
  /**
   * Advances an order to 'preparing'.
   */
  static async startPreparing(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error('Order ID is required.');
    const { orderRepository } = await import('../firestore/orderRepository');
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'preparing') return; // Idempotency
    if (order.status !== 'scheduled' && order.status !== 'reopened') {
      throw new Error(`Cannot transition from ${order.status} to preparing.`);
    }
    
    await orderRepository.update(orderId, { status: 'preparing' });
    
    await auditRepository.logAction('production_preparing', adminId, 'Admin', orderId, 'order', { oldStatus: order.status, newStatus: 'preparing' });
  }

  /**
   * Advances an order to 'ready_for_pickup'.
   */
  static async markReady(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error('Order ID is required.');
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'ready_for_pickup') return; // Idempotency
    if (order.status !== 'preparing') {
      throw new Error(`Cannot transition from ${order.status} to ready_for_pickup.`);
    }
    
    await orderRepository.update(orderId, { status: 'ready_for_pickup' });
    
    await auditRepository.logAction('production_ready', adminId, 'Admin', orderId, 'order', { oldStatus: order.status, newStatus: 'ready_for_pickup' });
  }

  /**
   * Locks production for an order.
   */
  static async lockProduction(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error('Order ID is required.');
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'locked') return; // Idempotency
    if (order.status !== 'ready_for_pickup') {
      throw new Error(`Cannot transition from ${order.status} to locked.`);
    }
    
    await orderRepository.update(orderId, { status: 'locked' });
    
    await auditRepository.logAction('production_locked', adminId, 'Admin', orderId, 'order', { oldStatus: order.status, newStatus: 'locked' });
  }

  /**
   * Closes production for an order (Day end).
   */
  static async closeProduction(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error('Order ID is required.');
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'closed') return; // Idempotency
    if (order.status !== 'locked') {
      throw new Error(`Cannot transition from ${order.status} to closed.`);
    }
    
    await orderRepository.update(orderId, { status: 'closed' });
    
    await auditRepository.logAction('production_closed', adminId, 'Admin', orderId, 'order', { oldStatus: order.status, newStatus: 'closed' });
  }

  /**
   * Reopens a closed order.
   */
  static async reopenProduction(orderId: string, adminId: string): Promise<void> {
    if (!orderId) throw new Error('Order ID is required.');
    const { orderRepository } = await import('../firestore/orderRepository');
    const order = await orderRepository.getById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    if (order.status === 'reopened') return; // Idempotency
    if (order.status !== 'closed' && order.status !== 'locked') {
      throw new Error(`Cannot transition from ${order.status} to reopened.`);
    }
    
    await orderRepository.update(orderId, { status: 'reopened' });
    
    const { auditRepository } = await import('../firestore/auditRepository');
    await auditRepository.logAction('production_reopened', adminId, 'Admin', orderId, 'order', { oldStatus: order.status, newStatus: 'reopened' });
  }
}
