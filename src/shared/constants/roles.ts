/**
 * User roles across the platform.
 *
 * Kept as a `const` object rather than a TypeScript `enum`: enums with
 * initializers are disallowed under the `erasableSyntaxOnly` compiler
 * option (tsconfig.app.json), and plain string unions serialize cleanly
 * to/from Firestore and Firebase Auth custom claims with no mapping layer.
 *
 * IMPORTANT: this is the single source of truth for role strings on the
 * client. `functions/src/types/shared.types.ts` and `firestore.rules` both
 * encode the same five values — if you add or rename a role, update all
 * three (see the "Keeping roles in sync" note in README.md).
 */
export const ROLES = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  KITCHEN: 'kitchen',
  DELIVERY_PARTNER: 'delivery_partner',
  ACCOUNTS: 'accounts',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** Roles created by an Admin (not self-signup) — see features/auth. */
export const STAFF_ROLES: Role[] = [
  ROLES.ADMIN,
  ROLES.KITCHEN,
  ROLES.DELIVERY_PARTNER,
  ROLES.ACCOUNTS,
];

/** Human-readable labels for UI display. */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.CUSTOMER]: 'Customer',
  [ROLES.KITCHEN]: 'Kitchen',
  [ROLES.DELIVERY_PARTNER]: 'Delivery Partner',
  [ROLES.ACCOUNTS]: 'Accounts',
};

/** Where each role lands immediately after signing in. */
export const ROLE_HOME_ROUTE: Record<Role, string> = {
  [ROLES.ADMIN]: '/admin',
  [ROLES.CUSTOMER]: '/customer',
  [ROLES.KITCHEN]: '/kitchen',
  [ROLES.DELIVERY_PARTNER]: '/delivery',
  [ROLES.ACCOUNTS]: '/accounts',
};

/** Type guard used when reading an unknown value out of a Firebase ID token. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}
