import { Timestamp, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { orderRepository } from '../firestore/orderRepository';
import type { Subscription } from '@/shared/types';

class BillingService {
  /**
   * Process daily billing and auto-renewals.
   * Runs daily to catch subscriptions whose cycle has ended.
   */
  async processDailyBilling(today: string): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // 1. Fetch active and paused subscriptions
      const subscriptions = await subscriptionRepository.list();
      const activeOrPaused = subscriptions.filter(sub => sub.status === 'active' || sub.status === 'paused');

      for (const sub of activeOrPaused) {
        if (!sub.endDate || sub.endDate >= today) continue;

        // The subscription cycle ended yesterday or earlier
        try {
          await this.processSubscriptionEnd(sub, today);
          processed++;
        } catch (err) {
          console.error(`[BillingService] Error processing subscription ${sub.id}:`, err);
          errors++;
        }
      }
    } catch (err) {
      console.error('[BillingService] Failed to list subscriptions for billing:', err);
    }

    return { processed, errors };
  }

  private async processSubscriptionEnd(subscription: Subscription, today: string): Promise<void> {
    const customerOrders = await orderRepository.getCustomerOrders(subscription.customerId);
    
    // Calculate total bill for the ended cycle
    const cycleOrders = customerOrders.filter(
      (o) => o.subscriptionId === subscription.id && 
             o.status !== 'cancelled' && 
             o.date >= subscription.startDate && 
             o.date <= subscription.endDate!
    );
    
    const totalAmount = cycleOrders.reduce((sum, order) => sum + (order.price || 0), 0);

    const batch = writeBatch(db);

    // 1. Generate Invoice
    const invoiceId = crypto.randomUUID();
    const invoiceNumber = `INV-${subscription.customerId.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    
    const invoiceRef = doc(db, 'invoices', invoiceId);
    batch.set(invoiceRef, {
      id: invoiceId,
      invoiceNumber,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      lineItems: [
        {
          description: `${subscription.planTier.toUpperCase()} Plan (${subscription.billingCycle})`,
          quantity: 1,
          unitPrice: totalAmount,
          amount: totalAmount
        }
      ],
      subtotal: totalAmount,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: totalAmount,
      currency: 'INR',
      status: 'issued',
      billingPeriodStart: subscription.startDate,
      billingPeriodEnd: subscription.endDate!,
      dueDate: today, // due immediately on generation
      paidAt: null,
      paymentId: null,
      createdAt: serverTimestamp() as unknown as Timestamp
    });

    // 2. Auto-renew or Expire
    const subRef = doc(db, 'subscriptions', subscription.id);
    
    if (subscription.autoRenew) {
      // Calculate new dates
      let d = new Date(subscription.endDate!);
      let foundStart = false;
      
      // Find next valid start date (skip Sundays)
      while (!foundStart) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) foundStart = true;
      }
      const newStartDate = d.toISOString().split('T')[0];

      // Calculate new end date
      const activeDaysToAdd = subscription.billingCycle === 'weekly' ? 7 : 30;
      let remainingDaysToAdd = activeDaysToAdd - 1; // start date is day 1

      while (remainingDaysToAdd > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) remainingDaysToAdd--;
      }
      const newEndDate = d.toISOString().split('T')[0];

      batch.update(subRef, {
        startDate: newStartDate,
        endDate: newEndDate,
        updatedAt: serverTimestamp() as unknown as Timestamp
        // Status remains 'active'
      });
      console.log(`[BillingService] Auto-renewed subscription ${subscription.id} for cycle ${newStartDate} to ${newEndDate}`);
    } else {
      batch.update(subRef, {
        status: 'expired',
        updatedAt: serverTimestamp() as unknown as Timestamp
      });
      console.log(`[BillingService] Expired subscription ${subscription.id} (autoRenew is false)`);
    }

    await batch.commit();
  }
}

export const billingService = new BillingService();
