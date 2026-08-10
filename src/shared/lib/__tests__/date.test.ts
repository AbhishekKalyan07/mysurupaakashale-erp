import { describe, it, expect } from 'vitest';
import { getTodayInTimezone } from '../date';

describe('getTodayInTimezone', () => {
  it('should default to Asia/Kolkata and return YYYY-MM-DD', () => {
    const today = getTodayInTimezone();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should correctly handle a UTC timestamp that is already the next day in India', () => {
    // 2026-08-09T19:00:00.000Z in UTC is 2026-08-10T00:30:00.000+05:30 in IST
    const utcDateNextDayInIST = new Date('2026-08-09T19:00:00.000Z');
    const result = getTodayInTimezone('Asia/Kolkata', utcDateNextDayInIST);
    expect(result).toBe('2026-08-10');
  });

  it('should correctly handle a UTC timestamp before midnight in India', () => {
    // 2026-08-09T18:00:00.000Z in UTC is 2026-08-09T23:30:00.000+05:30 in IST
    const utcDateSameDayInIST = new Date('2026-08-09T18:00:00.000Z');
    const result = getTodayInTimezone('Asia/Kolkata', utcDateSameDayInIST);
    expect(result).toBe('2026-08-09');
  });

  it('output format is always YYYY-MM-DD with leading zeros', () => {
    // Jan 5, 2026 04:00 UTC -> Jan 5, 2026 09:30 IST
    const earlyYearDate = new Date('2026-01-05T04:00:00.000Z');
    const result = getTodayInTimezone('Asia/Kolkata', earlyYearDate);
    expect(result).toBe('2026-01-05');
  });
});
