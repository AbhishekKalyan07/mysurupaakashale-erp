import { describe, it, expect } from 'vitest';
import { sanitizeSpreadsheetValue } from '../spreadsheet';

describe('sanitizeSpreadsheetValue', () => {
  it('neutralizes dangerous formula prefixes', () => {
    expect(sanitizeSpreadsheetValue('=SUM(1,1)')).toBe("'=SUM(1,1)");
    expect(sanitizeSpreadsheetValue('+123')).toBe("'+123");
    expect(sanitizeSpreadsheetValue('-123')).toBe("'-123");
    expect(sanitizeSpreadsheetValue('@example')).toBe("'@example");
  });

  it('neutralizes prefixes even with leading whitespace', () => {
    expect(sanitizeSpreadsheetValue(' =SUM(1,1)')).toBe("' =SUM(1,1)");
    expect(sanitizeSpreadsheetValue('\t+123')).toBe("'\t+123");
    expect(sanitizeSpreadsheetValue('  @example')).toBe("'  @example");
  });

  it('preserves normal text unchanged', () => {
    expect(sanitizeSpreadsheetValue('John Doe')).toBe('John Doe');
    expect(sanitizeSpreadsheetValue(' John Doe')).toBe(' John Doe');
    expect(sanitizeSpreadsheetValue('normal-name')).toBe('normal-name');
    expect(sanitizeSpreadsheetValue('123 Main St')).toBe('123 Main St');
    // Does not sanitize strings that happen to contain dangerous chars inside
    expect(sanitizeSpreadsheetValue('A+B=C')).toBe('A+B=C');
  });

  it('preserves numbers unchanged', () => {
    expect(sanitizeSpreadsheetValue(123)).toBe(123);
    expect(sanitizeSpreadsheetValue(-123)).toBe(-123);
    expect(sanitizeSpreadsheetValue(0)).toBe(0);
    expect(sanitizeSpreadsheetValue(1.5)).toBe(1.5);
  });

  it('preserves other types unchanged', () => {
    const d = new Date();
    expect(sanitizeSpreadsheetValue(d)).toBe(d);
    expect(sanitizeSpreadsheetValue(null)).toBe(null);
    expect(sanitizeSpreadsheetValue(undefined)).toBe(undefined);
    expect(sanitizeSpreadsheetValue(true)).toBe(true);
    expect(sanitizeSpreadsheetValue(false)).toBe(false);
  });
});
