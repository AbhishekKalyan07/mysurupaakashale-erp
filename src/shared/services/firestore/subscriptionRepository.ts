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

  async addSkip(
    subscriptionId: string, 
    date: string, 
    mealTypes: ('breakfast' | 'lunch' | 'dinner')[], 
    reason: string,
    uid: string,
    creditAmount: number
  ) {
    const { doc, setDoc, updateDoc, increment, serverTimestamp } = require('firebase/firestore');
    
    // Create the skip subcollection document
    const skipRef = doc(db, 'subscriptions', subscriptionId, 'skips', date);
    await setDoc(skipRef, {
      date,
      mealTypes,
      reason,
      createdAt: serverTimestamp(),
      createdBy: uid
    });

    // Increment the credit balance on the subscription
    const subRef = doc(db, 'subscriptions', subscriptionId);
    await updateDoc(subRef, {
      creditBalance: increment(creditAmount)
    });
  }
}

export const subscriptionRepository = new SubscriptionRepository();
