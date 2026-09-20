const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns a cached instance of Intl.DateTimeFormat to prevent expensive re-instantiations.
 *
 * @param locales A string with a BCP 47 language tag, or an array of such strings.
 * @param options An object with some or all of the formatting options.
 * @returns A cached Intl.DateTimeFormat instance.
 */
export const getCachedDateTimeFormatter = (
  locales: string | string[],
  options: Intl.DateTimeFormatOptions = {}
): Intl.DateTimeFormat => {
  const key = JSON.stringify({ locales, options });
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.DateTimeFormat(locales, options));
  }
  return formatterCache.get(key)!;
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

