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
import type { Order } from '@/shared/types';
import { format } from 'date-fns';

class OrderService {
  /**
   * Automatically generate daily orders based on active subscriptions.
   */
  async generateDailyOrders(dateOverride?: string): Promise<{ success: boolean; message: string; ordersGenerated: number }> {
    const today = dateOverride || format(new Date(), 'yyyy-MM-dd');

    // 1. Check if it already ran today
    const existingRun = await orderGenerationRunRepository.getById(today);
    if (existingRun && existingRun.status === 'success') {
      return { success: true, message: 'Orders already generated for today.', ordersGenerated: 0 };
    }

    // Sunday Holiday Check
    const isSunday = new Date(today).getDay() === 0;
    if (isSunday) {
      console.log(`[orderService] Today (${today}) is Sunday. Skipping order generation.`);
      return { success: true, message: 'Today is Sunday (Holiday). No orders generated.', ordersGenerated: 0 };
    }

    try {
      // 2. Fetch all active subscriptions, delivery partners, meal plans, and customers
      const [allSubscriptions, mealPlans, allCustomers, allZones, allPartners] = await Promise.all([
        subscriptionRepository.list(where('status', '==', 'active')),
        mealPlanRepository.list(),
        userRepository.list(where('role', '==', 'customer')),
        deliveryZoneRepository.list(),
        userRepository.list(where('role', '==', 'delivery_partner'))
      ]);
      const customerMap = new Map<string, import('@/shared/types').CustomerProfile>();
      allCustomers.forEach(c => customerMap.set(c.id, c as import('@/shared/types').CustomerProfile));
      const activePartners = allPartners.filter(p => p.isActive);
      const ordersToCreate: Partial<Order>[] = [];

      for (const sub of allSubscriptions) {
        if (sub.endDate && sub.endDate < today) continue; // expired
        if (sub.startDate > today) continue; // hasn't started

        // Check if skipped today
        const skipRef = doc(db, 'subscriptions', sub.id, 'skips', today);
        let skippedMeals: string[] = [];
        try {
          const skipDoc = await getDoc(skipRef);
          if (skipDoc.exists()) {
            skippedMeals = skipDoc.data().mealTypes || [];
          }
        } catch (error) {
          console.error(`Error fetching skips for subscription ${sub.id}:`, error);
        }

        for (const pref of sub.mealPreferences) {
          if (skippedMeals.includes(pref.mealType)) continue;

          // --- PRIORITY ROUTING LOGIC ---
          const customer = customerMap.get(sub.customerId);
          
          let partnerId = customer?.deliveryPartnerId ?? null;
          let zoneId = customer?.zoneId ?? null;
          
          if (!partnerId) {
            // Priority 2: Direct Zone fallback to Priority 3: Pincode Auto-match
            if (!zoneId) {
              const defaultAddress = customer?.addresses?.find((a: any) => a.id === customer.defaultAddressId) || customer?.addresses?.[0];
              if (defaultAddress?.pincode) {
                const matchedZone = allZones.find(z => z.pincodes.includes(defaultAddress.pincode));
                if (matchedZone) zoneId = matchedZone.id;
              }
            }
            
            // Look up partner assigned to this zone
            if (zoneId) {
              const partnerForZone = activePartners.find(p => (p as import('@/shared/types').DeliveryPartnerProfile).zoneIds?.includes(zoneId!));
              if (partnerForZone) {
                partnerId = partnerForZone.id;
              }
            }
          }
          
          
          // --------------------------------

          // Find option label
          let optionLabel = '';
          const plan = mealPlans.find((p: import('@/shared/types').MealPlan) => p.id === sub.planId);
          if (plan) {
            const slot = plan.mealSlots.find((s: import('@/shared/types').MealSlotConfig) => s.mealType === pref.mealType);
            let option = slot?.options?.find((o: import('@/shared/types').MealOption) => o.id === pref.selectedOptionId);
            if (!option && slot && slot.options && slot.options.length > 0) {
              option = slot.options[0];
            }
            if (option) optionLabel = ` (${option.label})`;
          }

          // Generate order
          ordersToCreate.push({
            id: `ord_${sub.id}_${today}_${pref.mealType}`,
            displayId: customer?.displayId || `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            source: 'subscription',
            customerId: sub.customerId,
            subscriptionId: sub.id,
            planTier: sub.planTier,
            mealType: pref.mealType,
            date: today,
            itemsLabel: `Subscription - ${pref.mealType}${optionLabel}`,
            selectedOptionId: pref.selectedOptionId,
            price: Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / sub.mealPreferences.length),
            currency: 'INR',
            status: 'scheduled',
            deliveryAddressId: sub.deliveryAddressId,
            zoneId: zoneId,
            kitchenId: null,
            deliveryPartnerId: partnerId,
                        deliveryWindow: null,
            paymentId: sub.latestPaymentId,
          });
        }
      }

      // 3. Save to Firestore via writeBatch
      const BATCH_SIZE = 400;
      for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
        const batchOrders = ordersToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        batchOrders.forEach(order => {
          const ref = doc(db, 'orders', order.id!);
          batch.set(ref, {
            ...order,
            createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
            updatedAt: serverTimestamp() as unknown as Timestamp
          }, { merge: true });
        });
        await batch.commit();
      }

      // 4. Save run status
      await orderGenerationRunRepository.create({
        date: today,
        status: 'success',
        ordersGenerated: ordersToCreate.length,
        runAt: serverTimestamp() as unknown as Timestamp,
      }, today);

      // 5. Notify kitchen staff
      if (ordersToCreate.length > 0) {
        userRepository
          .list(where('role', '==', 'kitchen'), where('isActive', '==', true))
          .then((kitchenStaff) => {
            const ids = kitchenStaff.map((s) => s.id);
            if (ids.length > 0) {
              return notifyDailyOrdersGenerated(ids, today, ordersToCreate.length);
            }
          })
          .catch((err) => console.error('[orderService] kitchen notification failed:', err));
      }

      return { success: true, message: `Successfully generated ${ordersToCreate.length} orders.`, ordersGenerated: ordersToCreate.length };

    } catch (error: unknown) {
      await orderGenerationRunRepository.create({
        date: today,
        status: 'failed',
        ordersGenerated: 0,
        runAt: serverTimestamp() as unknown as Timestamp,
        error: (error as Error).message
      }, today);
      throw error;
    }
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

    // Fetch meal plans and the customer
    const [mealPlans, customer, allZones, allPartners] = await Promise.all([
      mealPlanRepository.list(),
      userRepository.getById(subscription.customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where('role', '==', 'delivery_partner'))
    ]);
    
    const activePartners = allPartners.filter(p => p.isActive);
    
    const ordersToCreate: Partial<Order>[] = [];

    for (const pref of subscription.mealPreferences) {
      if (!mealTypesToGenerate.includes(pref.mealType)) continue;

      // --- PRIORITY ROUTING LOGIC ---
      let partnerId = (customer as import('@/shared/types').CustomerProfile)?.deliveryPartnerId ?? null;
      let zoneId = (customer as import('@/shared/types').CustomerProfile)?.zoneId ?? null;
      
      if (!partnerId) {
        if (!zoneId) {
          const defaultAddress = (customer as import('@/shared/types').CustomerProfile)?.addresses?.find((a: any) => a.id === (customer as import('@/shared/types').CustomerProfile).defaultAddressId) || (customer as import('@/shared/types').CustomerProfile)?.addresses?.[0];
          if (defaultAddress?.pincode) {
            const matchedZone = allZones.find(z => z.pincodes.includes(defaultAddress.pincode));
            if (matchedZone) zoneId = matchedZone.id;
          }
        }
        if (zoneId) {
          const partnerForZone = activePartners.find(p => (p as import('@/shared/types').DeliveryPartnerProfile).zoneIds?.includes(zoneId!));
          if (partnerForZone) {
            partnerId = partnerForZone.id;
          }
        }
      }
      

      // --------------------------------

      let optionLabel = '';
      const plan = mealPlans.find((p: import('@/shared/types').MealPlan) => p.id === subscription.planId);
      if (plan) {
        const slot = plan.mealSlots.find((s: import('@/shared/types').MealSlotConfig) => s.mealType === pref.mealType);
        let option = slot?.options?.find((o: import('@/shared/types').MealOption) => o.id === pref.selectedOptionId);
        if (!option && slot && slot.options && slot.options.length > 0) {
          option = slot.options[0];
        }
        if (option) optionLabel = ` (${option.label})`;
      }

      ordersToCreate.push({
        id: `ord_${subscription.id}_${date}_${pref.mealType}`,
        displayId: customer?.displayId || `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        source: 'subscription',
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        planTier: subscription.planTier,
        mealType: pref.mealType,
        date: date,
        itemsLabel: `Subscription - ${pref.mealType}${optionLabel}`,
        selectedOptionId: pref.selectedOptionId,
        price: Math.round((subscription.pricePerDaySnapshot * (subscription.quantity || 1)) / subscription.mealPreferences.length),
        currency: 'INR',
        status: 'scheduled',
        deliveryAddressId: subscription.deliveryAddressId,
        zoneId: zoneId,
        kitchenId: null,
        deliveryPartnerId: partnerId,
                deliveryWindow: null,
        paymentId: subscription.latestPaymentId,
      });
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

    // Notify kitchen staff
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

  /**
   * Standardize order lifecycle transitions
   */
  async updateOrderStatus(orderId: string, status: import('@/shared/types').OrderStatus): Promise<void> {
    if (!orderId || !status) {
      throw new Error('Order ID and Status are required.');
    }
    const order = await orderRepository.getById(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found.`);
    }
    if (order.status === status) {
      return; // Idempotency
    }
    await orderRepository.update(orderId, {
      status,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    });
    // Add additional workflow logic (e.g., notifications) here if needed later
  }
}

export const orderService = new OrderService();
