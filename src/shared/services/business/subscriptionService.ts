import { Timestamp, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { getTodayInTimezone } from '@/shared/lib/date';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { db } from "@/shared/lib/firebase";
import { settingsRepository } from '../firestore/settingsRepository';
import { orderService } from './orderService';
import type { MealPreference, PlanTier, Subscription, MealPlanPricing } from '@/shared/types';

class SubscriptionService {
  /**
   * Create a new subscription draft.
   */
  async createSubscription(
    customerId: string,
    planId: string,
    planTier: PlanTier,
    quantity: number,
    pricePerDaySnapshot: number,
    pricingMatrixSnapshot: MealPlanPricing,
    mealPreferences: MealPreference[],
    startDate: string,
    deliveryAddressId: string,
    billingCycle: 'weekly' | 'monthly',
    endDate: string | null
  ): Promise<string> {
    if (!customerId || !planId || !planTier || quantity <= 0 || !startDate || !deliveryAddressId) {
      throw new Error('Invalid subscription data: Missing required fields or invalid quantity.');
    }
    if (!mealPreferences || mealPreferences.length === 0) {
      throw new Error('At least one meal preference is required.');
    }

    const subscriptionId = crypto.randomUUID();
    const settings = await settingsRepository.getBusinessSettings();
    const depositAmount = settings?.pricing.securityDepositAmount || 1000;
    
    await subscriptionRepository.create({
      customerId,
      planId,
      status: 'pending_payment',
      planTier,
      quantity,
      pricePerDaySnapshot,
      pricingMatrixSnapshot,
      zoneId: null,
      mealPreferences,
      startDate,
      endDate,
      billingCycle,
      autoRenew: true,
      deliveryAddressId,
      latestPaymentId: null,
      depositAmount,
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    }, subscriptionId);
    
    return subscriptionId;
  }

  /**
   * Admin fast-path activation for a subscription that's still in
   * 'draft' or 'pending_payment'
   */
  async approveSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error('Valid subscription object is required.');
    }
    if (subscription.status === 'active') {
      return; // Idempotency: Already active
    }
    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      throw new Error(`Cannot approve a ${subscription.status} subscription — use renew instead.`);
    }
    await subscriptionRepository.updateStatus(subscription.id, 'active');

    // Verify any pending payments associated with this subscription
    const { paymentRepository } = await import('../firestore/paymentRepository');
    const { payments } = await paymentRepository.getPaymentsPaginated({ status: 'pending' }, 100);
    const relatedPayments = payments.filter(p => p.subscriptionId === subscription.id);
    
    for (const payment of relatedPayments) {
      await paymentRepository.update(payment.id, { status: 'verified', verificationNotes: 'Verified via subscription fast-path activation.' });
    }

    // Immediately generate orders for today if the subscription starts today or earlier
    const { orderService } = await import('./orderService');
    const today = getTodayInTimezone();
    
    if (subscription.startDate <= today) {
      const mealTypes = (subscription.mealPreferences || []).map(p => p.mealType);
      console.log(`[SubscriptionService] Subscription ${subscription.id} activated. Generating initial orders for today (${today})...`);
      
      try {
        await orderService.generateOrdersForSubscription(subscription, today, mealTypes);
      } catch (err) {
        console.error(`[SubscriptionService] Failed to generate initial orders for subscription ${subscription.id}:`, err);
      }
    }

    try {
      const { notifySubscriptionApproved } = await import('../firestore/notificationService');
      const { auditRepository } = await import('../firestore/auditRepository');
      const { auth } = await import('@/shared/lib/firebase');
      await notifySubscriptionApproved(
        subscription.customerId,
        subscription.id,
        subscription.planTier,
        subscription.startDate
      );
      await auditRepository.logAction(
        'subscription_approved',
        auth.currentUser?.uid || 'system',
        'Admin',
        subscription.id,
        'subscription'
      );
    } catch (err) {
      console.warn('[SubscriptionService] Failed to send notification or audit:', err);
    }
  }

  /** Cancels a subscription and rejects any pending payments. */
  async rejectSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error('Valid subscription object is required.');
    }
    if (subscription.status === 'cancelled') {
      return; // Idempotency
    }
    const { getTodayInTimezone } = await import('@/shared/lib/date');
    await subscriptionRepository.update(subscription.id, { 
      status: 'cancelled',
      cancellationDate: getTodayInTimezone()
    });

    // Reject any pending payments associated with this subscription
    const { paymentRepository } = await import('../firestore/paymentRepository');
    const { payments } = await paymentRepository.getPaymentsPaginated({ status: 'pending' }, 100);
    const relatedPayments = payments.filter(p => p.subscriptionId === subscription.id);
    
    for (const payment of relatedPayments) {
      await paymentRepository.update(payment.id, { status: 'rejected', verificationNotes: 'Subscription draft was cancelled by the customer or admin.' });
    }

    // Unify natural expiry + manual cancellation settlement
    if (subscription.status === 'active' || subscription.status === 'paused') {
      const { billingService } = await import('./billingService');
      const today = getTodayInTimezone();
      try {
        await billingService.processSubscriptionEnd(subscription, today, 'cancelled');
      } catch (err) {
        console.error(`[SubscriptionService] Failed to process final settlement for cancelled subscription ${subscription.id}:`, err);
      }
    }
  }

  /** Admin override of the customer's own pause action, with optional schedule. */
  async pauseSubscription(
    subscription: Subscription, 
    shouldPauseNow: boolean = true, 
    pauseStartDate: string | null = null, 
    pauseEndDate: string | null = null
  ): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error('Valid subscription object is required.');
    }
    if (subscription.status !== 'active' && subscription.status !== 'paused' && shouldPauseNow) {
      throw new Error('Only an active or already paused subscription can be paused immediately.');
    }
    if (subscription.status === 'paused' && shouldPauseNow && subscription.pauseStartDate === pauseStartDate && subscription.pauseEndDate === pauseEndDate) {
      return; // Idempotency
    }
    const batch = writeBatch(db);
    const subRef = doc(db, 'subscriptions', subscription.id);
    batch.update(subRef, {
      status: shouldPauseNow ? 'paused' : 'active',
      pauseStartDate,
      pauseEndDate,
    });

    if (shouldPauseNow) {
      const today = getTodayInTimezone();
      const cancelledOrders = await orderService.appendCancelOrdersToBatch(
        batch,
        subscription.id,
        subscription.customerId,
        today,
        ['breakfast', 'lunch', 'dinner'] // Cancel all eligible meals for today
      );

      await batch.commit();

      if (cancelledOrders.length > 0) {
        import('@/shared/services/firestore/auditRepository').then(m => {
          cancelledOrders.forEach(o => {
            m.auditRepository.logAction('meal_cancelled', subscription.customerId, 'Customer', o.id!, 'order', {
              date: today,
              mealType: o.mealType
            }).catch(console.error);
          });
        }).catch(console.error);
      }
    } else {
      await batch.commit();
    }
  }

  /** Admin override of the customer's own resume action, clearing any schedules. */
  async resumeSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error('Valid subscription object is required.');
    }
    if (subscription.status === 'active' && !subscription.pauseStartDate && !subscription.pauseEndDate) {
      return; // Idempotency
    }
    await subscriptionRepository.update(subscription.id, {
      status: 'active',
      pauseStartDate: null,
      pauseEndDate: null,
    });
  }
}

export const subscriptionService = new SubscriptionService();
