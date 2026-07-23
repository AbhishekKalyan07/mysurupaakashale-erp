import { serverTimestamp } from 'firebase/firestore';
import { subscriptionRepository } from '../firestore/subscriptionRepository';
import type { MealPreference, PlanTier } from '@/shared/types';

class SubscriptionService {
  /**
   * Create a new subscription draft.
   */
  async createSubscription(
    customerId: string,
    planId: string,
    planTier: PlanTier,
    pricePerDaySnapshot: number,
    mealPreferences: MealPreference[],
    startDate: string,
    deliveryAddressId: string,
  ): Promise<string> {
    const subscriptionId = crypto.randomUUID();
    
    await subscriptionRepository.create({
      customerId,
      planId,
      status: 'pending_payment',
      planTier,
      pricePerDaySnapshot,
      zoneId: null,
      mealPreferences,
      startDate,
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      deliveryAddressId,
      latestPaymentId: null,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    }, subscriptionId);
    
    return subscriptionId;
  }
}

export const subscriptionService = new SubscriptionService();
