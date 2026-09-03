import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import type { Subscription } from './types';

import { getApps, initializeApp } from 'firebase-admin/app';

const getDb = () => {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
};
export class BillingService {
  /**
   * Process daily billing and auto-renewals.
   * Runs daily to catch subscriptions whose cycle has ended.
   */
  async processDailyBilling(today: string): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // 1. Fetch active and paused subscriptions
      const repoMod = await import('./repositories');
      const allSubs = await repoMod.subscriptionRepository.list();
      const subscriptions = allSubs.filter(sub => sub.status === 'active' || sub.status === 'paused');

      for (const sub of subscriptions) {
        if (!sub.endDate || sub.endDate >= today) continue;

        // The subscription cycle ended yesterday or earlier
        try {
          await this.processSubscriptionEnd(sub, today);
          processed++;
        } catch (err) {
          logger.error(`[BillingService] Error processing subscription ${sub.id}:`, err);
          errors++;
        }
      }
    } catch (err) {
      logger.error('[BillingService] Failed to list subscriptions for billing:', err);
    }

    return { processed, errors };
  }

  async processSubscriptionEnd(subscription: Subscription, today: string, reason: 'expired' | 'cancelled' = 'expired'): Promise<void> {
    const effectiveEndDate = subscription.cancellationDate || subscription.endDate!;
    const invoiceId = `inv_${subscription.id}_${effectiveEndDate}`;
    
    // Fetch customer orders in range
    const repoMod = await import('./repositories');
    const customerOrders = await repoMod.orderRepository.getCustomerOrdersInRange(
      subscription.customerId, 
      subscription.startDate, 
      effectiveEndDate
    );
    
    // Calculate total bill for the ended cycle
    const terminalStatuses = ['scheduled', 'skipped', 'cancelled', 'failed_delivery', 'returned_delivery'];
    const billableOrders = customerOrders.filter(
      (o: any) => o.subscriptionId === subscription.id && 
             !terminalStatuses.includes(o.status)
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
    const payments = await repoMod.paymentRepository.getByCustomerId(subscription.customerId);
    
    const verifiedUsagePayments = payments.filter((p: any) => p.subscriptionId === subscription.id && p.status === 'verified' && p.purpose !== 'security_deposit');
    const verifiedSecurityDeposits = payments.filter((p: any) => p.subscriptionId === subscription.id && p.status === 'verified' && p.purpose === 'security_deposit');
    const paymentsTotal = verifiedUsagePayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const depositHeld = verifiedSecurityDeposits.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const balanceDue = totalAmount - paymentsTotal;

    const invoiceNumber = `INV-${subscription.customerId.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    
    // Start Transaction for Idempotency
    await repoMod.transactionRepository.runTransaction(async (txn) => {
      const existingInv = await txn.get({ path: `invoices/${invoiceId}` });
      if (existingInv && Object.keys(existingInv).length > 0) {
        logger.info(`[BillingService] Invoice already exists for subscription ${subscription.id} ending on ${effectiveEndDate}`);
        return; // Idempotent block
      }
      
      txn.set({ path: `invoices/${invoiceId}` }, {
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
            description: 'Payments Received',
            quantity: 1,
            unitPrice: -paymentsTotal,
            amount: -paymentsTotal
          }
        ],
        subtotal: totalAmount,
        tax: 0,
        depositHeld,
        totalAmount: balanceDue,
        status: balanceDue > 0 ? (reason === 'cancelled' ? 'void' : 'pending') : 'paid',
        dueDate: effectiveEndDate, // Due on the last day of cycle
        billingPeriodEnd: effectiveEndDate,
      });

      // Also mark the subscription as expired or cancelled in DB if not already
      txn.update({ path: `subscriptions/${subscription.id}` }, {
        status: reason === 'cancelled' ? 'cancelled' : 'expired',
      });
    });
    
    logger.info(`[BillingService] ${reason === 'cancelled' ? 'Cancelled' : 'Expired'} subscription ${subscription.id}`);
  }
}

export const billingService = new BillingService();
