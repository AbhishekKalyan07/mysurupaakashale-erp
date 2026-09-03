import type { Address } from './user.types';
import type { ID, Timestamp } from './common.types';

/**
 * Firestore: `kitchens/{kitchenId}`.
 * A single-kitchen v1 deployment still gets exactly one document here.
 * Modeling it as a collection now (rather than a hardcoded singleton)
 * means adding a second kitchen later is a data change, not a schema
 * migration — every Order/DeliveryZone already carries a `kitchenId`.
 */
export interface Kitchen {
  id: ID;
  name: string;
  address: Address;
  city: string;
  phone: string;
  isActive: boolean;
  managerUserId: ID | null;
  createdAt: Timestamp;
}
