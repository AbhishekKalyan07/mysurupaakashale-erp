import { Timestamp } from 'firebase/firestore';
import { getDoc, writeBatch, serverTimestamp, where, doc } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { orderRepository } from '../firestore/orderRepository';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { orderGenerationRunRepository } from '../firestore/analyticsRepository';
import { userRepository } from '../firestore/userRepository';
import { mealPlanRepository } from '../firestore/mealPlanRepository';
import { deliveryZoneRepository } from '../firestore/deliveryZoneRepository';
import { notifyDailyOrdersGenerated } from '../firestore/notificationService';
import type { Order, Subscription, CustomerProfile, DeliveryPartnerProfile, MealPlan } from '@/shared/types';
import { getTodayInTimezone } from '@/shared/lib/date';

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

    return { success: true, message: `Orchestrator finished. Generated ${totalGenerated} total orders.`, ordersGenerated: totalGenerated };
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

    await orderGenerationRunRepository.create({
      date: today,
      mealType,
      status: 'running',
      startedAt,
      ordersGenerated: 0,
      ordersSkipped: 0,
      ordersCancelled: 0,
      ordersFailed: 0
    }, runId);

    try {
      // 1. Fetch data
      const [allSubscriptions, mealPlans, allCustomers, allZones, allPartners, todaysOrders] = await Promise.all([
        subscriptionRepository.list(where('status', '==', 'active')),
        mealPlanRepository.list(),
        userRepository.list(where('role', '==', 'customer')),
        deliveryZoneRepository.list(),
        userRepository.list(where('role', '==', 'delivery_partner')),
        orderRepository.list(where('date', '==', today))
      ]);
      const customerMap = new Map<string, CustomerProfile>(allCustomers.map(c => [c.id, c as CustomerProfile]));
      const activePartners = allPartners.filter(p => p.isActive) as DeliveryPartnerProfile[];
      const partnerMap = new Map<string, DeliveryPartnerProfile>(activePartners.map(p => [p.id, p]));
      const zoneMap = new Map(allZones.map(z => [z.id, z]));

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
              success = true;
              continue;
            }

            const order = this.buildOrderSnapshot(sub, pref, mealType, today, customerMap, partnerMap, zoneMap, activePartners, allZones, mealPlans, workloadMap);
            ordersToCreate.push(order);
            success = true;

            if (!order.deliveryPartnerId) {
              import('@/shared/services/firestore/auditRepository').then(m => {
                m.auditRepository.logAction('delivery_assignment_failed', 'system', 'System Auto-Generator', order.id!, 'order', {
                  orderId: order.id, customerId: sub.customerId, zoneId: order.zoneId, mealType: order.mealType, date: today, reason: 'No eligible partner available for this zone and shift'
                }).catch(console.error);
              }).catch(console.error);
              import('@/shared/services/firestore/notificationService').then(m => {
                import('@/shared/services/firestore/userRepository').then(ur => {
                  ur.userRepository.list(where('role', '==', 'admin')).then(admins => {
                    m.notifyAdminAlert(admins.map(a => a.id), 'Delivery Assignment Failed', `Order ${order.id} for ${mealType} could not be automatically assigned. Please assign manually.`);
                  }).catch(console.error);
                }).catch(console.error);
              }).catch(console.error);
            }
          } catch (err) {
            attempts++;
            if (attempts >= 3) {
              console.error(`[orderService] Failed generating ${mealType} for customer ${sub.customerId} after 3 attempts:`, err);
              ordersFailed++;
              
              import('@/shared/services/firestore/failureQueueRepository').then(m => {
                m.failureQueueRepository.logFailure(
                  sub.customerId,
                  sub.id,
                  mealType,
                  today,
                  err instanceof Error ? err.message : String(err),
                  err instanceof Error ? err.stack : undefined
                ).catch(console.error);
              }).catch(console.error);

              // Admin Alert
              import('@/shared/services/firestore/notificationService').then(m => {
                import('@/shared/services/firestore/userRepository').then(ur => {
                  ur.userRepository.list(where('role', '==', 'admin'))
                    .then(admins => {
                      m.notifyAdminAlert(admins.map(a => a.id), 'Order Generation Failed', `Failed to generate ${mealType} order for customer ${sub.customerId} after 3 attempts.`);
                    }).catch(console.error);
                }).catch(console.error);
              }).catch(console.error);
            } else {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
      }

      // 3. Batch write
      const BATCH_SIZE = 400;
      for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
        const batchOrders = ordersToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        batchOrders.forEach(order => {
          const ref = doc(db, 'orders', order.id!);
          batch.set(ref, {
            ...order,
            createdAt: serverTimestamp() as unknown as Timestamp,
            updatedAt: serverTimestamp() as unknown as Timestamp
          }, { merge: true });
        });
        await batch.commit();
        ordersGenerated += batchOrders.length;

        // Trigger notifications asynchronously
        import('@/shared/services/firestore/notificationService').then(m => {
          batchOrders.forEach(o => {
            m.notifyOrderGeneratedCustomer(o.customerId!, o.mealType || 'meal', o.date!).catch(console.error);
            if (o.deliveryPartnerId) {
              m.notifyOrderGeneratedDriver(o.deliveryPartnerId, o.id!, o.mealType || 'meal', o.customerName || 'Unknown', o.date!).catch(console.error);
            }
          });
        }).catch(console.error);
        
        import('@/shared/services/firestore/auditRepository').then(m => {
          m.auditRepository.logAction('orders_generated', 'system', 'System Auto-Generator', runId, 'system', {
            date: today,
            mealType,
            count: batchOrders.length
          }).catch(console.error);
        }).catch(console.error);
      }

      const completedAt = serverTimestamp() as unknown as Timestamp;
      const finalStatus = ordersFailed > 0 ? (ordersGenerated > 0 ? 'partial' : 'failed') : 'success';

      await orderGenerationRunRepository.update(runId, {
        status: finalStatus,
        completedAt,
        ordersGenerated,
        ordersSkipped,
        ordersCancelled,
        ordersFailed
      } as any);

      if (ordersGenerated > 0) {
        try {
          const kitchenStaff = await userRepository.list(where('role', '==', 'kitchen'), where('isActive', '==', true));
          const ids = kitchenStaff.map((s) => s.id);
          if (ids.length > 0) {
            await notifyDailyOrdersGenerated(ids, today, ordersGenerated);
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
    workloadMap: Map<string, number>
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
      customerCode: customer?.displayId ?? null,
      customerPhone: customer?.phone ?? null,
      address: addressStr ?? null,
      zoneName: zoneId ? (zoneMap.get(zoneId)?.name ?? null) : null,
      planName: plan?.name || 'Unknown Plan',
      driverName: driver?.fullName ?? null,
      driverPhone: driver?.phone ?? null,
      mealName: optionLabel || mealType,
      mealQuantity: sub.quantity || 1,
      billingStatus: 'Generated',
      kitchenStatus: 'Preparing',

      itemsLabel: `Subscription - ${mealType} ${optionLabel ? `(${optionLabel})` : ''}`,
      selectedOptionId: pref.selectedOptionId ?? null,
      price: Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / sub.mealPreferences.length),
      currency: 'INR',
      status: 'scheduled',
      deliveryAddressId: sub.deliveryAddressId ?? null,
      zoneId: zoneId ?? null,
      kitchenId: null,
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
    subscription: import('@/shared/types').Subscription,
    date: string,
    mealTypesToGenerate: import('@/shared/types').MealType[]
  ): Promise<void> {
    const isSunday = new Date(date).getDay() === 0;
    if (isSunday) {
      console.log(`[orderService] Subscription ${subscription.id} skip generateOrdersForSubscription since ${date} is Sunday.`);
      return;
    }

    const [mealPlans, customer, allZones, allPartners, todaysOrders] = await Promise.all([
      mealPlanRepository.list(),
      userRepository.getById(subscription.customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where('role', '==', 'delivery_partner')),
      orderRepository.list(where('date', '==', date))
    ]);
    
    const activePartners = allPartners.filter(p => p.isActive) as DeliveryPartnerProfile[];
    const customerMap = new Map<string, CustomerProfile>();
    if (customer) customerMap.set(customer.id, customer as CustomerProfile);
    const partnerMap = new Map<string, DeliveryPartnerProfile>(activePartners.map(p => [p.id, p]));
    const zoneMap = new Map(allZones.map(z => [z.id, z]));

    const workloadMap = new Map<string, number>();
    todaysOrders.forEach(o => {
      if (o.deliveryPartnerId && o.status !== 'cancelled' && o.status !== 'skipped') {
        workloadMap.set(o.deliveryPartnerId, (workloadMap.get(o.deliveryPartnerId) || 0) + 1);
      }
    });
    
    const ordersToCreate: Partial<Order>[] = [];

    for (const pref of subscription.mealPreferences) {
      if (!mealTypesToGenerate.includes(pref.mealType)) continue;
      const order = this.buildOrderSnapshot(subscription, pref, pref.mealType, date, customerMap, partnerMap, zoneMap, activePartners, allZones, mealPlans, workloadMap);
      ordersToCreate.push(order);

      if (!order.deliveryPartnerId) {
        import('@/shared/services/firestore/auditRepository').then(m => {
          m.auditRepository.logAction('delivery_assignment_failed', 'system', 'System Auto-Generator', order.id!, 'order', {
            orderId: order.id, customerId: subscription.customerId, zoneId: order.zoneId, mealType: order.mealType, date, reason: 'No eligible partner available for this zone and shift'
          }).catch(console.error);
        }).catch(console.error);
        import('@/shared/services/firestore/notificationService').then(m => {
          import('@/shared/services/firestore/userRepository').then(ur => {
            ur.userRepository.list(where('role', '==', 'admin')).then(admins => {
              m.notifyAdminAlert(admins.map(a => a.id), 'Delivery Assignment Failed', `Order ${order.id} for ${pref.mealType} could not be automatically assigned. Please assign manually.`);
            }).catch(console.error);
          }).catch(console.error);
        }).catch(console.error);
      }
    }

    if (ordersToCreate.length === 0) return;

    const batch = writeBatch(db);
    ordersToCreate.forEach(order => {
      const ref = doc(db, 'orders', order.id!);
      batch.set(ref, {
        ...order,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp
      }, { merge: true });
    });
    
    await batch.commit();

    try {
      const kitchenStaff = await userRepository.list(where('role', '==', 'kitchen'), where('isActive', '==', true));
      const ids = kitchenStaff.map((s) => s.id);
      if (ids.length > 0) {
        await notifyDailyOrdersGenerated(ids, date, ordersToCreate.length);
      }
    } catch (err) {
      console.error('[orderService] kitchen notification failed during mid-day resume:', err);
    }
  }

  async updateOrderStatus(orderId: string, status: import('@/shared/types').OrderStatus): Promise<void> {
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

    const activePartners = allPartners.filter(p => p.isActive) as import('@/shared/types').DeliveryPartnerProfile[];
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

      batch.update(ref, updatePayload);
    });

    await batch.commit();
    console.log(`[orderService] Synced ${ordersToSync.length} active orders for customer ${customerId}`);
  }

  /**
   * Applies Kitchen Lock and cancels generated orders for a skipped day.
   */
  async cancelOrdersForSkipDay(customerId: string, date: string, mealTypes: string[]): Promise<void> {
    const orders = await orderRepository.list(
      where('customerId', '==', customerId),
      where('date', '==', date),
      where('mealType', 'in', mealTypes)
    );

    const lockedStatuses = ['packing', 'packed', 'ready_for_pickup'];
    const lockedOrders = orders.filter(o => lockedStatuses.includes(o.kitchenStatus || ''));

    if (lockedOrders.length > 0) {
      throw new Error('Order is already being prepared by the kitchen and cannot be cancelled.');
    }

    const batch = writeBatch(db);
    orders.forEach(order => {
      const ref = doc(db, 'orders', order.id!);
      batch.update(ref, {
        status: 'cancelled',
        updatedAt: serverTimestamp() as unknown as Timestamp
      });
    });

    if (orders.length > 0) {
      await batch.commit();
      console.log(`[orderService] Cancelled ${orders.length} orders for skipped day ${date}`);
      
      import('@/shared/services/firestore/auditRepository').then(m => {
        orders.forEach(o => {
          m.auditRepository.logAction('meal_cancelled', customerId, 'Customer', o.id!, 'order', {
            date,
            mealType: o.mealType
          }).catch(console.error);
        });
      }).catch(console.error);
    }
  }
}

export const orderService = new OrderService();
