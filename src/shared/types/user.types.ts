import type { Timestamp } from './common.types';

/** A saved delivery address. Customers can have several; one is marked default. */
export interface Address {
  id: string;
  label: string; // "Home", "Office", ...
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  /** Null until geocoded — see features/customer/services (Phase: Customer module). */
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}

export type VehicleType = 'bike' | 'bicycle' | 'on_foot' | 'other';

interface BaseUserProfile {
  /** Same value as the Firebase Auth uid and the `users/{id}` document key — named `id` for consistency with every other entity in the system. */
  id: string;
  displayId?: string; // Human-readable ID assigned during creation (e.g., CUST-1001, STAFF-101)
  fullName: string;
  email: string;
  phone: string;
  photoUrl: string | null;
  /** Soft-delete / suspend flag. Staff are deactivated, never hard-deleted, to preserve order/audit history. */
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  emailVerified?: boolean;
  googleConnected?: boolean;
  passwordCreated?: boolean;
}

export interface CustomerProfile extends BaseUserProfile {
  role: 'customer';
  addresses: Address[];
  defaultAddressId: string | null;
  /** Permanently assigned delivery partner. Copied to every generated order. */
  deliveryPartnerId?: string | null;
  /** Permanently assigned delivery zone. Copied to every generated order. (Priority 2, below Partner, above Pincode) */
  zoneId?: string | null;
  assignedAt?: Timestamp | null;
  assignedBy?: string | null;
}

export interface KitchenStaffProfile extends BaseUserProfile {
  role: 'kitchen';
  kitchenId: string;
}

export interface DeliveryPartnerProfile extends BaseUserProfile {
  role: 'delivery_partner';
  zoneIds: string[];
  vehicleType: VehicleType;
  isAvailable: boolean;
  currentLocation: { lat: number; lng: number; updatedAt: Timestamp } | null;
}

export interface AccountsStaffProfile extends BaseUserProfile {
  role: 'accounts';
}

export interface AdminProfile extends BaseUserProfile {
  role: 'admin';
}

/**
 * Firestore: `users/{uid}`.
 *
 * A discriminated union on `role` rather than one profile with a pile of
 * optional fields — narrowing on `profile.role === 'delivery_partner'`
 * gives you `zoneIds`/`vehicleType` with no optional-chaining, and the
 * compiler stops you from reading e.g. `addresses` off a Kitchen profile.
 */
export type UserProfile =
  | CustomerProfile
  | KitchenStaffProfile
  | DeliveryPartnerProfile
  | AccountsStaffProfile
  | AdminProfile;
