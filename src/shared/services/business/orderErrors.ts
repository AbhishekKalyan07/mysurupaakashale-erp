/**
 * Custom error types and helpers for order generation, routing, and subscription integrity.
 */

export type OrderDataIntegrityErrorCode =
  | "CUSTOMER_PROFILE_NOT_FOUND"
  | "CUSTOMER_ADDRESS_MISSING"
  | "DELIVERY_ADDRESS_NOT_FOUND"
  | "INVALID_PINCODE"
  | "NO_ACTIVE_ZONES"
  | "ZONE_ROUTING_FAILED"
  | "ZONE_KITCHEN_NOT_CONFIGURED"
  | "MISSING_KITCHEN_CONFIG"
  | "GENERAL_DATA_INTEGRITY_ERROR";

export interface OrderDataIntegrityErrorOptions {
  code?: OrderDataIntegrityErrorCode;
  subscriptionId?: string;
  mealType?: string;
  customerId?: string;
  cause?: unknown;
}

/**
 * Thrown when order generation encounters deterministic data integrity failures
 * (e.g. missing customer profiles, unconfigured delivery addresses, missing zones).
 *
 * Such errors represent invalid business state and must NOT be retried repeatedly,
 * because re-running against the same database state cannot succeed.
 */
export class OrderDataIntegrityError extends Error {
  public readonly isPermanent: boolean = true;
  public readonly isRetryable: boolean = false;
  public readonly code: OrderDataIntegrityErrorCode;
  public readonly subscriptionId?: string;
  public readonly mealType?: string;
  public readonly customerId?: string;

  constructor(message: string, options?: OrderDataIntegrityErrorOptions) {
    super(message);
    this.name = "OrderDataIntegrityError";
    this.code = options?.code || "GENERAL_DATA_INTEGRITY_ERROR";
    this.subscriptionId = options?.subscriptionId;
    this.mealType = options?.mealType;
    this.customerId = options?.customerId;
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
    Object.setPrototypeOf(this, OrderDataIntegrityError.prototype);
  }
}

/**
 * Checks whether an error is a permanent, non-retryable data integrity error.
 */
export function isOrderDataIntegrityError(
  error: unknown,
): error is OrderDataIntegrityError {
  if (error instanceof OrderDataIntegrityError) return true;
  if (
    error &&
    typeof error === "object" &&
    ((error as any).isPermanent === true ||
      (error as any).isRetryable === false ||
      (error as any).name === "OrderDataIntegrityError")
  ) {
    return true;
  }
  return false;
}

export interface SubscriptionIntegrityIssue {
  subscriptionId: string;
  issueCode: OrderDataIntegrityErrorCode;
  details: string;
  isFatal: boolean;
}
