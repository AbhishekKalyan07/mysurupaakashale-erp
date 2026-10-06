import { db } from "@/shared/lib/firebase";
import { collection, query, where, documentId, getDocs } from "firebase/firestore";
import type { AuditLog } from "@/shared/types/audit.types";
import type { Order, ManualPayment, UserProfile, PayrollRecord, DeliveryZone, DailyMenu, Subscription } from "@/shared/types";
import { formatFailureQueueCustomerDisplay } from "./failureQueueReferenceResolver";

/**
 * A composite map of resolved display strings for actors, entities, and details.
 * Keys are formatted as `user:{uid}`, `customer:{uid}`, `subscription:{id}`, or `{entityType}:{entityId}`.
 */
export type ResolvedAuditReferences = Record<string, string>;

/**
 * Normalizes entityType variants (camelCase, PascalCase, snake_case) to canonical names.
 */
export function normalizeEntityType(type?: string): string {
  if (!type) return "";
  const t = type.toLowerCase().replace(/[-_]/g, "");
  switch (t) {
    case "user":
    case "customer":
    case "deliverypartner":
    case "admin":
    case "kitchen":
    case "staff":
      return "user";
    case "order":
      return "order";
    case "payment":
      return "payment";
    case "invoice":
      return "invoice";
    case "subscription":
      return "subscription";
    case "salaryadvance":
      return "salaryAdvance";
    case "salaryprofile":
      return "salaryProfile";
    case "payroll":
      return "payroll";
    case "zone":
    case "deliveryzone":
      return "zone";
    case "menu":
    case "dailymenu":
      return "menu";
    case "route":
    case "dailydelivery":
      return "route";
    case "leave":
    case "leaves":
      return "leave";
    case "mealplan":
      return "mealPlan";
    case "addon":
    case "addons":
      return "addon";
    case "setting":
    case "settings":
    case "operationalsetting":
    case "operationalsettings":
      return "settings";
    case "system":
      return "system";
    case "attendance":
      return "attendance";
    default:
      return type.toLowerCase();
  }
}

/**
 * Maps a canonical entityType to its corresponding Firestore collection.
 */
const NORMALIZED_ENTITY_TO_COLLECTION: Record<string, string> = {
  user: "users",
  order: "orders",
  payment: "payments",
  invoice: "invoices",
  subscription: "subscriptions",
  salaryAdvance: "salaryAdvances",
  salaryProfile: "salaryProfiles",
  payroll: "payroll",
  zone: "deliveryZones",
  menu: "dailyMenus",
  route: "dailyDeliveries",
  leave: "leaves",
  mealPlan: "mealPlans",
  addon: "addons",
};

/**
 * Legacy dictionary kept for backward compatibility.
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
  deliveryZone: "deliveryZones",
  menu: "dailyMenus",
  dailyMenu: "dailyMenus",
  route: "dailyDeliveries",
  dailyDelivery: "dailyDeliveries",
  leave: "leaves",
  mealPlan: "mealPlans",
  meal_plan: "mealPlans",
  addon: "addons",
};

/**
 * Pure service to batch resolve all legacy IDs, entity IDs, and details references
 * present in a given list of AuditLogs.
 * Caches previously resolved entries in the provided `resolved` map to avoid duplicate fetching.
 */
export async function resolveAuditReferences(
  logs: AuditLog[],
  resolved: ResolvedAuditReferences = {}
): Promise<ResolvedAuditReferences> {
  const result = { ...resolved };
  const fetches: Record<string, Set<string>> = {};

  // 1. Deduplicate required lookups from actors, entities, and details
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
      const normType = normalizeEntityType(log.entityType);
      const key = `${log.entityType}:${log.entityId}`;

      if (!result[key]) {
        if (normType === "attendance") {
          // Attendance special case: resolve the staff member
          const staffId = log.details?.staffId as string;
          if (staffId) {
            fetches["users"] = fetches["users"] || new Set();
            fetches["users"].add(staffId);
          }
        } else if (normType === "settings") {
          result[key] = `Settings (${log.entityId})`;
          result[`settings:${log.entityId}`] = `Settings (${log.entityId})`;
        } else if (normType === "system") {
          result[key] = "System";
          result[`system:${log.entityId}`] = "System";
        } else {
          const colName =
            NORMALIZED_ENTITY_TO_COLLECTION[normType] ||
            ENTITY_COLLECTIONS[log.entityType];
          if (colName) {
            fetches[colName] = fetches[colName] || new Set();
            fetches[colName].add(log.entityId);
          }
        }
      }
    }

    // Check Details (resolve customerId, subscriptionId, staffId, orderId)
    const details = log.details;
    if (details && typeof details === "object") {
      const custId = details.customerId || details.userId;
      if (
        custId &&
        typeof custId === "string" &&
        !result[`customer:${custId}`] &&
        !result[`user:${custId}`]
      ) {
        fetches["users"] = fetches["users"] || new Set();
        fetches["users"].add(custId);
      }

      const subId = details.subscriptionId;
      if (
        subId &&
        typeof subId === "string" &&
        !result[`subscription:${subId}`]
      ) {
        fetches["subscriptions"] = fetches["subscriptions"] || new Set();
        fetches["subscriptions"].add(subId);
      }

      const ordId = details.orderId;
      if (
        ordId &&
        typeof ordId === "string" &&
        !result[`order:${ordId}`]
      ) {
        fetches["orders"] = fetches["orders"] || new Set();
        fetches["orders"].add(ordId);
      }

      const stfId = details.staffId;
      if (
        stfId &&
        typeof stfId === "string" &&
        !result[`user:${stfId}`]
      ) {
        fetches["users"] = fetches["users"] || new Set();
        fetches["users"].add(stfId);
      }
    }
  }

  // 2. Perform Batch Fetches
  const promises: Promise<void>[] = [];
  const mealPlansMap = new Map<string, string>();

  // If subscriptions are being fetched, optionally resolve mealPlan names
  if (fetches["subscriptions"] && fetches["subscriptions"].size > 0) {
    promises.push(
      (async () => {
        try {
          const snap = await getDocs(collection(db, "mealPlans"));
          snap.forEach((d) => {
            const data = d.data();
            if (data?.name) mealPlansMap.set(d.id, data.name);
          });
        } catch {
          // mealPlans query failure is non-fatal
        }
      })()
    );
  }

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
              const formatted = formatResolvedEntity(colName, id, data, mealPlansMap);

              // Map back to our composite keys
              if (colName === "users") {
                result[`user:${id}`] = formatted;
                result[`customer:${id}`] = formatted;
                result[`delivery_partner:${id}`] = formatted;
                result[`admin:${id}`] = formatted;
                result[`kitchen:${id}`] = formatted;
                result[`staff:${id}`] = formatted;
              } else if (colName === "subscriptions") {
                result[`subscription:${id}`] = formatted;
              } else if (colName === "mealPlans") {
                result[`mealPlan:${id}`] = formatted;
                result[`meal_plan:${id}`] = formatted;
              } else if (colName === "addons") {
                result[`addon:${id}`] = formatted;
                result[`addons:${id}`] = formatted;
              } else {
                // Reverse lookup the entity types for this collection
                const eTypes = Object.keys(ENTITY_COLLECTIONS).filter(
                  (k) => ENTITY_COLLECTIONS[k] === colName
                );
                for (const et of eTypes) {
                  result[`${et}:${id}`] = formatted;
                }
              }

              // Also ensure direct matching for any log referencing this exact entityType
              for (const log of logs) {
                if (log.entityId === id && log.entityType) {
                  const norm = normalizeEntityType(log.entityType);
                  if (
                    NORMALIZED_ENTITY_TO_COLLECTION[norm] === colName ||
                    ENTITY_COLLECTIONS[log.entityType] === colName
                  ) {
                    result[`${log.entityType}:${id}`] = formatted;
                    result[`${log.entityType.toLowerCase()}:${id}`] = formatted;
                    result[`${norm}:${id}`] = formatted;
                  }
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
    if (normalizeEntityType(log.entityType) === "attendance" && log.entityId) {
      const key = `attendance:${log.entityId}`;
      const staffId = log.details?.staffId as string;
      if (staffId && result[`user:${staffId}`]) {
        result[key] = `Attendance for ${result[`user:${staffId}`]}`;
        result[`${log.entityType}:${log.entityId}`] = result[key];
      }
    }
  }

  return result;
}

/**
 * Returns a human-readable display string based on the collection's schema.
 */
function formatResolvedEntity(
  colName: string,
  id: string,
  data: any,
  mealPlansMap?: Map<string, string>
): string {
  switch (colName) {
    case "users": {
      const user = data as UserProfile;
      return formatFailureQueueCustomerDisplay(user, id);
    }
    case "orders": {
      const order = data as Order;
      if (order.displayId) return `Order ${order.displayId}`;
      if (order.customerName) return `Order for ${order.customerName}`;
      return `Order`;
    }
    case "payments": {
      const payment = data as ManualPayment;
      const amountStr =
        payment.amount !== undefined
          ? `₹${Number(payment.amount).toLocaleString("en-IN")}`
          : "";
      const methodStr = payment.paymentMethod
        ? payment.paymentMethod.toLowerCase() === "upi"
          ? "UPI"
          : payment.paymentMethod.replace(/_/g, " ")
        : "";
      const meta = [amountStr, methodStr].filter(Boolean).join(" - ");
      const metaSuffix = meta ? ` (${meta})` : "";
      return payment.customerName
        ? `Payment from ${payment.customerName}${metaSuffix}`
        : `Payment from Customer${metaSuffix}`;
    }
    case "invoices": {
      return `Invoice (${data.billingMonth || "Unknown Month"} - ₹${data.amount || 0})`;
    }
    case "subscriptions": {
      const sub = data as Subscription;
      const planName = sub?.planId ? mealPlansMap?.get(sub.planId) : undefined;
      if (planName) {
        const cycle = sub?.billingCycle
          ? sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1)
          : "";
        return cycle ? `${planName} (${cycle})` : planName;
      }
      if (sub?.planTier) {
        const tier =
          String(sub.planTier).charAt(0).toUpperCase() +
          String(sub.planTier).slice(1);
        const cycle = sub?.billingCycle
          ? sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1)
          : "";
        return cycle ? `${tier} Plan (${cycle})` : `${tier} Plan`;
      }
      return "Subscription";
    }
    case "mealPlans": {
      return data?.name ? String(data.name) : "Meal Plan";
    }
    case "addons": {
      return data?.name ? String(data.name) : "Add-on";
    }
    case "salaryAdvances": {
      return "Salary Advance";
    }
    case "salaryProfiles": {
      return `Salary Profile`;
    }
    case "payroll": {
      const payroll = data as PayrollRecord;
      return payroll.staffName
        ? `Payroll for ${payroll.staffName} (${payroll.month})`
        : `Payroll`;
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
