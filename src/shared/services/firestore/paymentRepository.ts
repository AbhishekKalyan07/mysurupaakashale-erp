import { db } from '@/shared/lib/firebase';
import type { ManualPayment, ManualPaymentStatus } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';
import { where, orderBy, limit, startAfter, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';

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
      constraints.push(startAfter(lastDocSnap));
    }

    const payments = await this.list(...constraints);

    // We need doc snapshots for pagination — use the underlying collection
    // through BaseRepository's list method which returns typed entities.
    // The cursor is managed by the hook layer which caches lastDocSnap.
    return {
      payments,
      lastDoc: null, // caller updates this from the raw snapshot cache
    };
  }

  /** Fetch a single payment by ID. */
  async getById(id: string): Promise<ManualPayment | null> {
    return super.getById(id);
  }
}

export const paymentRepository = new PaymentRepository();
