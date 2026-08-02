import { describe, it, expect } from 'vitest';
import { parseFirestoreDate } from '../dateUtils';
import { Timestamp } from 'firebase/firestore';

describe('parseFirestoreDate', () => {
  it('handles null or undefined gracefully', () => {
    expect(parseFirestoreDate(null)).toBeNull();
    expect(parseFirestoreDate(undefined)).toBeNull();
    expect(parseFirestoreDate('')).toBeNull();
  });

  it('handles actual firebase/firestore Timestamp objects', () => {
    const ts = Timestamp.fromDate(new Date('2026-08-01T12:00:00.000Z'));
    const parsed = parseFirestoreDate(ts);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('handles duck-typed Timestamp objects (from admin SDK or serialized forms)', () => {
    const mockDate = new Date('2026-08-01T12:00:00.000Z');
    const duckTs = { toDate: () => mockDate, seconds: 1234567, nanoseconds: 0 };
    const parsed = parseFirestoreDate(duckTs);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('handles native Date objects', () => {
    const d = new Date('2026-08-01T12:00:00.000Z');
    expect(parseFirestoreDate(d)).toBe(d);
  });

  it('returns null for invalid Date objects', () => {
    const invalidD = new Date('invalid string');
    expect(parseFirestoreDate(invalidD)).toBeNull();
  });

  it('handles ISO date strings', () => {
    const parsed = parseFirestoreDate('2026-08-01T12:00:00.000Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('handles timestamps in milliseconds', () => {
    const ms = new Date('2026-08-01T12:00:00.000Z').getTime();
    const parsed = parseFirestoreDate(ms);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('returns null for invalid strings or numbers', () => {
    expect(parseFirestoreDate('invalid-date')).toBeNull();
    // 'random object'
    expect(parseFirestoreDate({ a: 1 })).toBeNull();
  });
});
