const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns a cached Intl.DateTimeFormat instance for the given locales and options.
 * Avoids the main-thread overhead of instantiating formatters repeatedly in render loops.
 */
export function getCachedDateTimeFormatter(
  locales?: string | string[],
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify({ locales, options });
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locales, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Returns the current date string (YYYY-MM-DD) in the specified IANA timezone.
 */
export const getTodayInTimezone = (
  timezone: string = "Asia/Kolkata",
  date: Date = new Date(),
): string => {
  return getCachedDateTimeFormatter("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const getTodayIST = (): string => getTodayInTimezone("Asia/Kolkata");

/**
 * Extracts the hour (0-23) of a given date in the specified IANA timezone (default: Asia/Kolkata).
 */
export const getHourInTimezone = (
  date: Date = new Date(),
  timezone: string = "Asia/Kolkata",
): number => {
  const parts = getCachedDateTimeFormatter("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  return parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
};

/**
 * Returns the day of the week (e.g. "Sunday", "Monday") for a given date string (YYYY-MM-DD)
 * in the specified IANA timezone (default: Asia/Kolkata).
 */
export const getDayOfWeekInTimezone = (
  dateStr: string,
  timezone: string = "Asia/Kolkata",
): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Noon in IST (06:30 UTC) avoids day-boundary offset issues
  const d = new Date(Date.UTC(year, month - 1, day, 6, 30));
  return getCachedDateTimeFormatter("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(d);
};

/**
 * Returns true if the given date string (YYYY-MM-DD) is Sunday in the specified IANA timezone (default: Asia/Kolkata).
 */
export const isSundayInTimezone = (
  dateStr: string,
  timezone: string = "Asia/Kolkata",
): boolean => {
  return getDayOfWeekInTimezone(dateStr, timezone) === "Sunday";
};

/**
 * Calculates subscription end date based on delivery days (weekly: 5 days, monthly: 25 days),
 * skipping Sundays in Asia/Kolkata timezone.
 */
export const calculateSubscriptionEndDate = (
  start: string,
  cycle: "weekly" | "monthly" = "monthly",
): string => {
  if (!start || !start.includes("-")) return "";
  const [y, m, d] = start.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return "";
  const cur = new Date(Date.UTC(y, m - 1, d, 6, 30));
  let remainingDays = cycle === "weekly" ? 5 : 25;
  while (remainingDays > 0) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() !== 0) {
      remainingDays--;
    }
  }
  return cur.toISOString().split("T")[0];
};

