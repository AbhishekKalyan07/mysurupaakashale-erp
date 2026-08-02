import type { ID, ISODateString, TimeWindow, Timestamp } from './common.types';
import type { MealType, PlanTier } from './mealPlan.types';

export type OrderStatus =
  | 'scheduled' // generated, delivery date in the future / prep not started
  | 'preparing'
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

export type OrderSource = 'subscription' | 'one_time';

/**
 * Firestore: `orders/{orderId}`.
 * One document = one meal, one date, one customer. Subscription orders are
 * generated daily by a scheduled Cloud Function (Phase: Kitchen/Orders);
 * one-time orders are created directly by the customer (the business
 * explicitly offers "single meals / one-time orders" alongside plans).
 */
export interface Order {
  id: ID;
  displayId?: string;
  source: OrderSource;
  customerId: ID;
  subscriptionId: ID | null; // null for one-time orders
  planTier: PlanTier | null; // null for one-time orders
  mealType: MealType;
  date: ISODateString;
  /** Denormalized snapshot of what's included, frozen at creation time so later menu edits don't rewrite history. */
  itemsLabel: string;
  selectedOptionId: string | null;
  price: number; // INR, snapshot at creation time
  currency: 'INR';
  status: OrderStatus;
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
