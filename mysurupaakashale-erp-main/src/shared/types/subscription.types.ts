import type { ID, ISODateString, Timestamp } from './common.types';
import type { MealType, PlanTier } from './mealPlan.types';
import type { SubscriptionStatus } from './payment.types';

// Re-export so callers can import from one place
export type { SubscriptionStatus };

export interface MealPreference {
  mealType: MealType;
  /** References MealOption.id on the plan; null when the slot isn't customer-selectable (breakfast). */
  selectedOptionId: string | null;
}

/**
 * Firestore: `subscriptions/{subscriptionId}`.
 *
 * State machine:
 *   draft → pending_payment → active → paused → active (resume)
 *                          ↘ cancelled
 *                          → expired
 */
export interface Subscription {
  id: ID;
  customerId: ID;
  planId: ID;
  planTier: PlanTier;
  /** Number of people this subscription covers. Multiplies the daily price. */
  quantity: number;
  /** Price locked in at subscription time — later plan price changes never retroactively change what an existing subscriber owes. */
  pricePerDaySnapshot: number;
  deliveryAddressId: ID;
  zoneId: ID | null;
  mealPreferences: MealPreference[];
  status: SubscriptionStatus;
  startDate: ISODateString;
  endDate: ISODateString | null; // null = ongoing, renews monthly
  billingCycle: 'monthly';
  autoRenew: boolean;
  /** Set once the admin approves a payment — links to the verified payment record. */
  latestPaymentId: ID | null;
  /** Accrued credit from paused/skipped days, in INR. Deducted from next month's bill. */
  creditBalance: number;
  /** Initial security deposit paid during signup. Refunded on cancellation. */
  depositAmount: number;
  /** Start date of a scheduled pause (inclusive) */
  pauseStartDate?: ISODateString | null;
  /** End date of a scheduled pause (inclusive) */
  pauseEndDate?: ISODateString | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Firestore: `subscriptions/{subscriptionId}/skips/{date}` (subcollection).
 * One document per skipped date rather than an array on the parent doc —
 * a multi-year subscriber can accumulate hundreds of skips without ever
 * approaching Firestore's 1 MiB document limit or serializing an
 * ever-growing array on every unrelated update.
 */
export interface SubscriptionSkip {
  date: ISODateString; // also the document id
  mealTypes: MealType[]; // which of that day's meals are skipped
  reason: string | null;
  createdAt: Timestamp;
  createdBy: ID; // uid of whoever requested the skip (usually the customer)
}
