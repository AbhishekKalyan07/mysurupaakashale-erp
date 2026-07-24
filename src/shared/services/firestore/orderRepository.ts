import { Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { auth } from '@/shared/lib/firebase';
import type { Order, OrderStatus, MealType, OrderWorkflowHistory } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';
import { collection, query, where, orderBy, getDocs, onSnapshot, doc, runTransaction, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
/**
 * Client-side repository for the `orders` collection.
 *
 * Kitchen operations read ONLY from this repository — never from `subscriptions`.
 * Delivery and Accounts modules also consume this same repository.
 * The `orders` collection is the single operational source of truth after
 * `generateDailyOrders` runs each morning.
 */
class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super(db, 'orders', createConverter<Order>());
  }

  /**
   * All orders for a given ISO date string (YYYY-MM-DD).
   * Used by the Kitchen Dashboard and Production Board.
   */
  async getByDate(date: string): Promise<Order[]> {
    return this.list(where('date', '==', date), orderBy('mealType', 'asc'));
  }

  /**
   * Orders for a date filtered by one or more statuses.
   * Used by status-specific panels on the Kitchen Dashboard.
   */
  async getByDateAndStatus(date: string, status: OrderStatus): Promise<Order[]> {
    return this.list(
      where('date', '==', date),
      where('status', '==', status),
      orderBy('mealType', 'asc')
    );
  }

  /**
   * Live real-time subscription to all orders for a given date.
   * Returns an `Unsubscribe` function — call it in the hook's cleanup.
   * Used by the Kitchen Dashboard for live updates without polling.
   */
  subscribeToDayOrders(
    date: string,
    onNext: (orders: Order[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.subscribeToList(onNext, onError, where('date', '==', date));
  }

  /**
   * All orders for a date filtered by meal type.
   * Used by useBreakfastOrders / useLunchOrders / useDinnerOrders for
   * targeted one-time fetches when the live subscription hasn't hydrated yet.
   */
  async getByDateAndMealType(date: string, mealType: MealType): Promise<Order[]> {
    return this.list(
      where('date', '==', date),
      where('mealType', '==', mealType),
      orderBy('routeSequence', 'asc')
    );
  }

  /**
   * Batch create multiple orders. Used by the daily order generation script.
   */
  async batchCreate(orders: Omit<Order, 'id'>[]): Promise<void> {
    const { writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    
    for (const orderData of orders) {
      const orderId = crypto.randomUUID();
      const ref = doc(this.collectionRef, orderId);
      batch.set(ref, { ...orderData, id: orderId } as Order);
    }
    
    await batch.commit();
  }

  /**
   * Live real-time subscription scoped to a single meal type.
   * The Production Board mounts three of these (one per section) so a status
   * update on a breakfast order invalidates only the breakfast cache — not
   * lunch or dinner — avoiding unnecessary re-renders for unaffected sections.
   */
  subscribeToDayMealTypeOrders(
    date: string,
    mealType: MealType,
    onNext: (orders: Order[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.subscribeToList(
      onNext,
      onError,
      where('date', '==', date),
      where('mealType', '==', mealType)
    );
  }

  /**
   * Retrieves the workflow history for a specific order.
   */
  async getWorkflowHistory(orderId: string): Promise<OrderWorkflowHistory[]> {
    const historyRef = collection(db, 'orders', orderId, 'workflowHistory');
    const q = query(historyRef, orderBy('changedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as OrderWorkflowHistory[];
  }

  /**
   * Subscribes to the workflow history for a specific order.
   */
  subscribeWorkflowHistory(
    orderId: string,
    onNext: (history: OrderWorkflowHistory[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const historyRef = collection(db, 'orders', orderId, 'workflowHistory');
    const q = query(historyRef, orderBy('changedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const history = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as OrderWorkflowHistory[];
        onNext(history);
      },
      onError
    );
  }

  /**
   * Advances the workflow status of an order via Cloud Function.
   */
  async updateWorkflow(orderId: string, newStatus: string, notes?: string): Promise<void> {
    // Phase 7: Client-side workflow update with history tracking
    await runTransaction(db, async (t) => {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await t.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found');
      
      const oldData = snap.data() as Order;
      
      t.update(orderRef, {
        status: newStatus,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp
      } as Partial<Order>);
      
      const historyRef = doc(collection(db, 'orders', orderId, 'workflowHistory'));
      t.set(historyRef, {
        fromStatus: oldData.status,
        toStatus: newStatus,
        notes: notes || null,
        changedAt: serverTimestamp(),
        // Bug #5 fix: record the real authenticated UID instead of the
        // hardcoded 'user' placeholder that was committed to production.
        changedBy: auth.currentUser?.uid ?? 'unknown',
      });
    });
  }
}

export const orderRepository = new OrderRepository();
