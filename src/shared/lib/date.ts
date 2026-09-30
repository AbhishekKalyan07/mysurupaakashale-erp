/**
 * Cache for Intl.DateTimeFormat instances to improve performance.
 * Instantiating Intl.DateTimeFormat is an expensive operation.
 */
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Retrieves a cached Intl.DateTimeFormat instance or creates one if it doesn't exist.
 */
export const getCachedDateTimeFormatter = (
  locales?: string | string[],
  options?: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const cacheKey = JSON.stringify({ locales, options });
  if (dateTimeFormatCache.has(cacheKey)) {
    return dateTimeFormatCache.get(cacheKey)!;
  }
  const formatter = new Intl.DateTimeFormat(locales, options);
  dateTimeFormatCache.set(cacheKey, formatter);
  return formatter;
};

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


