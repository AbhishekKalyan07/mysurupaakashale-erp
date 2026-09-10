import { db } from "@/shared/lib/firebase";
import { collection, query, where, documentId, getDocs } from "firebase/firestore";
import type { AuditLog } from "@/shared/types/audit.types";
import type { Order, ManualPayment, UserProfile, PayrollRecord, DeliveryZone, DailyMenu } from "@/shared/types";

/**
 * A composite map of resolved display strings for actors and entities.
 * Keys are formatted as `user:{uid}` or `{entityType}:{entityId}`.
 */
export type ResolvedAuditReferences = Record<string, string>;

/**
 * Maps an entityType to its corresponding Firestore collection.
 * Entities not listed here are not resolved via direct collection queries.
 */
const ENTITY_COLLECTIONS: Record<string, string> = {
  user: "users",
  customer: "users",
  delivery_partner: "users",
  admin: "users",
  kitchen: "users",
  staff: "users",
  order: "orders",
  payment: "payments",
  invoice: "invoices",
  subscription: "subscriptions",
  salaryAdvance: "salaryAdvances",
  salary_advance: "salaryAdvances",
  salary_profile: "salaryProfiles",
  payroll: "payroll",
  zone: "deliveryZones",
  menu: "dailyMenus",
  route: "dailyDeliveries",
  leave: "leaves"
};

/**
 * Pure service to batch resolve all legacy IDs and entity IDs present in a given list of AuditLogs.
 * Caches previously resolved entries in the provided `resolved` map to avoid duplicate fetching.
 */
export async function resolveAuditReferences(
  logs: AuditLog[],
  resolved: ResolvedAuditReferences = {}
): Promise<ResolvedAuditReferences> {
  const result = { ...resolved };
  const fetches: Record<string, Set<string>> = {};

  // 1. Deduplicate required lookups
  for (const log of logs) {
    // Check Actor
    if (!log.performedByName && log.performedBy) {
      const key = `user:${log.performedBy}`;
      if (!result[key]) {
        fetches["users"] = fetches["users"] || new Set();
        fetches["users"].add(log.performedBy);
      }
    }

    // Check Entity
    if (log.entityId && log.entityType) {
      const key = `${log.entityType}:${log.entityId}`;
      if (!result[key]) {
        if (log.entityType === "attendance") {
          // Attendance special case: resolve the staff member
          const staffId = log.details?.staffId as string;
          if (staffId) {
            fetches["users"] = fetches["users"] || new Set();
            fetches["users"].add(staffId);
          }
        } else if (ENTITY_COLLECTIONS[log.entityType]) {
          const colName = ENTITY_COLLECTIONS[log.entityType];
          fetches[colName] = fetches[colName] || new Set();
          fetches[colName].add(log.entityId);
        } else {
          // Entities we don't fetch: settings, system, etc.
          // They will default to their fallback below.
          if (log.entityType === "settings") {
            result[key] = `Settings (${log.entityId})`;
          } else if (log.entityType === "system") {
            result[key] = `System`;
          }
        }
      }
    }
  }

  // 2. Perform Batch Fetches
  const promises: Promise<void>[] = [];

  for (const [colName, idsSet] of Object.entries(fetches)) {
    const ids = Array.from(idsSet);
    const chunkSize = 30;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      promises.push(
        (async () => {
          try {
            const q = query(
              collection(db, colName),
              where(documentId(), "in", chunk)
            );
            const snap = await getDocs(q);
            
            snap.forEach((docSnap) => {
              const id = docSnap.id;
              const data = docSnap.data();
              const formatted = formatResolvedEntity(colName, id, data);
              
              // Map back to our composite keys
              if (colName === "users") {
                result[`user:${id}`] = formatted;
                result[`customer:${id}`] = formatted;
                result[`delivery_partner:${id}`] = formatted;
                result[`admin:${id}`] = formatted;
                result[`kitchen:${id}`] = formatted;
                result[`staff:${id}`] = formatted;
              } else {
                // Reverse lookup the entity types for this collection
                const eTypes = Object.keys(ENTITY_COLLECTIONS).filter(k => ENTITY_COLLECTIONS[k] === colName);
                for (const et of eTypes) {
                  result[`${et}:${id}`] = formatted;
                }
              }
            });
          } catch (err) {
            console.warn(`[auditReferenceResolver] Failed to resolve chunk for ${colName}:`, err);
            // Missing/permission-denied records will simply remain undefined and fallback to "Unknown entity"
          }
        })()
      );
    }
  }

  await Promise.all(promises);

  // 3. Post-process special case entities (like attendance which maps to user)
  for (const log of logs) {
    if (log.entityType === "attendance" && log.entityId) {
      const key = `attendance:${log.entityId}`;
      const staffId = log.details?.staffId as string;
      if (staffId && result[`user:${staffId}`]) {
        result[key] = `Attendance for ${result[`user:${staffId}`]}`;
      }
    }
  }

  return result;
}

/**
 * Returns a human-readable display string based on the collection's schema.
 */
function formatResolvedEntity(colName: string, _id: string, data: any): string {
  switch (colName) {
    case "users": {
      const user = data as UserProfile;
      if (user.fullName && user.displayId) return `${user.fullName} (${user.displayId})`;
      return user.fullName || user.displayId || "Unknown user";
    }
    case "orders": {
      const order = data as Order;
      if (order.displayId) return `Order ${order.displayId}`;
      if (order.customerName) return `Order for ${order.customerName}`;
      return `Order`;
    }
    case "payments": {
      const payment = data as ManualPayment;
      return payment.customerName ? `Payment from ${payment.customerName}` : `Payment (₹${payment.amount})`;
    }
    case "invoices": {
      return `Invoice (${data.billingMonth || "Unknown Month"} - ₹${data.amount || 0})`;
    }
    case "subscriptions": {
      return `Subscription`;
    }
    case "salaryAdvances": {
      return "Salary Advance";
    }
    case "salaryProfiles": {
      return `Salary Profile`;
    }
    case "payroll": {
      const payroll = data as PayrollRecord;
      return payroll.staffName ? `Payroll for ${payroll.staffName} (${payroll.month})` : `Payroll`;
    }
    case "deliveryZones": {
      const zone = data as DeliveryZone;
      return zone.name ? `Zone: ${zone.name}` : `Zone`;
    }
    case "dailyMenus": {
      const menu = data as DailyMenu;
      return menu.date ? `Menu for ${menu.date}` : `Menu`;
    }
    case "dailyDeliveries": {
      return `Route for ${data.zoneName || "Unknown Zone"} (${data.date || "Unknown Date"})`;
    }
    case "leaves": {
      return data.staffName ? `Leave for ${data.staffName}` : `Leave`;
    }
    default:
      return "Resolved entity";
  }
}
