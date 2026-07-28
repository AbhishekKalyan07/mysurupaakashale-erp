import { Timestamp } from 'firebase/firestore';
import { getDoc, writeBatch, serverTimestamp, where, doc } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { orderRepository } from '../firestore/orderRepository';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { orderGenerationRunRepository } from '../firestore/analyticsRepository';
import { userRepository } from '../firestore/userRepository';
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
      // 2. Fetch all active subscriptions and delivery partners
      const [allSubscriptions, deliveryPartners] = await Promise.all([
        subscriptionRepository.list(where('status', '==', 'active')),
        userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true))
      ]);
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

          // Auto-assign delivery partner by zone
          let partnerId: string | null = null;
          if (sub.zoneId) {
            const matchingPartner = deliveryPartners.find(p => 
              p.role === 'delivery_partner' && p.zoneIds?.includes(sub.zoneId!)
            );
            if (matchingPartner) partnerId = matchingPartner.id;
          }

          // Generate order
          ordersToCreate.push({
            id: `ord_${sub.id}_${today}_${pref.mealType}`,
            source: 'subscription',
            customerId: sub.customerId,
            subscriptionId: sub.id,
            planTier: sub.planTier,
            mealType: pref.mealType,
            date: today,
            itemsLabel: `Subscription - ${pref.mealType}`,
            selectedOptionId: pref.selectedOptionId,
            price: sub.pricePerDaySnapshot,
            currency: 'INR',
            status: 'scheduled',
            deliveryAddressId: sub.deliveryAddressId,
            zoneId: sub.zoneId,
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

    // Fetch delivery partners for auto-assignment
    const deliveryPartners = await userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true));
    
    const ordersToCreate: Partial<Order>[] = [];

    for (const pref of subscription.mealPreferences) {
      if (!mealTypesToGenerate.includes(pref.mealType)) continue;

      let partnerId: string | null = null;
      if (subscription.zoneId) {
        const matchingPartner = deliveryPartners.find(p => 
          p.role === 'delivery_partner' && p.zoneIds?.includes(subscription.zoneId!)
        );
        if (matchingPartner) partnerId = matchingPartner.id;
      }

      ordersToCreate.push({
        id: `ord_${subscription.id}_${date}_${pref.mealType}`,
        source: 'subscription',
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        planTier: subscription.planTier,
        mealType: pref.mealType,
        date: date,
        itemsLabel: `Subscription - ${pref.mealType}`,
        selectedOptionId: pref.selectedOptionId,
        price: subscription.pricePerDaySnapshot,
        currency: 'INR',
        status: 'scheduled',
        deliveryAddressId: subscription.deliveryAddressId,
        zoneId: subscription.zoneId,
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
    await orderRepository.update(orderId, {
      status,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    });
    // Add additional workflow logic (e.g., notifications) here if needed later
  }
}

export const orderService = new OrderService();
