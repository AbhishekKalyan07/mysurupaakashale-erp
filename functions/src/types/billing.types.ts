import type { ID, ISODateString, Timestamp } from './common.types';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
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
  depositHeld?: number;
  currency: 'INR';
  status: InvoiceStatus;
  billingPeriodStart: ISODateString;
  billingPeriodEnd: ISODateString;
  dueDate: ISODateString;
  paidAt: Timestamp | null;
  paymentId: ID | null;
  createdAt: Timestamp;
}
