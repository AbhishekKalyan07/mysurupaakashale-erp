import type { DeliveryZone } from "@/shared/types/delivery.types";

export interface RoutingResult {
  zoneId: string;
  kitchenId: string;
}

/**
 * Canonical operational routing utility for resolving geographic and facility assignment.
 * 
 * CORE INVARIANT:
 * address -> pincode -> DeliveryZone -> zone.kitchenId -> order.kitchenId
 * 
 * - Never silently falls back to a default kitchen.
 * - Never returns a null kitchenId on success.
 * - Throws a deterministic error if routing fails.
 */
export function resolveOperationalZoneAndKitchen(
  address: { pincode?: string } | null | undefined,
  allZones: Pick<DeliveryZone, "id" | "pincodes" | "kitchenId" | "name">[]
): RoutingResult {
  if (!address || !address.pincode) {
    throw new Error("Cannot route order: No valid address or pincode provided.");
  }

  // Pincode normalization: simple trim to match typical existing conventions.
  const normalizedPincode = address.pincode.trim();

  if (!normalizedPincode) {
    throw new Error("Cannot route order: Address pincode is empty.");
  }

  const matchedZone = allZones.find((z) =>
    z.pincodes.some((p) => p.trim() === normalizedPincode)
  );

  if (!matchedZone) {
    throw new Error(
      `Cannot route order: No delivery zone serves pincode ${normalizedPincode}.`
    );
  }

  if (!matchedZone.kitchenId) {
    throw new Error(
      `Cannot route order: Zone ${matchedZone.name || matchedZone.id} has no assigned kitchen.`
    );
  }

  return {
    zoneId: matchedZone.id,
    kitchenId: matchedZone.kitchenId,
  };
}
