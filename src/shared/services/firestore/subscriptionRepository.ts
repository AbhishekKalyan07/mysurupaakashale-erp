import { Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Subscription, SubscriptionStatus } from '@/shared/types/subscription.types';
import { BaseRepository, createConverter } from './BaseRepository';
import {
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  query,
  collection,
  doc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export interface SubscriptionFilter {
  status?: SubscriptionStatus;
}

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
      where('status', 'in', ['active', 'pending_payment', 'paused'])
    );
    // Return active or paused if it exists, otherwise pending_payment, or just the first one found
    const activeOrPaused = subs.find(s => s.status === 'active' || s.status === 'paused');
    if (activeOrPaused) return activeOrPaused;
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
    // Create the skip subcollection document
    const skipRef = doc(db, 'subscriptions', subscriptionId, 'skips', date);
    await setDoc(skipRef, {
      date,
      mealTypes,
      reason,
      createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      createdBy: uid
    });

    // Increment the credit balance on the subscription
    const subRef = doc(db, 'subscriptions', subscriptionId);
    await updateDoc(subRef, {
      creditBalance: increment(creditAmount)
    });
  }

  async getSkips(subscriptionId: string): Promise<any[]> {
    const skipsRef = collection(db, 'subscriptions', subscriptionId, 'skips');
    const snapshot = await getDocs(query(skipsRef, orderBy('date', 'desc')));
    return snapshot.docs.map(d => d.data());
  }

  /**
   * Cursor-paginated list for the admin subscriptions table.
   * Mirrors paymentRepository.getPaymentsPaginated — same shape, same
   * ordering, same cursor convention — so the admin hooks/pages that
   * consume both feel consistent.
   *
   * Requires a `subscriptions` composite index on (status ASC, createdAt
   * DESC) when `filter.status` is provided — see firestore.indexes.json.
   */
  async getSubscriptionsPaginated(
    filter: SubscriptionFilter,
    pageSize: number = 20,
    lastDocSnap?: QueryDocumentSnapshot<Subscription>,
  ): Promise<{ subscriptions: Subscription[]; lastDoc: QueryDocumentSnapshot<Subscription> | null }> {
    const constraints: QueryConstraint[] = [];

    if (filter.status) {
      constraints.push(where('status', '==', filter.status));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(pageSize));

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const converter = createConverter<Subscription>();
    const colRef = collection(db, 'subscriptions').withConverter(converter);
    const snapshot = await getDocs(query(colRef, ...constraints));

    const subscriptions = snapshot.docs.map((d) => d.data());
    return {
      subscriptions,
      lastDoc: snapshot.docs.length === pageSize
        ? (snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<Subscription>)
        : null,
    };
  }

  /** All subscriptions, newest first. For small admin exports — prefer getSubscriptionsPaginated for the table UI. */
  async getAllSubscriptions(): Promise<Subscription[]> {
    return this.list(orderBy('createdAt', 'desc'));
  }

  /** Admin-only status transition (create/reject/pause/resume). Firestore rules still gate this to isAdmin(). */
  async updateStatus(subscriptionId: string, status: SubscriptionStatus): Promise<void> {
    await updateDoc(doc(db, 'subscriptions', subscriptionId), {
      status,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    });
  }
}

export const subscriptionRepository = new SubscriptionRepository();
