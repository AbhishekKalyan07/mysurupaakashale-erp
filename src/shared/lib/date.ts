import { formatInTimeZone } from 'date-fns-tz';

/**
 * Returns today's date in the specified IANA time zone formatted as 'yyyy-MM-dd'.
 * Default time zone is Asia/Kolkata (IST).
 */
export const getTodayInTimezone = (timeZone: string = 'Asia/Kolkata'): string => {
  const now = new Date();
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
};
