import { Timestamp } from 'firebase-admin/firestore';
import { getDoc, writeBatch, serverTimestamp, where, doc, db } from './compat';
import {
  orderRepository,
  subscriptionRepository,
  orderGenerationRunRepository,
  userRepository,
  mealPlanRepository,
  kitchenRepository,
  deliveryZoneRepository,
  holidayRepository,
  notificationService
} from './repositories';
import type { Order, Subscription, CustomerProfile, DeliveryPartnerProfile, MealPlan } from './types';
import * as logger from 'firebase-functions/logger';

export function getTodayInTimezone(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const utc = d.getTime() + offset;
  const ist = new Date(utc + 3600000 * 5.5);
  const yy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Recursively strip `undefined` values from a plain object so Firestore never sees them. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const clean = {} as any;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

class OrderService {
  /**
   * Orchestrator for all daily orders.
   * Keeps legacy compatibility by running all meal generations.
   */
  async generateDailyOrders(dateOverride?: string): Promise<{ success: boolean; message: string; ordersGenerated: number }> {
    const today = dateOverride || getTodayInTimezone();
    
    const isSunday = new Date(today).getDay() === 0;
    if (isSunday) {
      console.log(`[orderService] Today (${today}) is Sunday. Skipping order generation.`);
      return { success: true, message: 'Today is Sunday (Holiday). No orders generated.', ordersGenerated: 0 };
    }

    let totalGenerated = 0;
    totalGenerated += await this.generateBreakfastOrders(today);
    totalGenerated += await this.generateLunchOrders(today);
    totalGenerated += await this.generateDinnerOrders(today);

    if (totalGenerated === 0) {
      return { success: true, message: `0 new orders generated. (Orders may have already been generated for today)`, ordersGenerated: 0 };
    }

    return { success: true, message: `Successfully generated ${totalGenerated} new orders.`, ordersGenerated: totalGenerated };
  }

  async generateBreakfastOrders(dateOverride?: string): Promise<number> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, 'breakfast');
  }

  async generateLunchOrders(dateOverride?: string): Promise<number> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, 'lunch');
  }

  async generateDinnerOrders(dateOverride?: string): Promise<number> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, 'dinner');
  }

  private async generateMealOrders(today: string, mealType: 'breakfast' | 'lunch' | 'dinner'): Promise<number> {
    // ── Holiday Guard ─────────────────────────────────────────────────────────
    // Must be the first check before ANY batch is built, any data fetched,
    // or any run record created. This is the application-level defence.
    // Firestore security rules provide the client-level defence.
    const isHoliday = await holidayRepository.isHoliday(today);
    if (isHoliday) {
      console.log(`[orderService] ${today} is an active holiday — skipping ${mealType} order generation.`);
      return 0;
    }

    const runId = `${today}_${mealType}`;
    const existingRun = await orderGenerationRunRepository.getById(runId);
    
    if (existingRun && existingRun.status === 'success') {
      console.log(`[orderService] ${mealType} orders already successfully generated for ${today}.`);
      return 0;
    }

    const startedAt = serverTimestamp() as unknown as Timestamp;
    let ordersGenerated = 0;
    let ordersSkipped = 0;
    let ordersCancelled = 0;
    let ordersFailed = 0;
    let notificationsFailed = 0;

    await orderGenerationRunRepository.create({
      date: today,
      mealType,
      status: 'running',
      startedAt,
      ordersGenerated: 0,
      ordersSkipped: 0,
      ordersCancelled: 0,
      ordersFailed: 0,
      notificationsFailed: 0
    }, runId);

    try {
      // 1. Fetch data
      const [allSubscriptions, mealPlans, allCustomers, allZones, allPartners, todaysOrders, allKitchens] = await Promise.all([
        subscriptionRepository.list(where('status', '==', 'active')),
        mealPlanRepository.list(),
        userRepository.list(where('role', '==', 'customer')),
        deliveryZoneRepository.list(),
        userRepository.list(where('role', '==', 'delivery_partner')),
        orderRepository.list(where('date', '==', today)),
        kitchenRepository.list()
      ]);
      const customerMap = new Map<string, CustomerProfile>(allCustomers.map(c => [c.id, c as CustomerProfile]));
      const activePartners = allPartners.filter(p => p.isActive) as DeliveryPartnerProfile[];
      const partnerMap = new Map<string, DeliveryPartnerProfile>(activePartners.map(p => [p.id, p]));
      const zoneMap = new Map(allZones.map(z => [z.id, z]));
      const defaultKitchenId = allKitchens.length === 0 ? null : allKitchens[0].id;

      const workloadMap = new Map<string, number>();
      todaysOrders.forEach(o => {
        if (o.deliveryPartnerId && o.status !== 'cancelled' && o.status !== 'skipped') {
          workloadMap.set(o.deliveryPartnerId, (workloadMap.get(o.deliveryPartnerId) || 0) + 1);
        }
      });

      const ordersToCreate: Partial<Order>[] = [];

      for (const sub of allSubscriptions) {
        if (sub.endDate && sub.endDate < today) {
          ordersSkipped++;
          continue;
        }
        if (sub.startDate > today) {
          ordersSkipped++;
          continue;
        }

        let attempts = 0;
        let success = false;
        while (attempts < 3 && !success) {
          try {
            const pref = sub.mealPreferences.find(p => p.mealType === mealType);
            if (!pref) {
               success = true;
               continue; // Not subscribed to this meal
            }

            // Check cancellation (skips)
            const skipRef = doc(db, 'subscriptions', sub.id, 'skips', today);
            const skipDoc = await getDoc(skipRef);
            if (skipDoc.exists() && (skipDoc.data().mealTypes || []).includes(mealType)) {
              ordersCancelled++;
              
              // We must still generate an order document with status='cancelled' 
              // so that the Kitchen Dashboard can track cancelled metrics accurately,
              // and so customers/admins see the cancellation in their order histories.
              const order = this.buildOrderSnapshot(sub, pref, mealType, today, customerMap, partnerMap, zoneMap, activePartners, allZones, mealPlans, workloadMap, defaultKitchenId);
              order.status = 'cancelled';
              // kitchenStatus is not applicable for cancelled orders
              ordersToCreate.push(order);
              
              success = true;
              continue;
            }

            const order = this.buildOrderSnapshot(sub, pref, mealType, today, customerMap, partnerMap, zoneMap, activePartners, allZones, mealPlans, workloadMap, defaultKitchenId);
            ordersToCreate.push(order);
            success = true;

            if (!order.deliveryPartnerId) {
              try {
                const auditMod = await import('./repositories');
                await auditMod.auditRepository.logAction('delivery_assignment_failed', 'system', 'System Auto-Generator', order.id!, 'order', {
                  orderId: order.id, customerId: sub.customerId, zoneId: order.zoneId, mealType: order.mealType, date: today, reason: 'No eligible partner available for this zone and shift'
                });
                
                const notifMod = await import('./repositories');
                const urMod = await import('./repositories');
                const admins = await urMod.userRepository.list(where('role', '==', 'admin'));
                await notifMod.notificationService.notifyAdminAlert(admins.map((a: any) => a.id), 'Delivery Assignment Failed', `Order ${order.id} for ${mealType} could not be automatically assigned. Please assign manually.`);
              } catch (e) {
                logger.error('[orderService] Failed background task for unassigned order:', e);
                notificationsFailed++;
              }
            }
          } catch (err) {
            attempts++;
            if (attempts >= 3) {
              logger.error(`[orderService] Failed generating ${mealType} for customer ${sub.customerId} after 3 attempts:`, err);
              ordersFailed++;
              
              try {
                const fqMod = await import('./repositories');
                await fqMod.failureQueueRepository.logFailure(
                  sub.customerId,
                  sub.id!,
                  mealType,
                  today,
                  err instanceof Error ? err.message : String(err),
                  err instanceof Error ? err.stack : undefined
                );
              } catch(e) {
                logger.error('[orderService] failure queue log failed:', e);
              }

              // Admin Alert
              try {
                const notifMod = await import('./repositories');
                const urMod = await import('./repositories');
                const admins = await urMod.userRepository.list(where('role', '==', 'admin'));
                await notifMod.notificationService.notifyAdminAlert(admins.map((a: any) => a.id), 'Order Generation Failed', `Failed to generate ${mealType} order for customer ${sub.customerId} after 3 attempts.`);
              } catch(e) {
                logger.error('[orderService] notify admin failed:', e);
                notificationsFailed++;
              }
            } else {
              console.log('Retry loop error:', err);
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
      }

      // 3. Batch write
      const BATCH_SIZE = 400;
      console.log(`[DEBUG] Meal: ${mealType}, allSubscriptions: ${allSubscriptions.length}, ordersToCreate: ${ordersToCreate.length}`);
      for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
        const batchOrders = ordersToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        batchOrders.forEach(order => {
          const ref = doc(db, 'orders', order.id!);
          batch.set(ref, stripUndefined({
            ...order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }), { merge: true });
        });
        await batch.commit();
        ordersGenerated += batchOrders.length;

        // Trigger notifications asynchronously with bounded concurrency
        try {
          const m = await import('./repositories');
          const BATCH_SIZE_NOTIF = 20;
          for (let j = 0; j < batchOrders.length; j += BATCH_SIZE_NOTIF) {
            const chunk = batchOrders.slice(j, j + BATCH_SIZE_NOTIF);
            const promises = chunk.flatMap(o => {
              const p = [m.notificationService.notifyOrderGeneratedCustomer(o.customerId!, o.id!, o.mealType || 'meal', o.date!)];
              if (o.deliveryPartnerId) {
                p.push(m.notificationService.notifyOrderGeneratedDriver(o.deliveryPartnerId, o.id!, o.mealType || 'meal'));
              }
              return p;
            });
            const results = await Promise.allSettled(promises);
            const rejections = results.filter(r => r.status === 'rejected');
            notificationsFailed += rejections.length;
            rejections.forEach(r => console.error('[orderService] Notification failed:', (r as PromiseRejectedResult).reason));
          }
        } catch (e) {
          console.error('[orderService] Notification module error:', e);
          notificationsFailed++;
        }
        
        try {
          const audit = await import('./repositories');
          await audit.auditRepository.logAction('orders_generated', 'system', 'System Auto-Generator', runId, 'system', {
            date: today,
            mealType,
            count: batchOrders.length
          });
        } catch (e) {
          console.error('[orderService] Audit log error:', e);
          notificationsFailed++;
        }
      }

      const completedAt = serverTimestamp() as unknown as Timestamp;
      const finalStatus = (ordersFailed > 0 || notificationsFailed > 0) ? (ordersGenerated > 0 ? 'partial' : 'failed') : 'success';

      await orderGenerationRunRepository.update(runId, {
        status: finalStatus,
        completedAt,
        ordersGenerated,
        ordersSkipped,
        ordersCancelled,
        ordersFailed,
        notificationsFailed
      } as any);

      if (ordersGenerated > 0) {
        try {
          const kitchenStaff = await userRepository.list(where('role', '==', 'kitchen'), where('isActive', '==', true));
          const ids = kitchenStaff.map((s) => s.id);
          if (ids.length > 0) {
            await notificationService.notifyDailyOrdersGenerated(ids, today, ordersGenerated);
          }
        } catch (err) {
          console.error('[orderService] kitchen notification failed:', err);
        }
      }

      return ordersGenerated;

    } catch (error: any) {
      const completedAt = serverTimestamp() as unknown as Timestamp;
      await orderGenerationRunRepository.update(runId, {
        status: 'failed',
        completedAt,
        error: error.message
      } as any);
      throw error;
    }
  }

  private buildOrderSnapshot(
    sub: Subscription,
    pref: any,
    mealType: 'breakfast' | 'lunch' | 'dinner',
    date: string,
    customerMap: Map<string, CustomerProfile>,
    partnerMap: Map<string, DeliveryPartnerProfile>,
    zoneMap: Map<string, any>,
    activePartners: DeliveryPartnerProfile[],
    allZones: any[],
    mealPlans: MealPlan[],
    workloadMap: Map<string, number>,
    defaultKitchenId: string | null
  ): Partial<Order> {
    const customer = customerMap.get(sub.customerId);
    
    let zoneId = customer?.zoneId ?? null;
    if (!zoneId) {
      const defaultAddress = customer?.addresses?.find((a: any) => a.id === customer.defaultAddressId) || customer?.addresses?.[0];
      if (defaultAddress?.pincode) {
        const matchedZone = allZones.find(z => z.pincodes.includes(defaultAddress.pincode));
        if (matchedZone) zoneId = matchedZone.id;
      }
    }

    let partnerId: string | null = null;
    if (zoneId) {
      const eligiblePartners = activePartners.filter(p => 
        p.isAvailable &&
        p.zoneIds?.includes(zoneId!) &&
        (!p.shifts || p.shifts.length === 0 || p.shifts.includes(mealType))
      );

      if (eligiblePartners.length > 0) {
        if (customer?.deliveryPartnerId && eligiblePartners.some(p => p.id === customer.deliveryPartnerId)) {
          partnerId = customer.deliveryPartnerId;
        } else {
          eligiblePartners.sort((a, b) => {
            const aLoad = workloadMap.get(a.id) || 0;
            const bLoad = workloadMap.get(b.id) || 0;
            if (aLoad !== bLoad) return aLoad - bLoad;
            return a.id.localeCompare(b.id);
          });
          partnerId = eligiblePartners[0].id;
        }
        workloadMap.set(partnerId, (workloadMap.get(partnerId) || 0) + 1);
      }
    }

    const plan = mealPlans.find(p => p.id === sub.planId);
    let optionLabel = '';
    if (plan) {
      const slot = plan.mealSlots.find(s => s.mealType === mealType);
      let option = slot?.options?.find(o => o.id === pref.selectedOptionId);
      if (!option && slot && slot.options && slot.options.length > 0) {
        option = slot.options[0];
      }
      if (option) optionLabel = option.label;
    }

    const driver = partnerMap.get(partnerId || '');
    const addr = customer?.addresses?.find((a: any) => a.id === sub.deliveryAddressId) || customer?.addresses?.[0];
    const addressStr = addr ? `${addr.line1} ${addr.line2 || ''}, ${addr.city}, ${addr.pincode}`.trim() : undefined;

    const orderObj: Partial<Order> = {
      id: `ord_${sub.id}_${date}_${mealType}`,
      displayId: customer?.displayId || `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      source: 'subscription',
      customerId: sub.customerId,
      subscriptionId: sub.id,
      planTier: sub.planTier,
      mealType: mealType,
      date: date,
      
      // Denormalized Operational Snapshot
      customerName: customer?.fullName || 'Unknown Customer',
      customerCode: customer?.displayId || undefined,
      customerPhone: customer?.phone || undefined,
      address: addressStr || undefined,
      zoneName: zoneId ? (zoneMap.get(zoneId)?.name || undefined) : undefined,
      planName: plan?.name || 'Unknown Plan',
      driverName: driver?.fullName || undefined,
      driverPhone: driver?.phone || undefined,
      mealName: optionLabel || mealType,
      mealQuantity: sub.quantity || 1,
      billingStatus: 'Generated',
      kitchenStatus: 'scheduled',

      itemsLabel: `Subscription - ${mealType} ${optionLabel ? `(${optionLabel})` : ''}`,
      selectedOptionId: pref.selectedOptionId ?? null,
      price: sub.pricingMatrixSnapshot ? 
        ((sub.pricingMatrixSnapshot as unknown as Record<string, number>)[mealType] || 0) * (sub.quantity || 1) : 
        Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / sub.mealPreferences.length),
      currency: 'INR',
      status: 'scheduled',
      deliveryAddressId: sub.deliveryAddressId ?? null,
      zoneId: zoneId ?? null,
      kitchenId: zoneId ? (zoneMap.get(zoneId)?.kitchenId ?? defaultKitchenId) : defaultKitchenId,
      deliveryPartnerId: partnerId ?? null,
      deliveryWindow: null,
      paymentId: sub.latestPaymentId ?? null,
    };

    // Remove any remaining undefined values just in case
    Object.keys(orderObj).forEach(key => {
      if ((orderObj as any)[key] === undefined) {
        delete (orderObj as any)[key];
      }
    });

    return orderObj;
  }

  /**
   * Generates orders for a specific subscription and date for the specified meal types.
   * Useful when a subscription is resumed mid-day and needs today's remaining orders generated.
   */
  async generateOrdersForSubscription(
    subscription: import('./types').Subscription,
    date: string,
    mealTypesToGenerate: import('./types').MealType[]
  ): Promise<void> {
    const isSunday = new Date(date).getDay() === 0;
    if (isSunday) {
      console.log(`[orderService] Subscription ${subscription.id} skip generateOrdersForSubscription since ${date} is Sunday.`);
      return;
    }

    // ── Holiday Guard ─────────────────────────────────────────────────────────
    // Checked after Sunday guard and before any data fetch or batch write.
    // Critical: this guard also runs on the restoreOrdersForUnskipDay path
    // which calls generateOrdersForSubscription when generateMissing=true.
    const isHolidayDate = await holidayRepository.isHoliday(date);
    if (isHolidayDate) {
      console.log(`[orderService] ${date} is an active holiday — skipping subscription ${subscription.id} order generation.`);
      return;
    }

    const [mealPlans, customer, allZones, allPartners, todaysOrders, allKitchens] = await Promise.all([
      mealPlanRepository.list(),
      userRepository.getById(subscription.customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where('role', '==', 'delivery_partner')),
      orderRepository.list(where('date', '==', date)),
      kitchenRepository.list()
    ]);
    
    const activePartners = allPartners.filter(p => p.isActive) as DeliveryPartnerProfile[];
    const customerMap = new Map<string, CustomerProfile>();
    if (customer) customerMap.set(customer.id, customer as CustomerProfile);
    const partnerMap = new Map<string, DeliveryPartnerProfile>(activePartners.map(p => [p.id, p]));
    const zoneMap = new Map(allZones.map(z => [z.id, z]));
    const defaultKitchenId = allKitchens.length === 0 ? null : allKitchens[0].id;

    const workloadMap = new Map<string, number>();
    todaysOrders.forEach(o => {
      if (o.deliveryPartnerId && o.status !== 'cancelled' && o.status !== 'skipped') {
        workloadMap.set(o.deliveryPartnerId, (workloadMap.get(o.deliveryPartnerId) || 0) + 1);
      }
    });
    
    const ordersToCreate: Partial<Order>[] = [];

    for (const pref of subscription.mealPreferences) {
      if (!mealTypesToGenerate.includes(pref.mealType)) continue;
      const order = this.buildOrderSnapshot(subscription, pref, pref.mealType, date, customerMap, partnerMap, zoneMap, activePartners, allZones, mealPlans, workloadMap, defaultKitchenId);
      ordersToCreate.push(order);

      if (!order.deliveryPartnerId) {
        try {
          const auditMod = await import('./repositories');
          await auditMod.auditRepository.logAction('delivery_assignment_failed', 'system', 'System Auto-Generator', order.id!, 'order', {
            orderId: order.id, customerId: subscription.customerId, zoneId: order.zoneId, mealType: order.mealType, date, reason: 'No eligible partner available for this zone and shift'
          });

          const notifMod = await import('./repositories');
          const urMod = await import('./repositories');
          const admins = await urMod.userRepository.list(where('role', '==', 'admin'));
          await notifMod.notificationService.notifyAdminAlert(admins.map((a: any) => a.id), 'Delivery Assignment Failed', `Order ${order.id} for ${pref.mealType} could not be automatically assigned. Please assign manually.`);
        } catch (e) {
          console.error('[orderService] Failed background task for unassigned order:', e);
        }
      }
    }

    if (ordersToCreate.length === 0) return;

    const batch = writeBatch(db);
    ordersToCreate.forEach(order => {
      const ref = doc(db, 'orders', order.id!);
      batch.set(ref, stripUndefined({
        ...order,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp
      }), { merge: true });
    });
    
    await batch.commit();

    try {
      const kitchenStaff = await userRepository.list(where('role', '==', 'kitchen'), where('isActive', '==', true));
      const ids = kitchenStaff.map((s) => s.id);
      if (ids.length > 0) {
          await notificationService.notifyDailyOrdersGenerated(ids, date, ordersToCreate.length);
      }
    } catch (err) {
      console.error('[orderService] kitchen notification failed during mid-day resume:', err);
    }
  }

  async updateOrderStatus(orderId: string, status: import('./types').OrderStatus): Promise<void> {
    if (!orderId || !status) {
      throw new Error('Order ID and Status are required.');
    }
    const order = await orderRepository.getById(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found.`);
    }
    if (order.status === status) {
      return; 
    }
    await orderRepository.update(orderId, {
      status,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    });
  }

  /**
   * Synchronize today's active orders whenever a customer's zone or delivery partner changes.
   * This is called by CustomerService to maintain consistency without relying on Firestore Triggers.
   */
  async syncCustomerActiveOrders(customerId: string): Promise<void> {
    const today = getTodayInTimezone();
    
    // Fetch today's orders for this customer
    const activeOrders = await orderRepository.list(
      where('customerId', '==', customerId),
      where('date', '==', today)
    );
    
    // We only update orders that are not terminal and not locked by drivers
    const TERMINAL_AND_LOCKED_STATUSES = ['delivered', 'failed_delivery', 'returned_delivery', 'skipped', 'cancelled', 'picked_up', 'out_for_delivery'];
    const ordersToSync = activeOrders.filter(o => !TERMINAL_AND_LOCKED_STATUSES.includes(o.status));
    
    if (ordersToSync.length === 0) return;

    // Fetch required references
    const [customer, allZones, allPartners] = await Promise.all([
      userRepository.getById(customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where('role', '==', 'delivery_partner'))
    ]);

    if (!customer) return;

    const activePartners = allPartners.filter(p => p.isActive) as import('./types').DeliveryPartnerProfile[];
    const zoneMap = new Map(allZones.map(z => [z.id, z]));
    const partnerMap = new Map(activePartners.map(p => [p.id, p]));

    const workloadMap = new Map<string, number>();
    activeOrders.forEach(o => {
      if (o.deliveryPartnerId && o.status !== 'cancelled' && o.status !== 'skipped') {
        workloadMap.set(o.deliveryPartnerId, (workloadMap.get(o.deliveryPartnerId) || 0) + 1);
      }
    });

    let zoneId = (customer as CustomerProfile).zoneId ?? null;
    
    if (!zoneId) {
      const custProfile = customer as CustomerProfile;
      const defaultAddress = custProfile.addresses?.find((a: any) => a.id === custProfile.defaultAddressId) || custProfile.addresses?.[0];
      if (defaultAddress?.pincode) {
        const matchedZone = allZones.find(z => z.pincodes.includes(defaultAddress.pincode));
        if (matchedZone) zoneId = matchedZone.id;
      }
    }

    const zoneName = zoneId ? zoneMap.get(zoneId)?.name : undefined;
    const kitchenId = zoneId ? zoneMap.get(zoneId)?.kitchenId : undefined;

    const batch = writeBatch(db);
    ordersToSync.forEach(order => {
      let partnerId: string | null = null;
      if (zoneId) {
        const eligiblePartners = activePartners.filter(p => 
          p.isAvailable &&
          p.zoneIds?.includes(zoneId!) &&
          (!p.shifts || p.shifts.length === 0 || p.shifts.includes(order.mealType))
        );
        if (eligiblePartners.length > 0) {
          const prefPartnerId = (customer as CustomerProfile).deliveryPartnerId;
          if (prefPartnerId && eligiblePartners.some(p => p.id === prefPartnerId)) {
            partnerId = prefPartnerId;
          } else {
            eligiblePartners.sort((a, b) => {
              const aLoad = workloadMap.get(a.id) || 0;
              const bLoad = workloadMap.get(b.id) || 0;
              if (aLoad !== bLoad) return aLoad - bLoad;
              return a.id.localeCompare(b.id);
            });
            partnerId = eligiblePartners[0].id;
          }
          
          if (order.deliveryPartnerId !== partnerId) {
            if (order.deliveryPartnerId) {
              workloadMap.set(order.deliveryPartnerId, Math.max(0, (workloadMap.get(order.deliveryPartnerId) || 0) - 1));
            }
            workloadMap.set(partnerId, (workloadMap.get(partnerId) || 0) + 1);
          }
        }
      }

      const driver = partnerMap.get(partnerId || '');
      const custProfile = customer as CustomerProfile;
      const addr = custProfile.addresses?.find((a: any) => a.id === order.deliveryAddressId) || custProfile.addresses?.[0];
      const addressStr = addr ? `${addr.line1} ${addr.line2 || ''}, ${addr.city}, ${addr.pincode}`.trim() : undefined;

      const ref = doc(db, 'orders', order.id!);
      const updatePayload: any = {
        deliveryPartnerId: partnerId ?? null,
        zoneId: zoneId ?? null,
        kitchenId: kitchenId ?? null,
        driverName: driver?.fullName ?? null,
        driverPhone: driver?.phone ?? null,
        zoneName: zoneName ?? null,
        customerName: custProfile.fullName || 'Unknown Customer',
        customerCode: custProfile.displayId ?? null,
        customerPhone: custProfile.phone ?? null,
        address: addressStr ?? null,
        updatedAt: serverTimestamp() as unknown as Timestamp
      };

      Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key] === undefined) {
          delete updatePayload[key];
        }
      });

      batch.update(ref, stripUndefined(updatePayload));
    });

    await batch.commit();
    console.log(`[orderService] Synced ${ordersToSync.length} active orders for customer ${customerId}`);
  }

  /**
   * Applies Kitchen Lock and cancels generated orders for a skipped day.
   */
  async cancelOrdersForSkipDay(subscriptionId: string, customerId: string, date: string, mealTypes: string[]): Promise<void> {
    const batch = writeBatch(db);
    const cancelledOrders = await this.appendCancelOrdersToBatch(batch, subscriptionId, customerId, date, mealTypes);
    
    if (cancelledOrders.length > 0) {
      await batch.commit();
      console.log(`[orderService] Cancelled ${cancelledOrders.length} orders for skipped day ${date}`);
      
      import('./repositories').then(m => {
        cancelledOrders.forEach(o => {
          m.auditRepository.logAction('meal_cancelled', customerId, 'Customer', o.id!, 'order', {
            date,
            mealType: o.mealType
          }).catch(console.error);
        });
      }).catch(console.error);
    }
  }

  async appendCancelOrdersToBatch(batch: any, subscriptionId: string, customerId: string, date: string, mealTypes: string[]): Promise<Order[]> {
    const allDailyOrders = await orderRepository.list(
      where('subscriptionId', '==', subscriptionId),
      where('customerId', '==', customerId),
      where('date', '==', date)
    );
    
    const orders = allDailyOrders.filter(o => mealTypes.includes(o.mealType || ''));

    const lockedStatuses = ['packing', 'packed', 'ready_for_pickup'];
    const lockedOrders = orders.filter(o => lockedStatuses.includes(o.kitchenStatus || ''));

    if (lockedOrders.length > 0) {
      throw new Error('Order is already being prepared by the kitchen and cannot be cancelled.');
    }

    orders.forEach(order => {
      const ref = doc(db, 'orders', order.id!);
      batch.update(ref, {
        status: 'cancelled',
        updatedAt: serverTimestamp() as unknown as Timestamp
      });
    });

    return orders;
  }

  /**
   * Restores orders for an unskipped day.
   * If generateMissing is false, it only restores existing cancelled/skipped orders.
   * If generateMissing is true, it also securely generates any missing orders.
   * All operational values are sourced exclusively from the subscription record.
   */
  async restoreOrdersForUnskipDay(customerId: string, subscriptionId: string, date: string, mealTypes: import('./types').MealType[], generateMissing: boolean = true): Promise<void> {
    const allDailyOrders = await orderRepository.list(
      where('subscriptionId', '==', subscriptionId),
      where('customerId', '==', customerId),
      where('date', '==', date)
    );
    
    const existingOrders = allDailyOrders.filter(o => mealTypes.includes(o.mealType || ''));
    
    const OPERATIONAL_STATUSES = ['picked_up', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned_delivery'];
    const operationalLockedOrders = existingOrders.filter(o => OPERATIONAL_STATUSES.includes(o.status));
    
    if (operationalLockedOrders.length > 0) {
      throw new Error('Order is already in delivery or delivered and cannot be modified.');
    }

    const lockedStatuses = ['packing', 'packed', 'ready_for_pickup'];
    const kitchenLockedOrders = existingOrders.filter(o => lockedStatuses.includes(o.kitchenStatus || ''));

    if (kitchenLockedOrders.length > 0) {
      throw new Error('Order is already being prepared by the kitchen and cannot be modified.');
    }

    const ordersToRestore = existingOrders.filter(o => o.status === 'cancelled' || o.status === 'skipped');
    
    const batch = writeBatch(db);
    ordersToRestore.forEach(order => {
      const ref = doc(db, 'orders', order.id!);
      batch.update(ref, {
        status: 'scheduled',
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });
    });

    if (ordersToRestore.length > 0) {
      await batch.commit();
      console.log(`[orderService] Restored ${ordersToRestore.length} orders for unskipped day ${date}`);
      
      // Auto-assign delivery partners for the newly scheduled orders
      await this.syncCustomerActiveOrders(customerId);
    }

    // Identify which meals need brand new orders generated (skipped before generation ran)
    const existingMealTypes = new Set(existingOrders.map(o => o.mealType));
    const mealTypesToGenerate = mealTypes.filter(m => !existingMealTypes.has(m));

    if (generateMissing && mealTypesToGenerate.length > 0) {
      // Fetch the subscription to drive trusted order generation.
      // The customer cannot supply any operational fields — all values come from the subscription.
      const subscription = await subscriptionRepository.getById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found. Cannot regenerate orders.`);
      }
      // Verify the subscription belongs to this customer (double-check ownership)
      if (subscription.customerId !== customerId) {
        throw new Error('Subscription does not belong to this customer.');
      }
      
      if (subscription.status !== 'active') {
        throw new Error(`Subscription is ${subscription.status}, not active. Cannot regenerate orders.`);
      }
      if (subscription.startDate > date) {
        throw new Error('Requested date is before the subscription start date.');
      }
      if (subscription.endDate && subscription.endDate < date) {
        throw new Error('Requested date is after the subscription end date.');
      }
      
      await this.generateOrdersForSubscription(subscription, date, mealTypesToGenerate);
      console.log(`[orderService] Regenerated ${mealTypesToGenerate.length} missing orders for unskipped day ${date}`);
    }
  }
}

export const orderService = new OrderService();
