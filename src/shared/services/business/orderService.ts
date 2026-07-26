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

    try {
      // 2. Fetch all active subscriptions
      const allSubscriptions = await subscriptionRepository.list(where('status', '==', 'active'));
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
            deliveryPartnerId: null,
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
