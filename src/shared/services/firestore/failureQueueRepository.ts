import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import { serverTimestamp, type Timestamp } from 'firebase/firestore';

export interface FailureQueueRecord {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  orderId?: string | null;
  mealType: string;
  date: string;
  attempts: number;
  reason: string;
  stackTrace?: string;
  status: 'pending' | 'resolved' | 'ignored';
  createdAt: Timestamp;
  lastRetryAt?: Timestamp;
  resolvedAt?: Timestamp;
  retryCount: number;
  resolvedBy?: string;
}

class FailureQueueRepository extends BaseRepository<FailureQueueRecord> {
  constructor() {
    super(db, 'failureQueue', createConverter<FailureQueueRecord>());
  }

  async logFailure(
    customerId: string,
    subscriptionId: string | null,
    mealType: string,
    date: string,
    reason: string,
    stackTrace?: string
  ): Promise<string> {
    const id = await this.create({
      customerId,
      subscriptionId,
      mealType,
      date,
      reason,
      stackTrace,
      attempts: 1,
      retryCount: 0,
      status: 'pending',
      createdAt: serverTimestamp() as Timestamp,
    });
    
    return id;
  }
}

export const failureQueueRepository = new FailureQueueRepository();
