import { db } from '@/shared/lib/firebase';
import type { Subscription } from '@/shared/types/subscription.types';
import { BaseRepository, createConverter } from './BaseRepository';
import { where } from 'firebase/firestore';

class SubscriptionRepository extends BaseRepository<Subscription> {
  constructor() {
    super(db, 'subscriptions', createConverter<Subscription>());
  }

  async getByCustomerId(customerId: string): Promise<Subscription[]> {
    return this.list(where('customerId', '==', customerId));
  }

  async getActiveSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
    const subs = await this.list(
      where('customerId', '==', customerId),
      where('status', 'in', ['active', 'pending_payment'])
    );
    // Return active one if it exists, otherwise pending_payment, or just the first one found
    const active = subs.find(s => s.status === 'active');
    if (active) return active;
    return subs.length > 0 ? subs[0] : null;
  }
}

export const subscriptionRepository = new SubscriptionRepository();
