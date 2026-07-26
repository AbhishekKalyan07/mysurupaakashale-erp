import { Timestamp } from 'firebase/firestore';

/**
 * Safely parses a Firestore timestamp, JS Date, or ISO string into a valid Date object.
 * Returns null if the input is invalid or null/undefined.
 */
export function parseFirestoreDate(ts: unknown): Date | null {
  if (!ts) return null;

  // Handle Firestore Timestamp object
  if (ts instanceof Timestamp) {
    return ts.toDate();
  }

  // Handle object that looks like a Timestamp (duck typing)
  // We use type casting here safely since we check for the function's existence.
  const tsObj = ts as Record<string, unknown>;
  if (typeof ts === 'object' && ts !== null && 'toDate' in tsObj && typeof tsObj.toDate === 'function') {
    return tsObj.toDate() as Date;
  }

  // Handle JS Date object
  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
  }

  // Handle ISO string or number (milliseconds)
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}
