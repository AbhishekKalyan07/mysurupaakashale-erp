import { Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { ProductionSummary } from '../business/productionService';

export type ProductionStatus = 'open' | 'locked' | 'closed';

/**
 * A daily snapshot of production totals.
 * This is permanently stored when production is locked,
 * enabling fast historical analytics without re-scanning thousands of orders.
 */
export interface ProductionSnapshot extends ProductionSummary {
  date: string;
  version: number;
}

/**
 * Represents the daily operational lifecycle of the ERP.
 * Currently focuses on Kitchen locking, but schema supports 
 * expanding to dispatch, reports, and accounts.
 */
export interface DailyProductionState {
  id: string; // The local date string, e.g. '2026-07-31'
  status: ProductionStatus;
  
  // Locking Metadata
  lockedAt: Timestamp | null;
  lockedBy: string | null;
  
  // Unlocking Metadata
  unlockedAt: Timestamp | null;
  unlockedBy: string | null;
  unlockReason: string | null;
  
  // Future Expansion
  closedAt: Timestamp | null;
  closedBy: string | null;
  
  // The captured metrics
  snapshot: ProductionSnapshot | null;
  
  // Reopening Metadata
  reopenedAt: Timestamp | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

class DailyProductionRepository extends BaseRepository<DailyProductionState> {
  constructor() {
    super(db, 'dailyProductionStates', createConverter<DailyProductionState>());
  }

  /**
   * Subscribes to the daily state. 
   * If the document doesn't exist yet, it returns a default "open" state.
   */
  subscribeToState(
    date: string,
    onNext: (state: DailyProductionState) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const docRef = doc(this.collectionRef, date);
    
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          onNext(snap.data());
        } else {
          // Virtual default state
          onNext({
            id: date,
            status: 'open',
            lockedAt: null,
            lockedBy: null,
            unlockedAt: null,
            unlockedBy: null,
            unlockReason: null,
            closedAt: null,
            closedBy: null,
            reopenedAt: null,
            reopenedBy: null,
            reopenReason: null,
            snapshot: null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        }
      },
      onError
    );
  }

  /**
   * Fetch once. Returns default if not exists.
   */
  async getState(date: string): Promise<DailyProductionState> {
    const docRef = doc(this.collectionRef, date);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data();
    
    return {
      id: date,
      status: 'open',
      lockedAt: null,
      lockedBy: null,
      unlockedAt: null,
      unlockedBy: null,
      unlockReason: null,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      snapshot: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  }

  /**
   * Locks production and commits the snapshot.
   */
  async lockProduction(date: string, userId: string, snapshot: ProductionSnapshot): Promise<void> {
    const docRef = doc(this.collectionRef, date);
    const state = await this.getState(date);
    
    const update: DailyProductionState = {
      ...state,
      status: 'locked',
      lockedAt: Timestamp.now(),
      lockedBy: userId,
      snapshot,
      updatedAt: Timestamp.now(),
    };

    await setDoc(docRef, update, { merge: true });
  }

  /**
   * Unlocks production, requiring a reason for the audit trail.
   */
  async unlockProduction(date: string, userId: string, reason: string): Promise<void> {
    const docRef = doc(this.collectionRef, date);
    const state = await this.getState(date);
    
    const update: DailyProductionState = {
      ...state,
      status: 'open',
      unlockedAt: Timestamp.now(),
      unlockedBy: userId,
      unlockReason: reason,
      updatedAt: Timestamp.now(),
    };

    await setDoc(docRef, update, { merge: true });
  }

  /**
   * Closes the day operations.
   * Can only be called when the day is locked.
   */
  async closeDay(date: string, userId: string): Promise<void> {
    const docRef = doc(this.collectionRef, date);
    const state = await this.getState(date);
    
    if (state.status !== 'locked') {
      throw new Error("Day must be locked before it can be closed.");
    }

    const update: DailyProductionState = {
      ...state,
      status: 'closed',
      closedAt: Timestamp.now(),
      closedBy: userId,
      updatedAt: Timestamp.now(),
    };

    await setDoc(docRef, update, { merge: true });
  }

  /**
   * Reopens a closed day. Requires a reason for audit trailing.
   * Transitions from 'closed' to 'open'.
   */
  async reopenDay(date: string, userId: string, reason: string): Promise<void> {
    const docRef = doc(this.collectionRef, date);
    const state = await this.getState(date);
    
    if (state.status !== 'closed') {
      throw new Error("Only closed days can be reopened.");
    }

    const update: DailyProductionState = {
      ...state,
      status: 'open',
      reopenedAt: Timestamp.now(),
      reopenedBy: userId,
      reopenReason: reason,
      updatedAt: Timestamp.now(),
    };

    await setDoc(docRef, update, { merge: true });
  }
}

export const dailyProductionRepository = new DailyProductionRepository();
