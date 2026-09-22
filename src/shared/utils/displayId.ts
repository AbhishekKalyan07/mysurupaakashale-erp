import type { Role } from "@/shared/constants/roles";

/**
 * Checks whether an ID string is an allotted, human-readable ID
 * (e.g. MP-A001, ADMIN-1001, KTCH-1001, DLVY-1001, ACCT-1001, CUST-1001, ORD-ABC123)
 * rather than a raw Firebase Auth UID or UUID.
 */
export function isFormattedDisplayId(id?: string | null): boolean {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  // Standard Mysuru Paakashale allotted formats
  return (
    /^MP-[A-Za-z0-9]+$/i.test(trimmed) ||
    /^(ADMIN|KTCH|DLVY|ACCT|STAFF|CUST|ORD)-[A-Za-z0-9]+$/i.test(trimmed)
  );
}

/**
 * Returns the human-readable allotted ID (e.g. MP-A001, ADMIN-1001).
 * If displayId is missing, formats a clean, compact allotted fallback code
 * using the role prefix and the first 6 characters of the UID (e.g. MP-WTEA9L).
 * NEVER returns a raw 28-character Firebase UID string.
 */
export function formatAllottedId(
  displayId?: string | null,
  uid?: string | null,
  role: Role = "customer",
): string {
  if (displayId && displayId.trim()) {
    const trimmed = displayId.trim();
    if (isFormattedDisplayId(trimmed)) {
      return trimmed;
    }
  }

  if (uid && uid.trim()) {
    const cleanUid = uid.trim();
    // If the uid itself was already an allotted displayId, return it
    if (isFormattedDisplayId(cleanUid)) {
      return cleanUid;
    }

    const shortCode = cleanUid.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
    if (role === "admin") return `ADMIN-${shortCode.slice(0, 4) || "1001"}`;
    if (role === "kitchen") return `KTCH-${shortCode.slice(0, 4) || "1001"}`;
    if (role === "delivery_partner") return `DLVY-${shortCode.slice(0, 4) || "1001"}`;
    if (role === "accounts") return `ACCT-${shortCode.slice(0, 4) || "1001"}`;

    return `MP-${shortCode || "CUST"}`;
  }

  return "N/A";
}
