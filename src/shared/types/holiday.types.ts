import type { ID, ISODateString, Timestamp } from './common.types';

/**
 * Firestore: `holidays/{holidayId}`
 *
 * One document = one business date on which no meal orders should be generated.
 *
 * Document ID is deterministic: `holiday_YYYY-MM-DD`
 * This guarantees:
 *   - Idempotent creation (no duplicates via concurrent admin actions).
 *   - O(1) lookup by date in `holidayRepository.isHoliday()`.
 *   - Client-side and server-side date-based guards share the same key space.
 *
 * Date storage:
 *   - All dates are stored in Asia/Kolkata business time (YYYY-MM-DD).
 *   - `getTodayInTimezone()` is the canonical source for today's date string.
 *
 * Authorization:
 *   - Only admins may create, update, or cancel holidays.
 *   - `createdBy` and timestamps are set by the service, never by client input.
 *   - Firestore rules enforce admin-only write access (see firestore.rules).
 */
export interface Holiday {
  /**
   * Deterministic document ID: `holiday_YYYY-MM-DD`
   * Must match the `date` field: `id === 'holiday_' + date`
   */
  id: string;

  /**
   * Business date in Asia/Kolkata timezone (YYYY-MM-DD).
   * No orders will be generated for this date while status is 'active'.
   */
  date: ISODateString;

  /** Human-readable holiday name, e.g. "Diwali", "Independence Day" */
  name: string;

  /** Optional free-form description for additional context */
  description?: string;

  /**
   * 'active'    → holiday is in effect; order generation is blocked.
   * 'cancelled' → holiday was withdrawn; order generation remains blocked
   *               (previously cancelled orders are NOT automatically restored).
   */
  status: 'active' | 'cancelled';

  /**
   * UID of the admin who declared the holiday.
   * Set by the service from the authenticated session; never from client input.
   */
  createdBy: ID;

  /** Server timestamp set at creation. */
  createdAt: Timestamp;

  /** Server timestamp updated on any status change. */
  updatedAt: Timestamp;

  /**
   * Set when status transitions to 'cancelled'.
   * null while the holiday is active.
   */
  cancelledAt?: Timestamp | null;

  /**
   * UID of the admin who cancelled the holiday.
   * null while the holiday is active.
   */
  cancelledBy?: ID | null;
}

/** Result returned by holidayRepository.createOrGetHoliday() */
export interface HolidayCreateResult {
  holiday: Holiday;
  /**
   * true  → holiday document was newly created by this call.
   * false → holiday document already existed (concurrent or retry scenario).
   *
   * The service uses this to decide whether to run the initial
   * reconciliation pass or to run a re-try reconciliation pass.
   */
  created: boolean;
}
