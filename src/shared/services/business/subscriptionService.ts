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
  ): Promise<string> {
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
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      deliveryAddressId,
      latestPaymentId: null,
      creditBalance: 0,
      depositAmount,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    }, subscriptionId);
    
    return subscriptionId;
  }

  /**
   * Admin fast-path activation for a subscription that's still in
   * 'draft' or 'pending_payment' (e.g. payment confirmed by another
   * channel — cash handed over in person, a phone confirmation — without
   * a formal payment record). For the normal flow where a customer
   * submitted a payment screenshot, prefer paymentService.approvePayment(),
   * which also verifies the payment record and generates the invoice.
   */
  async approveSubscription(subscription: Subscription): Promise<void> {
    if (subscription.status === 'active') {
      throw new Error('Subscription is already active.');
    }
    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      throw new Error(`Cannot approve a ${subscription.status} subscription — use renew instead.`);
    }
    await subscriptionRepository.updateStatus(subscription.id, 'active');
  }

  /** Declines a subscription still awaiting its first payment. */
  async rejectSubscription(subscription: Subscription): Promise<void> {
    if (subscription.status !== 'pending_payment' && subscription.status !== 'draft') {
      throw new Error(`Cannot reject a subscription with status "${subscription.status}".`);
    }
    await subscriptionRepository.updateStatus(subscription.id, 'cancelled');
  }

  /** Admin override of the customer's own pause action. */
  async pauseSubscription(subscription: Subscription): Promise<void> {
    if (subscription.status !== 'active') {
      throw new Error('Only an active subscription can be paused.');
    }
    await subscriptionRepository.updateStatus(subscription.id, 'paused');
  }

  /** Admin override of the customer's own resume action. */
  async resumeSubscription(subscription: Subscription): Promise<void> {
    if (subscription.status !== 'paused') {
      throw new Error('Only a paused subscription can be resumed.');
    }
    await subscriptionRepository.updateStatus(subscription.id, 'active');
  }
}

export const subscriptionService = new SubscriptionService();
