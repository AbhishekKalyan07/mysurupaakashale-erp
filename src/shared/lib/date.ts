const formattersCache = new Map<string, Intl.DateTimeFormat>();

export function getCachedDateTimeFormatter(
  locale: string | string[] | undefined,
  options: Intl.DateTimeFormatOptions = {}
): Intl.DateTimeFormat {
  const keys = Object.keys(options).sort();
  const cacheKey = `${locale}|${keys.map((k) => `${k}:${(options as any)[k]}`).join(",")}`;

  if (!formattersCache.has(cacheKey)) {
    formattersCache.set(cacheKey, new Intl.DateTimeFormat(locale, options));
  }
  return formattersCache.get(cacheKey)!;
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
