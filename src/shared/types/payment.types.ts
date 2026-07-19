import type { ID, ISODateString, Timestamp } from './common.types';

// ── Payment Method ─────────────────────────────────────────────────────────────
export type PaymentMethod = 'upi' | 'cash' | 'bank_transfer';

// ── Payment Status ─────────────────────────────────────────────────────────────
export type ManualPaymentStatus = 'pending' | 'verified' | 'rejected';

// ── Subscription Status (extended) ────────────────────────────────────────────
export type SubscriptionStatus =
  | 'draft'
  | 'pending_payment'
  | 'active'
  | 'paused'
  | 'expired'
  | 'cancelled';

/**
 * Firestore: `payments/{paymentId}`.
 *
 * Written exclusively by Cloud Functions (Admin SDK). The client can read
 * their own payments but NEVER writes here. Financial records are immutable
 * — a rejection creates a new record on re-submission, not an overwrite.
 */
export interface ManualPayment {
  id: ID;

  // ── Customer ────────────────────────────────────────────────────────────────
  customerId: ID;
  customerName: string;

  // ── Subscription link ───────────────────────────────────────────────────────
  subscriptionId: ID;

  // ── Financials ──────────────────────────────────────────────────────────────
  /** Amount in INR (rupees, NOT paise). */
  amount: number;
  currency: 'INR';

  // ── Payment details ─────────────────────────────────────────────────────────
  paymentMethod: PaymentMethod;
  /** UPI transaction ID, bank UTR number, or cash receipt ref. */
  referenceNumber: string | null;
  /** Date on which the customer made the payment (YYYY-MM-DD). */
  paymentDate: ISODateString;

  // ── Verification ────────────────────────────────────────────────────────────
  status: ManualPaymentStatus;
  verifiedBy: ID | null;      // Admin uid who approved / rejected
  verificationDate: Timestamp | null;
  verificationNotes: string | null;

  // ── Audit ───────────────────────────────────────────────────────────────────
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Payload the customer sends when submitting a payment record.
 * The Cloud Function validates this before writing to Firestore.
 */
export interface SubmitPaymentInput {
  subscriptionId: ID;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  paymentDate: ISODateString;
}

/** Payload the admin sends to approve or reject a payment. */
export interface VerifyPaymentInput {
  paymentId: ID;
  action: 'approve' | 'reject';
  notes?: string;
}
