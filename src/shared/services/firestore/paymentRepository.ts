import { db } from '@/shared/lib/firebase';
import type { ManualPayment, ManualPaymentStatus } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';
import { where, orderBy, limit, startAfter, getDocs, query, collection,
         type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';

export interface PaymentFilter {
  status?: ManualPaymentStatus;
  customerId?: string;
}

class PaymentRepository extends BaseRepository<ManualPayment> {
  constructor() {
    super(db, 'payments', createConverter<ManualPayment>());
  }

  /** All payments for a single customer, newest first. */
  async getByCustomerId(customerId: string): Promise<ManualPayment[]> {
    return this.list(
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    );
  }

  /** Real-time subscription to customer payments. */
  subscribeToCustomerPayments(
    customerId: string, 
    onNext: (payments: ManualPayment[]) => void, 
    onError?: (error: Error) => void
  ) {
    return this.subscribeToList(
      onNext, 
      onError,
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
  }

  /**
   * Cursor-paginated list for the admin verification table.
   * Supports status filter and customer filter independently.
   */
  async getPaymentsPaginated(
    filter: PaymentFilter,
    pageSize: number = 20,
    lastDocSnap?: QueryDocumentSnapshot<ManualPayment>,
  ): Promise<{ payments: ManualPayment[]; lastDoc: QueryDocumentSnapshot<ManualPayment> | null }> {
    const constraints: QueryConstraint[] = [];

    if (filter.status) {
      constraints.push(where('status', '==', filter.status));
    }
    if (filter.customerId) {
      constraints.push(where('customerId', '==', filter.customerId));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(pageSize));

    if (lastDocSnap) {
      // Bug #9 fix: startAfter must come AFTER orderBy + limit in the
      // constraints array so Firestore builds the cursor query correctly.
      constraints.push(startAfter(lastDocSnap));
    }

    // Bug #9 fix: use getDocs directly instead of BaseRepository.list() so
    // we retain access to the raw QueryDocumentSnapshot needed for the cursor.
    // BaseRepository.list() maps snapshots to typed entities and discards them,
    // making it impossible to return lastDoc to the caller.
    const converter = createConverter<ManualPayment>();
    const colRef = collection(db, 'payments').withConverter(converter);
    const snapshot = await getDocs(query(colRef, ...constraints));

    const payments = snapshot.docs.map(d => d.data());
    return {
      payments,
      lastDoc: snapshot.docs.length === pageSize
        ? (snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<ManualPayment>)
        : null,
    };
  }

  /** Fetch a single payment by ID. */
  async getById(id: string): Promise<ManualPayment | null> {
    return super.getById(id);
  }

}

export const paymentRepository = new PaymentRepository();
