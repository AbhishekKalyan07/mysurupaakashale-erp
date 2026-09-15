/**
 * Safely sanitizes a value for export to CSV or Excel to prevent formula injection.
 * Prevents Excel/LibreOffice from executing strings starting with =, +, -, or @
 * by prepending a single quote (which is interpreted as a text-marker).
 */
export function sanitizeSpreadsheetValue(val: any): any {
  // We only sanitize strings. Numbers, dates, etc., are inherently safe and must preserve their types.
  if (typeof val === 'string') {
    // Check if the first non-whitespace character is a dangerous prefix
    if (/^\s*[=+\-@]/.test(val)) {
      return "'" + val;
    }
  }
  return val;
}
