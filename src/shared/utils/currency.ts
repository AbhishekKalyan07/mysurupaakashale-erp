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
