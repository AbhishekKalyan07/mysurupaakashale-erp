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
  /** Amount paid and applied towards this invoice. Strictly 0 <= paidAmount <= totalAmount. */
  paidAmount?: number;
  /** Total gross cash collected for this invoice across all verified payments. collectedAmount >= paidAmount. */
  collectedAmount?: number;
  /** Credit applied towards this invoice from customer ledger. */
  creditApplied?: number;
  depositHeld?: number;
  /** Excess paid amount awaiting authorized administrative refund due to post-payment invoice adjustment. */
  remainingToRefund?: number;
  /** Confirmed refunds already processed towards this invoice. */
  confirmedRefunds?: number;
  /** Order IDs already deducted from this invoice to prevent duplicate adjustments. */
  deductedOrderIds?: string[];
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
 * Canonical calculation of the applied paid amount for an invoice,
 * enforcing the approved Phase 6E Option A invariant: 0 <= paidAmount <= totalAmount.
 * Respects legacy fallbacks where paidAmount was not stored.
 */
export function getInvoicePaidAmount(
  invoice: Pick<Invoice, "status"> & { totalAmount?: number; paidAmount?: number },
): number {
  const total = typeof invoice.totalAmount === "number" ? Math.max(0, invoice.totalAmount) : 0;
  if (typeof invoice.paidAmount === "number") {
    return Math.min(total, Math.max(0, invoice.paidAmount));
  }
  return invoice.status === "paid" ? total : 0;
}

/**
 * Canonical calculation of total gross cash collected for an invoice.
 * Returns the exact persisted collectedAmount if available.
 * For legacy invoices where collectedAmount was not tracked, conservatively falls back
 * to getInvoicePaidAmount(invoice) as the applied payment baseline.
 * Does not assume legacy paidAmount exceeded totalAmount, and does not fabricate
 * gross collections beyond verified applied payments.
 */
export function getInvoiceCollectedAmount(
  invoice: Pick<Invoice, "status"> & {
    totalAmount?: number;
    paidAmount?: number;
    collectedAmount?: number;
  },
): number {
  if (typeof invoice.collectedAmount === "number") {
    return Math.max(0, invoice.collectedAmount);
  }
  return getInvoicePaidAmount(invoice);
}

/**
 * Checks whether the invoice contains verified, explicit gross collection tracking.
 * Returns false for legacy invoices created prior to separate gross collection tracking.
 */
export function isInvoiceCollectedAmountKnown(
  invoice: Pick<Invoice, "collectedAmount">,
): boolean {
  return typeof invoice.collectedAmount === "number";
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
  const total = typeof invoice.totalAmount === "number" ? Math.max(0, invoice.totalAmount) : 0;
  const paid = getInvoicePaidAmount(invoice);
  return Math.max(0, total - paid);
}

/**
 * Canonical calculation of remaining amount to refund on an invoice.
 * remainingToRefund = max(0, totalCashCollected - totalAmount - confirmedRefunds).
 * For legacy invoices without recorded collectedAmount or remainingToRefund, returns 0
 * to prevent inferring fabricated refund liabilities from missing historical data.
 */
export function getInvoiceRemainingToRefund(
  invoice: Pick<Invoice, "status"> & {
    totalAmount?: number;
    paidAmount?: number;
    collectedAmount?: number;
    confirmedRefunds?: number;
    remainingToRefund?: number;
  },
): number {
  if (typeof invoice.remainingToRefund === "number") {
    return Math.max(0, invoice.remainingToRefund);
  }
  if (!isInvoiceCollectedAmountKnown(invoice)) {
    return 0; // Legacy invoices without recorded collectedAmount do not infer refundable excess
  }
  const collected = getInvoiceCollectedAmount(invoice);
  const total = typeof invoice.totalAmount === "number" ? Math.max(0, invoice.totalAmount) : 0;
  const refunds = Math.max(0, invoice.confirmedRefunds || 0);
  return Math.max(0, collected - total - refunds);
}
