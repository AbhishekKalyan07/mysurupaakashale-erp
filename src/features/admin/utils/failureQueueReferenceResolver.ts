import { db } from "@/shared/lib/firebase";
import { collection, query, where, documentId, getDocs } from "firebase/firestore";
import type { FailureQueueRecord } from "@/shared/services/firestore/failureQueueRepository";
import type { UserProfile, Subscription } from "@/shared/types";
import { formatAllottedId } from "@/shared/utils/displayId";

export interface FailureQueueReferences {
  customerDisplayMap: Map<string, string>;
  subscriptionDisplayMap: Map<string, string>;
}

/**
 * Formats a business-safe customer display string:
 * e.g. "Rahul Kumar (MP-001)"
 * Falls back to clean allotted code (e.g. "Customer (MP-WTEA9L)") if displayId is missing.
 * NEVER exposes a raw Firebase Auth UID in the normal card view.
 */
export function formatFailureQueueCustomerDisplay(
  customer?: Partial<UserProfile> | null,
  rawCustomerId?: string,
): string {
  const name = customer?.fullName?.trim();
  const hasValidName = !!(name && name !== "Unknown Customer" && name !== "Customer");

  const candidateId = customer?.displayId;
  const allottedId = formatAllottedId(candidateId, customer?.id || rawCustomerId, "customer");
  const hasValidId = allottedId && allottedId !== "N/A";

  if (hasValidName && hasValidId) {
    return `${name} (${allottedId})`;
  }
  if (hasValidName) {
    return name;
  }
  if (hasValidId) {
    return `Customer (${allottedId})`;
  }
  return "Customer";
}

/**
 * Formats a business-safe subscription display string:
 * e.g. "Standard Lunch Plan (Monthly)" or "Regular Plan (Weekly)"
 * Falls back to a clean compact reference (e.g. "Subscription (SUB-CE1001)") if subscription is not in DB.
 * NEVER exposes a raw 36-character subscription UUID in the normal card view.
 */
export function formatFailureQueueSubscriptionDisplay(
  subscription?: Partial<Subscription> | null,
  planName?: string,
  rawSubscriptionId?: string | null,
): string {
  if (planName) {
    const cycle = subscription?.billingCycle
      ? subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1)
      : "";
    return cycle ? `${planName} (${cycle})` : planName;
  }

  if (subscription?.planTier) {
    const tier = subscription.planTier.charAt(0).toUpperCase() + subscription.planTier.slice(1);
    const cycle = subscription.billingCycle
      ? subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1)
      : "";
    return cycle ? `${tier} Plan (${cycle})` : `${tier} Plan`;
  }

  if (rawSubscriptionId) {
    const cleanId = rawSubscriptionId.replace(/[^A-Za-z0-9]/g, "");
    const shortCode = cleanId.slice(0, 6).toUpperCase();
    return `Subscription (SUB-${shortCode || "PLAN"})`;
  }

  return "Subscription";
}

/**
 * Resolves human-readable customer names, display IDs (MP-xxx), and subscription/plan details
 * for a list of failure queue records in efficient batches of up to 30.
 */
export async function resolveFailureQueueReferences(
  incidents: FailureQueueRecord[],
): Promise<FailureQueueReferences> {
  const customerDisplayMap = new Map<string, string>();
  const subscriptionDisplayMap = new Map<string, string>();

  if (!incidents || incidents.length === 0) {
    return { customerDisplayMap, subscriptionDisplayMap };
  }

  const customerIds = Array.from(
    new Set(incidents.map((i) => i.customerId).filter(Boolean)),
  );
  const subscriptionIds = Array.from(
    new Set(
      incidents
        .map((i) => i.subscriptionId)
        .filter((id): id is string => Boolean(id && id.trim())),
    ),
  );

  const CHUNK_SIZE = 30;

  // 1. Fetch Users in chunks
  const userMap = new Map<string, UserProfile>();
  const userChunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
    userChunks.push(customerIds.slice(i, i + CHUNK_SIZE));
  }

  // 2. Fetch Subscriptions in chunks
  const subMap = new Map<string, Subscription>();
  const subChunks: string[][] = [];
  for (let i = 0; i < subscriptionIds.length; i += CHUNK_SIZE) {
    subChunks.push(subscriptionIds.slice(i, i + CHUNK_SIZE));
  }

  const [mealPlanSnaps] = await Promise.all([
    // Fetch meal plans
    (async () => {
      try {
        const snap = await getDocs(collection(db, "mealPlans"));
        const map = new Map<string, string>();
        snap.forEach((d) => {
          const data = d.data();
          if (data?.name) map.set(d.id, data.name);
        });
        return map;
      } catch {
        return new Map<string, string>();
      }
    })(),

    // Fetch users
    Promise.all(
      userChunks.map(async (chunk) => {
        try {
          const q = query(collection(db, "users"), where(documentId(), "in", chunk));
          const snap = await getDocs(q);
          snap.forEach((d) => userMap.set(d.id, { id: d.id, ...d.data() } as UserProfile));
        } catch (err) {
          console.warn("[failureQueueReferenceResolver] User batch fetch error:", err);
        }
      }),
    ),

    // Fetch subscriptions
    Promise.all(
      subChunks.map(async (chunk) => {
        try {
          const q = query(
            collection(db, "subscriptions"),
            where(documentId(), "in", chunk),
          );
          const snap = await getDocs(q);
          snap.forEach((d) => subMap.set(d.id, { id: d.id, ...d.data() } as Subscription));
        } catch (err) {
          console.warn("[failureQueueReferenceResolver] Subscription batch fetch error:", err);
        }
      }),
    ),
  ]);

  // 3. Populate display maps
  for (const incident of incidents) {
    if (incident.customerId && !customerDisplayMap.has(incident.customerId)) {
      const user = userMap.get(incident.customerId);
      customerDisplayMap.set(
        incident.customerId,
        formatFailureQueueCustomerDisplay(user, incident.customerId),
      );
    }

    if (incident.subscriptionId && !subscriptionDisplayMap.has(incident.subscriptionId)) {
      const sub = subMap.get(incident.subscriptionId);
      const planName = sub?.planId ? mealPlanSnaps.get(sub.planId) : undefined;
      subscriptionDisplayMap.set(
        incident.subscriptionId,
        formatFailureQueueSubscriptionDisplay(sub, planName, incident.subscriptionId),
      );
    }
  }

  return { customerDisplayMap, subscriptionDisplayMap };
}
