import type { ID, ISODateString, TimeWindow, Timestamp } from './common.types';
import type { MealType, PlanTier } from './mealPlan.types';

export type OrderStatus =
  | 'scheduled' // generated, delivery date in the future / prep not started
  | 'preparing'
  | 'packing'
  | 'packed'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'skipped'
  | 'cancelled'
  | 'failed_delivery'
  | 'returned_delivery'
  | 'locked'
  | 'closed'
  | 'reopened';

/**
 * Structured reason why an order was cancelled.
 * Back-ward compatible: existing orders without this field have `undefined`.
 */
export type CancellationReason =
  | 'holiday'               // cancelled because the date was declared a holiday
  | 'customer_request'      // customer-initiated skip/cancellation
  | 'subscription_cancelled' // parent subscription was cancelled
  | 'subscription_paused'   // parent subscription was paused
  | 'admin'                 // manual admin cancellation
  | 'other';                // catch-all for historic free-form reasons

/**
 * The explicit, audited list of order statuses that may be cancelled when
 * a holiday is declared for that date.
 *
 * WHY explicit instead of dynamic:
 *   - `OrderStatus` is a union type, not a runtime enum, so Object.values()
 *     doesn't work.
 *   - Automatically treating every non-terminal status as cancellable is
 *     dangerous: a newly introduced status would silently become cancellable.
 *   - This constant is the canonical source of truth. If `OrderStatus` gains a
 *     new value, a TypeScript error (via the satisfies check below) will
 *     require a deliberate policy decision before it can compile.
 *
 * Terminal / delivery-locked statuses intentionally excluded:
 *   packed, ready_for_pickup, picked_up, out_for_delivery, delivered,
 *   failed_delivery, returned_delivery, skipped, cancelled, locked, closed, reopened.
 */
export const HOLIDAY_CANCELLABLE_STATUSES = [
  'scheduled',
  'preparing',
  'packing',
] as const satisfies readonly OrderStatus[];

export type HolidayCancellableStatus = typeof HOLIDAY_CANCELLABLE_STATUSES[number];

export type OrderSource = 'subscription' | 'one_time';

export type KitchenStatus = 'scheduled' | 'packing' | 'packed' | 'ready_for_pickup';
export type BillingStatus = 'Not Generated' | 'Generated' | 'Delivered' | 'Invoiced' | 'Paid';

/**
 * Firestore: `orders/{orderId}`.
 * One document = one meal, one date, one customer. Subscription orders are
 * generated daily by a scheduled Cloud Function (Phase: Kitchen/Orders);
 * one-time orders are created directly by the customer (the business
 * explicitly offers "single meals / one-time orders" alongside plans).
 * 
 * This document acts as the Operational Snapshot for the Day.
 */
export interface Order {
  id: ID;
  displayId?: string; // e.g. Customer Code MP-001
  source: OrderSource;
  
  // Normalized IDs
  customerId: ID;
  subscriptionId: ID | null; // null for one-time orders
  planTier: PlanTier | null; // null for one-time orders
  mealType: MealType;
  date: ISODateString;
  
  // Denormalized Operational Snapshot (Added for Workflow Enhancements)
  customerName?: string;
  customerCode?: string;
  customerPhone?: string;
  address?: string; // Full address string
  zoneName?: string;
  planName?: string;
  driverName?: string;
  driverPhone?: string;
  mealName?: string;
  mealQuantity?: number;
  specialInstructions?: string;
  packingNotes?: string;
  billingStatus?: BillingStatus;
  kitchenStatus?: KitchenStatus;

  // SLA Tracking
  preparingAt?: Timestamp;
  packingAt?: Timestamp;
  packedAt?: Timestamp;
  readyAt?: Timestamp;
  outForDeliveryAt?: Timestamp;
  deliveredAt?: Timestamp;
  
  estimatedETA?: string;

  /** Denormalized snapshot of what's included, frozen at creation time so later menu edits don't rewrite history. */
  itemsLabel: string;
  selectedOptionId: string | null;
  price: number; // INR, snapshot at creation time
  currency: 'INR';
  status: OrderStatus;
  /** Optional structured cancellation reason. `undefined` for non-cancelled orders and historic records. */
  cancellationReason?: CancellationReason;
  deliveryAddressId: ID;
  zoneId: ID | null;
  kitchenId: ID | null;
  deliveryPartnerId: ID | null; // set by zone-based auto-assignment
  deliveryWindow: TimeWindow | null;
  paymentId: ID | null; // null until paid (one-time orders) or always null for orders billed via the parent subscription's invoice
  operatorId?: ID; // The kitchen staff member currently handling this order
  routeSequence?: number; // Future compatibility: sorting optimized routes
  proofOfDeliveryUrl?: string; // Future compatibility: image upload for PoD
  deliveryResult?: {
    reasonCode: string;
    notes?: string;
  }; // Structured result for terminal delivery states
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Firestore: `orders/{orderId}/workflowHistory/{historyId}`
 * Append-only history of status changes for an order.
 */
export interface OrderWorkflowHistory {
  id: ID;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedBy: ID;
  changedAt: Timestamp;
  notes?: string;
}
