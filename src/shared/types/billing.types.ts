import type { ID, ISODateString, Timestamp } from "./common.types";

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "void";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  addonId?: string;
  mealType?: import("./mealPlan.types").MealType;
  orderId?: string;
}

/**
 * Firestore: `invoices/{invoiceId}`.
 * Cloud-Function-only writes. `taxAmount`/`taxRate` are left as plain
 * configurable numbers rather than a hardcoded GST rate — whether this
 * business's meal subscriptions are taxable, and at what rate, is a
 * compliance decision for the Accounts phase.
 */
export interface Invoice {
  id: ID;
  invoiceNumber: string; // human-facing sequential number, e.g. "MP-2026-00042"
  customerId: ID;
  subscriptionId: ID | null;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number; // 0 until Accounts configures it
  taxAmount: number;
  totalAmount: number;
  /** Amount paid towards this invoice. Defaults to totalAmount if paid and omitted, or 0 if issued. */
  paidAmount?: number;
  /** Credit applied towards this invoice from customer ledger. */
  creditApplied?: number;
  depositHeld?: number;
  currency: "INR";
  status: InvoiceStatus;
  billingPeriodStart: ISODateString;
  billingPeriodEnd: ISODateString;
  dueDate: ISODateString;
  paidAt: Timestamp | null;
  paymentId: ID | null;
  voidedAt?: Timestamp | null;
  voidedBy?: ID | null;
  voidReason?: string | null;
  notes?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type LedgerEntryType =
  | "cycle_credit"       // Surplus meal advance credit from billing cycle
  | "credit_applied"     // Credit applied to an invoice
  | "manual_adjustment"  // Admin manual credit or debit adjustment
  | "refund";            // Refund issued to customer

/**
 * Firestore: `users/{customerId}/ledger/{entryId}`.
 * Immutable, append-only financial ledger record.
 */
export interface CustomerLedgerEntry {
  id: ID;
  customerId: ID;
  type: LedgerEntryType;
  /** Signed amount in INR. Positive for credit addition, negative for credit deduction. */
  amount: number;
  /** Customer's credit balance immediately following this entry. */
  balanceAfter: number;
  reason: string;
  referenceId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  actorId: string;
  actorRole: "admin" | "accounts" | "system";
  createdAt: Timestamp;
}

/**
 * Canonical calculation of the paid amount for an invoice,
 * respecting legacy fallbacks where paidAmount was not stored.
 */
export function getInvoicePaidAmount(
  invoice: Pick<Invoice, "status"> & { totalAmount?: number; paidAmount?: number },
): number {
  if (typeof invoice.paidAmount === "number") {
    return Math.max(0, invoice.paidAmount);
  }
  return invoice.status === "paid" ? Math.max(0, invoice.totalAmount || 0) : 0;
}

/**
 * Canonical calculation of remaining due on an invoice.
 * For modern invoices, totalAmount is already net of creditApplied.
 * Note: depositHeld represents a separately held refundable security deposit,
 * not a deduction from monthly meal usage charges.
 * For legacy invoices, totalAmount is already net of advance payments.
 * Therefore, remainingDue = max(0, totalAmount - paidAmount) for unpaid invoices, and 0 for paid/void.
 * Credit applied must never be subtracted again.
 */
export function getInvoiceRemainingDue(
  invoice: Pick<Invoice, "status"> & { totalAmount?: number; paidAmount?: number },
): number {
  if (invoice.status === "paid" || invoice.status === "void") {
    return 0;
  }
  const paid = getInvoicePaidAmount(invoice);
  return Math.max(0, (invoice.totalAmount || 0) - paid);
}
