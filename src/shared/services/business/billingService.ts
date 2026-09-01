import { Timestamp, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { orderRepository } from '../firestore/orderRepository';
import { paymentRepository } from '../firestore/paymentRepository';
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

  async processSubscriptionEnd(subscription: Subscription, today: string, reason: 'expired' | 'cancelled' = 'expired'): Promise<void> {
    const effectiveEndDate = subscription.cancellationDate || subscription.endDate!;
    const invoiceId = `inv_${subscription.id}_${effectiveEndDate}`;
    const invoiceRef = doc(db, 'invoices', invoiceId);
    
    // We do NOT do a pre-check here anymore, the transaction handles idempotency

    const customerOrders = await orderRepository.getCustomerOrdersInRange(
      subscription.customerId,
      subscription.startDate,
      effectiveEndDate
    );
    
    // Calculate total bill for the ended cycle
    const terminalStatuses = ['skipped', 'cancelled', 'failed_delivery', 'returned_delivery'];
    const billableOrders = customerOrders.filter(
      (o) => o.subscriptionId === subscription.id && 
             !terminalStatuses.includes(o.status) && 
             o.date >= subscription.startDate && 
             o.date <= effectiveEndDate
    );
    
    const PRICING_MATRIX = {
      basic: {
        'breakfast': 60,
        'lunch': 65,
        'dinner': 65,
        'breakfast_lunch': 115,
        'lunch_dinner': 115,
        'breakfast_dinner': 115, 
        'breakfast_lunch_dinner': 159
      },
      regular: {
        'breakfast': 60,
        'lunch': 85,
        'dinner': 85,
        'breakfast_lunch': 140,
        'lunch_dinner': 140,  
        'breakfast_dinner': 140, 
        'breakfast_lunch_dinner': 210
      }
    };

    // Group by date
    const ordersByDate = new Map<string, typeof billableOrders>();
    billableOrders.forEach(o => {
      if (!ordersByDate.has(o.date)) ordersByDate.set(o.date, []);
      ordersByDate.get(o.date)!.push(o);
    });

    let totalAmount = 0;
    const tier = subscription.planTier as 'basic' | 'regular';
    const matrix = subscription.pricingMatrixSnapshot || PRICING_MATRIX[tier] || PRICING_MATRIX.basic;

    for (const [_, dailyOrders] of Array.from(ordersByDate.entries())) {
      const meals = dailyOrders.map(o => o.mealType);
      let key = '';
      if (meals.includes('breakfast') && meals.includes('lunch') && meals.includes('dinner')) {
        key = 'breakfast_lunch_dinner';
      } else if (meals.includes('breakfast') && meals.includes('lunch')) {
        key = 'breakfast_lunch';
      } else if (meals.includes('lunch') && meals.includes('dinner')) {
        key = 'lunch_dinner';
      } else if (meals.includes('breakfast') && meals.includes('dinner')) {
        key = 'breakfast_dinner';
      } else if (meals.includes('breakfast')) {
        key = 'breakfast';
      } else if (meals.includes('lunch')) {
        key = 'lunch';
      } else if (meals.includes('dinner')) {
        key = 'dinner';
      }

      if (key && (matrix as any)[key]) {
        totalAmount += (matrix as any)[key] * (subscription.quantity || 1);
      }
    }

    // 1b. Calculate verified payments
    const payments = await paymentRepository.getByCustomerId(subscription.customerId);
    const verifiedUsagePayments = payments.filter(p => p.subscriptionId === subscription.id && p.status === 'verified' && p.purpose !== 'security_deposit');
    const verifiedSecurityDeposits = payments.filter(p => p.subscriptionId === subscription.id && p.status === 'verified' && p.purpose === 'security_deposit');
    const paymentsTotal = verifiedUsagePayments.reduce((sum, p) => sum + p.amount, 0);
    const depositHeld = verifiedSecurityDeposits.reduce((sum, p) => sum + p.amount, 0);

    const balanceDue = totalAmount - paymentsTotal;

    const invoiceNumber = `INV-${subscription.customerId.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    
    // Start Transaction for Idempotency
    await runTransaction(db, async (txn) => {
      const existingInv = await txn.get(invoiceRef);
      if (existingInv.exists()) {
        console.log(`[BillingService] Invoice already exists for subscription ${subscription.id} ending on ${effectiveEndDate}`);
        return; // Idempotent block
      }
      
      txn.set(invoiceRef, {
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
          },
          {
            description: 'Less: Verified Payments Received',
            quantity: 1,
            unitPrice: -paymentsTotal,
            amount: -paymentsTotal
          }
        ],
        subtotal: totalAmount,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: balanceDue,
        depositHeld,
        currency: 'INR',
        status: balanceDue <= 0 ? 'paid' : 'issued',
        billingPeriodStart: subscription.startDate,
        billingPeriodEnd: effectiveEndDate,
        dueDate: today, // due immediately on generation
        paidAt: balanceDue <= 0 ? today : null,
        paymentId: null,
        createdAt: serverTimestamp() as unknown as Timestamp
      });

      // 2. Auto-renew or Expire (skip if manually cancelled)
      if (reason !== 'cancelled') {
        const subRef = doc(db, 'subscriptions', subscription.id);
        if (subscription.autoRenew) {
          // Calculate new dates
          let d = new Date(subscription.endDate!);
          let foundStart = false;
          while (!foundStart) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() !== 0) foundStart = true;
          }
          const nextStart = d.toISOString().split('T')[0];
          
          let durationDays = subscription.billingCycle === 'weekly' ? 6 : 29;
          let daysAdded = 0;
          let e = new Date(nextStart);
          while (daysAdded < durationDays) {
            e.setDate(e.getDate() + 1);
            if (e.getDay() !== 0) daysAdded++;
          }
          const nextEnd = e.toISOString().split('T')[0];

          txn.update(subRef, {
            startDate: nextStart,
            endDate: nextEnd,
            status: 'active',
            updatedAt: serverTimestamp() as unknown as Timestamp
          });
          
          console.log(`[BillingService] Auto-renewed subscription ${subscription.id}: ${nextStart} to ${nextEnd}`);
        } else {
          txn.update(subRef, {
            status: 'expired',
            updatedAt: serverTimestamp() as unknown as Timestamp
          });
          console.log(`[BillingService] Expired subscription ${subscription.id}`);
        }
      }
    });
  }
}

export const billingService = new BillingService();
