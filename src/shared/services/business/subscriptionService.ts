import { Timestamp } from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import { settingsRepository } from '../firestore/settingsRepository';
import type { MealPreference, PlanTier, Subscription } from '@/shared/types';

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
      zoneId: null,
      mealPreferences,
      startDate,
      endDate,
      billingCycle,
      autoRenew: true,
      deliveryAddressId,
      latestPaymentId: null,
      creditBalance: 0,
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
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    
    if (subscription.startDate <= today) {
      const mealTypes = subscription.mealPreferences.map(p => p.mealType);
      console.log(`[SubscriptionService] Subscription ${subscription.id} activated. Generating initial orders for today (${today})...`);
      
      try {
        await orderService.generateOrdersForSubscription(subscription, today, mealTypes);
      } catch (err) {
        console.error(`[SubscriptionService] Failed to generate initial orders for subscription ${subscription.id}:`, err);
      }
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
    await subscriptionRepository.updateStatus(subscription.id, 'cancelled');

    // Reject any pending payments associated with this subscription
    const { paymentRepository } = await import('../firestore/paymentRepository');
    const { payments } = await paymentRepository.getPaymentsPaginated({ status: 'pending' }, 100);
    const relatedPayments = payments.filter(p => p.subscriptionId === subscription.id);
    
    for (const payment of relatedPayments) {
      await paymentRepository.update(payment.id, { status: 'rejected', verificationNotes: 'Subscription draft was cancelled by the customer or admin.' });
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
    await subscriptionRepository.update(subscription.id, {
      status: shouldPauseNow ? 'paused' : 'active',
      pauseStartDate,
      pauseEndDate,
    });
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
