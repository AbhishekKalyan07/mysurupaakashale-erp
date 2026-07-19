import type { Timestamp } from 'firebase/firestore';

/** Re-exported so domain type files don't each need their own Firestore import. */
export type { Timestamp };

/** A Firestore document id. Aliased for readability at call sites. */
export type ID = string;

/** Calendar date in `YYYY-MM-DD` form — used for delivery dates, billing periods, skips. */
export type ISODateString = string;

/** A same-day time window, e.g. breakfast delivery between 07:00 and 09:00. */
export interface TimeWindow {
  start: string; // "HH:mm", 24-hour
  end: string; // "HH:mm", 24-hour
}

/** Standard shape returned by list/paginated Firestore queries in the service layer. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  /** Opaque cursor (last document snapshot reference) — pass to the next call's `startAfter`. */
  cursor: unknown | null;
}
