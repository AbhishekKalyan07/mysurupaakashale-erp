import { Timestamp } from "firebase/firestore";
import { getCachedDateTimeFormatter } from "@/shared/lib/date";

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
  if (
    typeof ts === "object" &&
    ts !== null &&
    "toDate" in tsObj &&
    typeof tsObj.toDate === "function"
  ) {
    return tsObj.toDate() as Date;
  }

  // Handle JS Date object
  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
  }

  // Handle ISO string or number (milliseconds)
  if (typeof ts === "string" || typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Returns today's date as YYYY-MM-DD in Asia/Kolkata timezone.
 * Guarantees frontend and backend business date string alignment.
 */
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";

export { getTodayInTimezone as getTodayIST, getHourInTimezone } from "@/shared/lib/date";

/**
 * Returns which meal types for a given date are still modifiable
 * based on the authoritative Asia/Kolkata operational cutoff times.
 */
export function getModifiableMeals(
  date: string,
  mealTypes: string[],
  nowOverride?: Date,
): string[] {
  const now = nowOverride || new Date();
  const today = getCachedDateTimeFormatter("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(now);

  if (date > today) return mealTypes;
  if (date < today) return [];

  const parts = getCachedDateTimeFormatter("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const second = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
  const nowSeconds = hour * 3600 + minute * 60 + second;

  const cutoffs = operationalSettingsService.getOperationalSettingsSync().cutoffs;

  return mealTypes.filter((meal) => {
    const cutoffStr = (cutoffs as any)[meal];
    if (!cutoffStr) return false;
    const [cH, cM] = cutoffStr.split(":").map((v: string) => parseInt(v, 10));
    const cutoffSeconds = cH * 3600 + cM * 60;

    // before cutoff (<) is allowed, exact or after (>=) is rejected
    return nowSeconds < cutoffSeconds;
  });
}
