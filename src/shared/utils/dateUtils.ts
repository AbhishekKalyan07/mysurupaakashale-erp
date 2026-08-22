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

/**
 * Returns today's date as YYYY-MM-DD in Asia/Kolkata timezone.
 * Guarantees frontend and backend business date string alignment.
 */
export { getTodayInTimezone as getTodayIST } from '@/shared/lib/date';

/**
 * Returns which meal types for a given date are still modifiable 
 * based on the Asia/Kolkata cutoff times (05:00 for breakfast, 10:30 for lunch, 16:00 for dinner).
 */
export function getModifiableMeals(date: string, mealTypes: string[]): string[] {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  
  if (date > today) return mealTypes;
  if (date < today) return [];
  
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const currentTimeMinutes = hour * 60 + minute;
  
  return mealTypes.filter(meal => {
    if (meal === 'breakfast' && currentTimeMinutes < 5 * 60) return true;
    if (meal === 'lunch' && currentTimeMinutes < 10 * 60 + 30) return true;
    if (meal === 'dinner' && currentTimeMinutes < 16 * 60) return true;
    return false;
  });
}
