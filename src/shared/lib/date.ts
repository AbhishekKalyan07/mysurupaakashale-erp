const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Gets a cached Intl.DateTimeFormat instance to avoid expensive repeated instantiations.
 * @param locales A string with a BCP 47 language tag, or an array of such strings.
 * @param options An object with some or all of the formatting options.
 * @returns A cached Intl.DateTimeFormat instance.
 */
export const getCachedDateTimeFormatter = (
  locales: string | string[] | undefined,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const cacheKey = `${JSON.stringify(locales)}-${JSON.stringify(options)}`;
  if (!dateTimeFormatterCache.has(cacheKey)) {
    dateTimeFormatterCache.set(cacheKey, new Intl.DateTimeFormat(locales, options));
  }
  return dateTimeFormatterCache.get(cacheKey)!;
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
