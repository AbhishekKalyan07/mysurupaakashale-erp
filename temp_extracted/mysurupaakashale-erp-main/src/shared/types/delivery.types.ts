import type { Address } from './user.types';
import type { ID, TimeWindow, Timestamp } from './common.types';

export type DeliveryStatus = 'unassigned' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'failed';

/**
 * Firestore: `deliveryZones/{zoneId}`.
 * v1 matches customers to a zone by pincode (`pincodes`), which is simple,
 * fast, and needs no map interaction at signup. `boundary` is optional
 * lat/lng polygon points for when Admin wants to draw exact zone shapes on
 * the Leaflet map instead of/in addition to a pincode list — both can
 * coexist; pincode match is the dependable fallback.
 */
export interface DeliveryZone {
  id: ID;
  name: string;
  city: string; // not hardcoded to Mysuru — keeps multi-city expansion schema-compatible
  pincodes: string[];
  boundary: { lat: number; lng: number }[] | null;
  kitchenId: ID;
  isActive: boolean;
  createdAt: Timestamp;
}

/**
 * Firestore: `deliveries/{deliveryId}`.
 * Deliberately separate from `orders/{orderId}` (one-to-one, linked by
 * orderId): Kitchen cares about the Order (what to cook), Delivery Partner
 * cares about this (logistics, proof of delivery, live location) — keeping
 * them apart means each role's security rules and queries stay narrow and
 * each collection stays single-purpose.
 */
export interface Delivery {
  id: ID;
  orderId: ID;
  customerId: ID;
  deliveryPartnerId: ID | null;
  zoneId: ID | null;
  status: DeliveryStatus;
  /** Snapshot so a later address edit never rewrites where a past delivery actually went. */
  addressSnapshot: Address;
  scheduledWindow: TimeWindow;
  assignedAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  /** Firebase Storage path, e.g. `delivery-proof/{deliveryId}.jpg` — see storage.rules. */
  proofOfDeliveryUrl: string | null;
  failureReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
