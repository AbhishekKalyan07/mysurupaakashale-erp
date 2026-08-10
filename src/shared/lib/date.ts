import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Returns today's date in the specified IANA time zone formatted as 'yyyy-MM-dd'.
 * Default time zone is Asia/Kolkata (IST).
 */
export const getTodayInTimezone = (timeZone: string = 'Asia/Kolkata'): string => {
  return format(new TZDate(new Date(), timeZone), 'yyyy-MM-dd');
};

/**
 * Formats any date in the specified IANA time zone.
 */
export const formatInTimezone = (date: Date, timeZone: string, fmt: string): string => {
  return format(new TZDate(date, timeZone), fmt);
};
