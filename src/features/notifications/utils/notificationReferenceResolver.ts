import { db } from "@/shared/lib/firebase";
import { collection, query, where, documentId, getDocs } from "firebase/firestore";
import type { Notification, UserProfile } from "@/shared/types";
import { formatAllottedId } from "@/shared/utils/displayId";

const BROADCAST_RECIPIENTS: Record<string, string> = {
  all: "All Users",
  customer: "All Customers",
  delivery_partner: "All Delivery Partners",
  kitchen: "Kitchen Staff",
  staff: "All Staff",
};

/**
 * Formats a business-safe recipient display string:
 * e.g. "Rahul Kumar (MP-001)"
 * Falls back to clean allotted code (e.g. "Customer (MP-WTEA9L)") if user not found.
 * Never renders a raw 28-character Firebase Auth UID in the normal view.
 */
export function formatNotificationRecipientDisplay(
  user?: Partial<UserProfile> | null,
  rawRecipientId?: string,
): string {
  if (rawRecipientId && BROADCAST_RECIPIENTS[rawRecipientId]) {
    return BROADCAST_RECIPIENTS[rawRecipientId];
  }

  const name = user?.fullName?.trim();
  const hasValidName = !!(name && name !== "Unknown User" && name !== "Customer");

  const candidateId = user?.displayId;
  const role = user?.role || "customer";
  const allottedId = formatAllottedId(candidateId, user?.id || rawRecipientId, role);
  const hasValidId = allottedId && allottedId !== "N/A";

  if (hasValidName && hasValidId) {
    return `${name} (${allottedId})`;
  }
  if (hasValidName) {
    return name;
  }
  if (hasValidId) {
    const rolePrefix = role === "customer" ? "Customer" : role.replace("_", " ");
    return `${rolePrefix} (${allottedId})`;
  }
  return "Customer";
}

/**
 * Batch-resolves human-readable recipient names and display IDs (MP-xxx)
 * for a list of notifications in efficient chunks of up to 30 Firestore reads.
 */
export async function resolveNotificationRecipients(
  notifications: Notification[],
): Promise<Map<string, string>> {
  const recipientMap = new Map<string, string>();

  if (!notifications || notifications.length === 0) {
    return recipientMap;
  }

  const uniqueRecipientIds = Array.from(
    new Set(
      notifications
        .map((n) => n.recipientId)
        .filter((id): id is string => Boolean(id && id.trim())),
    ),
  );

  const userIdsToFetch: string[] = [];
  for (const id of uniqueRecipientIds) {
    if (BROADCAST_RECIPIENTS[id]) {
      recipientMap.set(id, BROADCAST_RECIPIENTS[id]);
    } else {
      userIdsToFetch.push(id);
    }
  }

  if (userIdsToFetch.length === 0) {
    return recipientMap;
  }

  const chunkSize = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < userIdsToFetch.length; i += chunkSize) {
    chunks.push(userIdsToFetch.slice(i, i + chunkSize));
  }

  const userProfileMap = new Map<string, UserProfile>();

  try {
    const promises = chunks.map(async (chunk) => {
      try {
        const q = query(
          collection(db, "users"),
          where(documentId(), "in", chunk),
        );
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          userProfileMap.set(docSnap.id, {
            id: docSnap.id,
            ...docSnap.data(),
          } as UserProfile);
        });
      } catch (err) {
        console.warn(
          "[resolveNotificationRecipients] Batch query failed for chunk:",
          err,
        );
      }
    });

    await Promise.all(promises);
  } catch (err) {
    console.warn(
      "[resolveNotificationRecipients] Error resolving recipient batch:",
      err,
    );
  }

  for (const id of userIdsToFetch) {
    const user = userProfileMap.get(id);
    recipientMap.set(id, formatNotificationRecipientDisplay(user, id));
  }

  return recipientMap;
}
