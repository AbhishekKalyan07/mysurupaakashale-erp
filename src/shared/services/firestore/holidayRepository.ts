/**
 * holidayRepository.ts
 *
 * Client-side repository for the `holidays` collection.
 *
 * Architecture note:
 *   This project runs entirely on the Firebase Spark plan (client SDK only —
 *   see PRODUCTION_READINESS_REPORT.md). There is no deployed backend that
 *   runs Firebase Admin SDK outside of the single `onOrderCancelled` Cloud
 *   Function. Therefore this repository uses the client Firestore SDK,
 *   consistent with every other repository in the project. Authorization is
 *   enforced via Firestore security rules (admin-only write access).
 *
 * Key guarantees:
 *   - `createOrGetHoliday` uses a Firestore transaction to prevent duplicate
 *     holiday documents under concurrent admin declarations.
 *   - `isHoliday` is a cheap single-document read optimised for frequent calls
 *     from order-generation paths.
 *   - Document IDs are deterministic: `holiday_YYYY-MM-DD`
 */

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  runTransaction,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Holiday, HolidayCreateResult } from '@/shared/types';
import { HOLIDAY_CANCELLABLE_STATUSES } from '@/shared/types';
import { orderRepository } from './orderRepository';
import type { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLECTION = 'holidays';

/** Build the deterministic document ID for a given date. */
function holidayDocId(date: string): string {
  return `holiday_${date}`;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class HolidayRepository {
  /**
   * Returns `true` iff there is an **active** holiday for `date`.
   *
   * Called at the top of every order-generation path. Optimised for speed:
   *   - Single document read (no query).
   *   - Returns `false` for missing docs AND cancelled holidays.
   */
  async isHoliday(date: string): Promise<boolean> {
    const ref = doc(db, COLLECTION, holidayDocId(date));
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() as Holiday;
    return data.status === 'active';
  }

  /**
   * Atomically creates a new holiday document **or** returns the existing one.
   *
   * Uses a Firestore transaction to prevent duplicate documents when two
   * admins declare the same holiday concurrently. Exactly one transaction
   * will succeed; the other sees the already-existing document.
   *
   * Returns `{ holiday, created: true }` when a new document was created.
   * Returns `{ holiday, created: false }` when the document already existed.
   *
   * The service layer uses `created` to decide whether to run a fresh
   * reconciliation pass or a retry/recovery pass.
   */
  async createOrGetHoliday(params: {
    date: string;
    name: string;
    description?: string;
    createdBy: string;
  }): Promise<HolidayCreateResult> {
    const { date, name, description, createdBy } = params;
    const id = holidayDocId(date);
    const ref = doc(db, COLLECTION, id);

    let created = false;
    let holiday: Holiday;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (snap.exists()) {
        holiday = snap.data() as Holiday;
        created = false;
        return; // Document already exists — idempotent, do nothing
      }

      const now = serverTimestamp() as unknown as Timestamp;
      const newHoliday: Holiday = {
        id,
        date,
        name,
        ...(description ? { description } : {}),
        status: 'active',
        createdBy,
        createdAt: now,
        updatedAt: now,
        cancelledAt: null,
        cancelledBy: null,
      };

      txn.set(ref, newHoliday);
      holiday = newHoliday;
      created = true;
    });

    return { holiday: holiday!, created };
  }

  /**
   * Cancels an active holiday.
   *
   * Idempotent: if the holiday is already cancelled, this is a no-op.
   * Does NOT re-activate any previously cancelled orders — that is a
   * deliberate business decision (see holidayService.cancelHoliday).
   */
  async cancelHoliday(date: string, cancelledBy: string): Promise<void> {
    const ref = doc(db, COLLECTION, holidayDocId(date));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error(`Holiday for ${date} not found.`);
    }
    const data = snap.data() as Holiday;
    if (data.status === 'cancelled') {
      // Already cancelled — idempotent
      return;
    }
    await updateDoc(ref, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Fetches a single holiday by date.
   * Returns `null` if no document exists for the date.
   */
  async getHoliday(date: string): Promise<Holiday | null> {
    const ref = doc(db, COLLECTION, holidayDocId(date));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as Holiday;
  }

  /**
   * Returns all holiday documents, newest date first.
   */
  async listHolidays(): Promise<Holiday[]> {
    const col = collection(db, COLLECTION);
    const q = query(col, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Holiday);
  }

  /**
   * Returns the count of orders that WOULD be cancelled if a holiday were
   * declared for `date`. Does not write anything.
   */
  async previewAffectedOrders(date: string): Promise<number> {
    const results = await Promise.all(
      HOLIDAY_CANCELLABLE_STATUSES.map((status) =>
        orderRepository.list(
          where('date', '==', date),
          where('status', '==', status),
        ),
      ),
    );
    const seen = new Set<string>();
    let count = 0;
    for (const batch of results) {
      for (const order of batch) {
        if (!seen.has(order.id!)) {
          seen.add(order.id!);
          count++;
        }
      }
    }
    return count;
  }
}

export const holidayRepository = new HolidayRepository();
