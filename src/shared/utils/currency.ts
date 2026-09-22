/**
 * Formats an INR amount (in rupees) as a localised ₹ string.
 *
 * Bug #6 fix: all monetary fields in this repo are stored in rupees,
 * NOT paise (see payment.types.ts: "Amount in INR (rupees, NOT paise)").
 * The previous implementation divided by 100, silently displaying
 * ₹1 when the stored value was ₹100.
 */
// Cache the Intl.NumberFormat instance as creating it is expensive.
// We format in 'en-IN' to get the standard Indian numbering system.
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(rupees: number): string {
  if (!rupees || isNaN(rupees)) return "₹0";
  return currencyFormatter.format(rupees);
}

const inrDecimalsFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a monetary value consistently as INR with 2 decimal places (e.g. ₹1,500.00).
 * Handles numbers, numeric strings, and gracefully returns "N/A" for missing/invalid amounts (never ₹NaN).
 */
export function formatINR(amount: unknown): string {
  if (amount === undefined || amount === null || amount === "") return "N/A";
  const num = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(num)) return "N/A";
  return inrDecimalsFormatter.format(num);
}
