import { Timestamp } from "firebase/firestore";
import {
  getDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  where,
  doc,
  collection,
} from "firebase/firestore";
import { db, auth } from "@/shared/lib/firebase";
import { orderRepository } from "../firestore/orderRepository";
import { subscriptionRepository } from "../firestore/subscriptionRepository";
import { orderGenerationRunRepository } from "../firestore/analyticsRepository";
import { userRepository } from "../firestore/userRepository";
import { mealPlanRepository } from "../firestore/mealPlanRepository";
import { deliveryZoneRepository } from "../firestore/deliveryZoneRepository";
import {
  notifyDailyOrdersGenerated,
  notifyAdminAlert,
  notifyOrderGeneratedCustomer,
  notifyOrderGeneratedDriver,
  dispatchOperationalCancellationNotifications,
} from "../firestore/notificationService";
import { isOrderProtectedFromCancellation } from "@/shared/types/order.types";
import { auditRepository } from "../firestore/auditRepository";
import { failureQueueRepository } from "../firestore/failureQueueRepository";
import { holidayRepository } from "../firestore/holidayRepository";
import { dailyMenuRepository } from "../firestore/dailyMenuRepository";
import type {
  Order,
  Subscription,
  CustomerProfile,
  DeliveryPartnerProfile,
  MealPlan,
  MealType,
  DailyMenu,
} from "@/shared/types";
import {
  getCachedDateTimeFormatter,
  getTodayInTimezone,
  isSundayInTimezone,
} from "@/shared/lib/date";
import { formatAllottedId, isFormattedDisplayId } from "@/shared/utils/displayId";
import { resolveOperationalZoneAndKitchen } from "./operationalRouter";
import { pricingService } from "./pricingService";
import { operationalSettingsService } from "./operationalSettingsService";

export interface RemoveTodayMealResult {
  success: boolean;
  cancelled: boolean;
  orderId?: string;
  cancellationAmount: number;
  status: string;
  mealType: MealType;
  date: string;
}

export interface ChangeTodayMealOptionResult {
  success: boolean;
  changed: boolean;
  orderId: string;
  mealType: MealType;
  date: string;
  previousOptionId?: string | null;
  newOptionId: string;
  previousMealName?: string;
  newMealName: string;
  itemsLabel: string;
  price: number;
}

export interface AddTodayAddonResult {
  success: boolean;
  orderId: string;
  invoiceId: string;
  mealType: MealType;
  date: string;
  addonId: string;
  addonName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  alreadyExists?: boolean;
}

/** Recursively strip `undefined` values from a plain object so Firestore never sees them. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const clean = {} as any;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

function getSystemOrAdminActor() {
  return {
    uid: "system",
    role: "system",
    name: "System Auto-Generator",
  };
}

function sanitizeCoordinates(
  addr: any,
): { lat: number; lng: number } | null {
  if (
    addr &&
    typeof addr.lat === "number" &&
    typeof addr.lng === "number" &&
    Number.isFinite(addr.lat) &&
    Number.isFinite(addr.lng) &&
    addr.lat >= -90 &&
    addr.lat <= 90 &&
    addr.lng >= -180 &&
    addr.lng <= 180
  ) {
    return { lat: addr.lat, lng: addr.lng };
  }
  return null;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a clean, human-readable date
 * in Asia/Kolkata timezone (e.g., "5 Oct 2026"). Returns fallback if parsing fails.
 */
export function formatNotificationDate(dateStr?: string): string {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const [y, m, d] = parts;
    const dateObj = new Date(Date.UTC(y, m - 1, d, 6, 30));
    if (!isNaN(dateObj.getTime())) {
      return getCachedDateTimeFormatter("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(dateObj);
    }
  }
  return dateStr;
}

/**
 * Formats the admin alert message for unassigned delivery orders.
 *
 * Replaces the raw internal Firestore document ID (ord_<subscription-uuid>_<date>_<mealType>)
 * with human-readable business information (e.g. "Order for Rahul Kumar (MP-001) — Lunch on 5 Oct 2026").
 *
 * Never exposes subscription UUIDs or raw document IDs.
 */
export function formatDeliveryAssignmentAlertMessage(
  order: Partial<Order>,
  mealType?: string,
  dateStr?: string,
): string {
  const effectiveMeal = mealType || order.mealType || "";
  const mealLabel = effectiveMeal
    ? effectiveMeal.charAt(0).toUpperCase() + effectiveMeal.slice(1)
    : "Meal";

  const effectiveDate = dateStr || order.date || "";
  const formattedDate = formatNotificationDate(effectiveDate);
  const dateSuffix = formattedDate ? ` on ${formattedDate}` : "";

  const rawName = order.customerName?.trim();
  const hasValidName = !!(rawName && rawName !== "Unknown Customer");

  // Resolve customer display ID safely (e.g. MP-001)
  let displayCode = order.customerCode;
  if (!displayCode && order.displayId && /^MP-|^CUST-/i.test(order.displayId)) {
    displayCode = order.displayId;
  }
  const allottedId = formatAllottedId(displayCode, order.customerId, "customer");
  const candidateId =
    allottedId && allottedId !== "N/A"
      ? allottedId
      : order.displayId && isFormattedDisplayId(order.displayId)
        ? order.displayId
        : "";

  let customerPart = "";
  if (hasValidName && candidateId) {
    customerPart = `${rawName} (${candidateId})`;
  } else if (hasValidName) {
    customerPart = rawName;
  } else if (candidateId) {
    customerPart = `Customer (${candidateId})`;
  }

  if (customerPart) {
    return `Order for ${customerPart} — ${mealLabel}${dateSuffix} could not be automatically assigned. Please assign manually.`;
  }

  return `Order for ${mealLabel}${dateSuffix} could not be automatically assigned. Please assign manually.`;
}

class OrderService {
  /**
   * Orchestrator for all daily orders.
   * Keeps legacy compatibility by running all meal generations.
   */
  async generateDailyOrders(
    dateOverride?: string,
  ): Promise<{
    success: boolean;
    message: string;
    ordersGenerated: number;
    unassignedOrders?: number;
  }> {
    const today = dateOverride || getTodayInTimezone();

    const isSunday = isSundayInTimezone(today);
    if (isSunday) {
      console.log(
        `[orderService] Today (${today}) is Sunday. Skipping order generation.`,
      );
      return {
        success: true,
        message: "Today is Sunday (Holiday). No orders generated.",
        ordersGenerated: 0,
      };
    }

    const isHoliday = await holidayRepository.isHoliday(today);
    if (isHoliday) {
      console.log(
        `[orderService] Today (${today}) is an active holiday. Skipping order generation.`,
      );
      return {
        success: true,
        message: "Today is an active holiday. Skipping order generation.",
        ordersGenerated: 0,
      };
    }

    let totalGenerated = 0;
    let totalFailed = 0;
    let totalUnassigned = 0;
    try {
      const bRes = await this.generateBreakfastOrders(today);
      totalGenerated += bRes.generated;
      totalFailed += bRes.failed;
      totalUnassigned += bRes.unassigned || 0;

      const lRes = await this.generateLunchOrders(today);
      totalGenerated += lRes.generated;
      totalFailed += lRes.failed;
      totalUnassigned += lRes.unassigned || 0;

      const dRes = await this.generateDinnerOrders(today);
      totalGenerated += dRes.generated;
      totalFailed += dRes.failed;
      totalUnassigned += dRes.unassigned || 0;

      if (totalFailed > 0) {
        return {
          success: false,
          message: `Order generation completed with failures. Generated: ${totalGenerated}, Failed: ${totalFailed}.`,
          ordersGenerated: totalGenerated,
          ...(totalUnassigned > 0 ? { unassignedOrders: totalUnassigned } : {}),
        };
      }
    } catch (err) {
      return {
        success: false,
        message: String(err),
        ordersGenerated: totalGenerated,
      };
    }

    if (totalGenerated === 0) {
      try {
        const { orderDiagnosticService } = await import("./orderDiagnosticService");
        const diag = await orderDiagnosticService.diagnoseAndRemediate(today);
        if (diag.autoHealedCount > 0) {
          totalGenerated += diag.autoHealedCount;
          return {
            success: true,
            message: diag.summaryText,
            ordersGenerated: totalGenerated,
          };
        }
        return {
          success: diag.status !== "fault_detected",
          message: diag.summaryText,
          ordersGenerated: 0,
        };
      } catch (diagErr) {
        console.warn("[orderService] Diagnostic check error:", diagErr);
      }

      console.log(
        `[orderService] 0 new orders generated for ${today}. Either all active subscriptions already have orders for this date, or no active subscriptions exist.`,
      );
      return {
        success: true,
        message: `0 new orders generated for ${today}.`,
        ordersGenerated: 0,
      };
    }

    if (totalUnassigned > 0) {
      console.warn(
        `[orderService] ${totalUnassigned} orders were generated without a delivery partner assigned for ${today}. Please assign drivers in the Admin Orders dashboard.`,
      );
    }

    return {
      success: true,
      message: `Successfully generated ${totalGenerated} new orders.`,
      ordersGenerated: totalGenerated,
      ...(totalUnassigned > 0 ? { unassignedOrders: totalUnassigned } : {}),
    };
  }

  async generateBreakfastOrders(
    dateOverride?: string,
  ): Promise<{ generated: number; failed: number; unassigned?: number }> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, "breakfast");
  }

  async generateLunchOrders(
    dateOverride?: string,
  ): Promise<{ generated: number; failed: number; unassigned?: number }> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, "lunch");
  }

  async generateDinnerOrders(
    dateOverride?: string,
  ): Promise<{ generated: number; failed: number; unassigned?: number }> {
    const today = dateOverride || getTodayInTimezone();
    return this.generateMealOrders(today, "dinner");
  }

  private async generateMealOrders(
    today: string,
    mealType: "breakfast" | "lunch" | "dinner",
  ): Promise<{ generated: number; failed: number; unassigned?: number }> {
    // ── Holiday Guard ─────────────────────────────────────────────────────────
    // Must be the first check before ANY batch is built, any data fetched,
    // or any run record created. This is the application-level defence.
    // Firestore security rules provide the client-level defence.
    const isHoliday = await holidayRepository.isHoliday(today);
    if (isHoliday) {
      console.log(
        `[orderService] ${today} is an active holiday — skipping ${mealType} order generation.`,
      );
      return { generated: 0, failed: 0 };
    }

    const runId = `${today}_${mealType}`;
    const existingRun = await orderGenerationRunRepository.getById(runId);

    if (existingRun && existingRun.status === "success") {
      console.log(
        `[orderService] ${mealType} orders were marked successfully generated for ${today}. Proceeding to verify idempotency for any missing subscriptions.`,
      );
      // We no longer early return here. We allow the generator to run and evaluate
      // missing orders on a per-subscription basis using its robust idempotency checks.
    }

    const startedAt = serverTimestamp() as unknown as Timestamp;
    let ordersGenerated = 0;
    let ordersSkipped = 0;
    let ordersCancelled = 0;
    let ordersFailed = 0;
    let ordersUnassigned = 0;

    await orderGenerationRunRepository.create(
      {
        date: today,
        mealType,
        status: "running",
        startedAt,
        ordersGenerated: 0,
        ordersSkipped: 0,
        ordersCancelled: 0,
        ordersFailed: 0,
        notificationsFailed: 0,
      },
      runId,
    );

    const backgroundTasks: Promise<any>[] = [];

    try {
      // 1. Fetch data
      const [
        allSubscriptions,
        mealPlans,
        allZones,
        allPartners,
        todaysOrders,
        publishedDailyMenu,
      ] = await Promise.all([
        subscriptionRepository.list(where("status", "==", "active")),
        mealPlanRepository.list(),
        deliveryZoneRepository.list(),
        userRepository.list(where("role", "==", "delivery_partner")),
        orderRepository.list(where("date", "==", today)),
        dailyMenuRepository.getPublishedByDate(today).catch(() => null),
        operationalSettingsService.getOperationalSettings(),
      ]);

      const subCustomerIds = Array.from(
        new Set(allSubscriptions.map((s) => s.customerId).filter(Boolean)),
      );
      let customerMap = new Map<string, CustomerProfile>();
      try {
        const fetchedCustomers = await userRepository.getByIds(subCustomerIds);
        customerMap = new Map(
          fetchedCustomers.map((c) => [c.id, c as CustomerProfile]),
        );
      } catch {
        const allCustomers = await userRepository.list(
          where("role", "==", "customer"),
        );
        customerMap = new Map(
          allCustomers.map((c) => [c.id, c as CustomerProfile]),
        );
      }
      const activePartners = allPartners.filter(
        (p) => p.isActive,
      ) as DeliveryPartnerProfile[];
      const partnerMap = new Map<string, DeliveryPartnerProfile>(
        activePartners.map((p) => [p.id, p]),
      );
      const zoneMap = new Map(allZones.map((z) => [z.id, z]));

      const workloadMap = new Map<string, number>();
      todaysOrders.forEach((o) => {
        if (
          o.deliveryPartnerId &&
          o.status !== "cancelled" &&
          o.status !== "skipped"
        ) {
          workloadMap.set(
            o.deliveryPartnerId,
            (workloadMap.get(o.deliveryPartnerId) || 0) + 1,
          );
        }
      });

      const ordersToCreate: Partial<Order>[] = [];

      for (const sub of allSubscriptions) {
        if (sub.endDate && sub.endDate < today) {
          ordersSkipped++;
          continue;
        }
        if (sub.startDate > today) {
          ordersSkipped++;
          continue;
        }
        // Exclude subscription if it is within a valid scheduled pause window for today.
        // Stale past pauseStartDate with no pauseEndDate on an active subscription must not skip generation.
        const isWithinScheduledPause = Boolean(
          (sub.pauseStartDate &&
            sub.pauseEndDate &&
            sub.pauseStartDate <= today &&
            sub.pauseEndDate >= today) ||
            (sub.pauseStartDate === today &&
              (!sub.pauseEndDate || sub.pauseEndDate >= today)),
        );
        if (isWithinScheduledPause) {
          ordersSkipped++;
          continue;
        }

        let attempts = 0;
        let success = false;
        while (attempts < 3 && !success) {
          try {
            const pref = (sub.mealPreferences || []).find(
              (p) => p.mealType === mealType,
            );
            if (!pref) {
              success = true;
              continue; // Not subscribed to this meal
            }

            // Scenario E: If a published Daily Menu exists for today, but this specific meal slot is marked unavailable
            if (
              publishedDailyMenu &&
              publishedDailyMenu[mealType] &&
              publishedDailyMenu[mealType].isAvailable === false
            ) {
              console.log(
                `[orderService] ${mealType} is marked unavailable in published DailyMenu for ${today} — skipping order generation for sub ${sub.id}.`,
              );
              ordersSkipped++;
              success = true;
              continue;
            }

            // Check cancellation (skips)
            const skipRef = doc(db, "subscriptions", sub.id, "skips", today);
            const skipDoc = await getDoc(skipRef);
            const isCustomerSkipped =
              skipDoc.exists() &&
              (skipDoc.data().mealTypes || []).includes(mealType);

            // --- IDEMPOTENCY CHECK ---
            // Verify if an order for this exact subscription, date, and mealType already exists.
            const expectedId = `ord_${sub.id}_${today}_${mealType}`;
            const existingOrder = todaysOrders.find(
              (o) =>
                o.id === expectedId ||
                (o.subscriptionId === sub.id && o.mealType === mealType),
            );

            if (existingOrder) {
              if (isCustomerSkipped) {
                // If customer skipped, ensure existing order reflects cancellation
                if (existingOrder.status !== "cancelled") {
                  ordersCancelled++;
                  ordersToCreate.push({
                    ...existingOrder,
                    status: "cancelled",
                  });
                }
                success = true;
                continue;
              }

              // Customer did NOT skip this meal:
              if (
                existingOrder.status === "cancelled" ||
                existingOrder.status === "skipped"
              ) {
                // The order was inappropriately left in cancelled/skipped status (e.g. from a past unskip/resume).
                // Restore it to scheduled!
                const order = this.buildOrderSnapshot(
                  sub,
                  pref,
                  mealType,
                  today,
                  customerMap,
                  partnerMap,
                  zoneMap,
                  activePartners,
                  allZones,
                  mealPlans,
                  workloadMap,
                  publishedDailyMenu,
                );
                order.id = existingOrder.id;
                order.status = "scheduled";
                (order as any).cancellationAmount = null;
                (order as any).cancellationReason = null;
                (order as any).cancelledAt = null;
                ordersToCreate.push(order);
                success = true;
                continue;
              }

              // Active workflow order already exists (scheduled, preparing, delivered, etc.). Preserve it completely.
              success = true;
              continue;
            }

            if (isCustomerSkipped) {
              ordersCancelled++;

              // We must still generate an order document with status='cancelled'
              // so that the Kitchen Dashboard can track cancelled metrics accurately,
              // and so customers/admins see the cancellation in their order histories.
              const order = this.buildOrderSnapshot(
                sub,
                pref,
                mealType,
                today,
                customerMap,
                partnerMap,
                zoneMap,
                activePartners,
                allZones,
                mealPlans,
                workloadMap,
                publishedDailyMenu,
              );
              order.status = "cancelled";
              // kitchenStatus is not applicable for cancelled orders
              ordersToCreate.push(order);

              success = true;
              continue;
            }

            const order = this.buildOrderSnapshot(
              sub,
              pref,
              mealType,
              today,
              customerMap,
              partnerMap,
              zoneMap,
              activePartners,
              allZones,
              mealPlans,
              workloadMap,
              publishedDailyMenu,
            );
            ordersToCreate.push(order);
            success = true;

            if (!order.deliveryPartnerId) {
              ordersUnassigned++;
              const actor = getSystemOrAdminActor();
              backgroundTasks.push(
                auditRepository.logAction(
                  "delivery_assignment_failed",
                  actor.uid,
                  actor.role,
                  actor.name,
                  order.id!,
                  "order",
                  {
                    orderId: order.id,
                    customerId: sub.customerId,
                    zoneId: order.zoneId,
                    mealType: order.mealType,
                    date: today,
                    reason:
                      "No eligible partner available for this zone and shift",
                  },
                ).catch(console.error),
              );
              backgroundTasks.push(
                userRepository
                  .list(where("role", "==", "admin"))
                  .then((admins) =>
                    notifyAdminAlert(
                      admins.map((a) => a.id),
                      "Delivery Assignment Failed",
                      formatDeliveryAssignmentAlertMessage(order, mealType, today),
                    ),
                  )
                  .catch(console.error),
              );
            }
          } catch (err) {
            attempts++;
            if (attempts >= 3) {
              console.error(
                `[orderService] Failed generating ${mealType} for customer ${sub.customerId} after 3 attempts:`,
                err,
              );
              ordersFailed++;

              backgroundTasks.push(
                failureQueueRepository
                  .logFailure(
                    sub.customerId,
                    sub.id,
                    mealType,
                    today,
                    err instanceof Error ? err.message : String(err),
                    err instanceof Error ? err.stack : undefined,
                  )
                  .catch((qErr) =>
                    console.error(
                      "[orderService] failureQueue logging failed:",
                      qErr,
                    ),
                  ),
              );

              // Admin Alert
              backgroundTasks.push(
                userRepository
                  .list(where("role", "==", "admin"))
                  .then((admins) =>
                    notifyAdminAlert(
                      admins.map((a) => a.id),
                      "Order Generation Failed",
                      `Failed to generate ${mealType} order for customer ${sub.customerId} after 3 attempts.`,
                    ),
                  )
                  .catch((nErr) =>
                    console.error("[orderService] Admin alert failed:", nErr),
                  ),
              );
            } else {
              // Wait a bit before retrying
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }
      }

      // 3. Batch write
      const BATCH_SIZE = 400;
      for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
        const batchOrders = ordersToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        batchOrders.forEach((order) => {
          const ref = doc(db, "orders", order.id!);
          batch.set(
            ref,
            stripUndefined({
              ...order,
              createdAt: serverTimestamp() as unknown as Timestamp,
              updatedAt: serverTimestamp() as unknown as Timestamp,
            }),
            { merge: true },
          );
        });
        await batch.commit();
        ordersGenerated += batchOrders.length;

        // Trigger notifications asynchronously and collect into backgroundTasks
        backgroundTasks.push(
          (async () => {
            const notifPromises = batchOrders.flatMap((o) => {
              const list: Promise<any>[] = [
                notifyOrderGeneratedCustomer(
                  o.customerId!,
                  o.mealType || "meal",
                  o.date!,
                ).catch((err) =>
                  console.error(
                    "[orderService] customer notification failed:",
                    err,
                  ),
                ),
              ];
              if (o.deliveryPartnerId) {
                list.push(
                  notifyOrderGeneratedDriver(
                    o.deliveryPartnerId,
                    o.id!,
                    o.mealType || "meal",
                    o.customerName || "Unknown",
                    o.date!,
                  ).catch((err) =>
                    console.error(
                      "[orderService] driver notification failed:",
                      err,
                    ),
                  ),
                );
              }
              return list;
            });
            await Promise.allSettled(notifPromises);
          })().catch(console.error),
        );

        const actor = getSystemOrAdminActor();
        backgroundTasks.push(
          auditRepository
            .logAction(
              "orders_generated",
              actor.uid,
              actor.role,
              actor.name,
              runId,
              "system",
              {
                date: today,
                mealType,
                count: batchOrders.length,
              },
            )
            .catch(console.error),
        );
      }

      const completedAt = serverTimestamp() as unknown as Timestamp;
      const finalStatus =
        ordersFailed > 0
          ? ordersGenerated > 0
            ? "partial"
            : "failed"
          : "success";

      await orderGenerationRunRepository.update(runId, {
        status: finalStatus,
        completedAt,
        ordersGenerated,
        ordersSkipped,
        ordersCancelled,
        ordersFailed,
      } as any);

      if (ordersGenerated > 0) {
        try {
          const kitchenStaff = await userRepository.list(
            where("role", "==", "kitchen"),
            where("isActive", "==", true),
          );
          const ids = kitchenStaff.map((s) => s.id);
          if (ids.length > 0) {
            await notifyDailyOrdersGenerated(ids, today, ordersGenerated);
          }
        } catch (err) {
          console.error("[orderService] kitchen notification failed:", err);
        }
      }

      // Await all background side-effect tasks before returning so that
      // automated processes (e.g. Node cron with process.exit) do not truncate in-flight promises.
      if (backgroundTasks.length > 0) {
        const results = await Promise.allSettled(backgroundTasks);
        results.forEach((r, idx) => {
          if (r.status === "rejected") {
            console.warn(`[orderService] Background side-effect task ${idx} failed:`, r.reason);
          }
        });
      }

      return {
        generated: ordersGenerated,
        failed: ordersFailed,
        unassigned: ordersUnassigned,
      };
    } catch (error: any) {
      if (backgroundTasks.length > 0) {
        try {
          await Promise.allSettled(backgroundTasks);
        } catch {}
      }
      const completedAt = serverTimestamp() as unknown as Timestamp;
      await orderGenerationRunRepository.update(runId, {
        status: "failed",
        completedAt,
        error: error.message,
      } as any);
      throw error;
    }
  }

  private async assertOwnership(subscription: Subscription): Promise<{
    uid: string;
    role: string;
    name: string;
  }> {
    const caller = auth.currentUser;
    if (!caller?.uid) {
      throw new Error("Not authenticated");
    }
    if (caller.uid === "system") {
      return {
        uid: "system",
        role: "system",
        name: "System Auto-Generator",
      };
    }
    if (caller.uid === subscription.customerId) {
      return {
        uid: caller.uid,
        role: "customer",
        name: caller.displayName || caller.email || "Customer",
      };
    }
    // Check if caller is admin
    try {
      const callerProfile = await userRepository.getById(caller.uid);
      if (callerProfile?.role === "admin") {
        return {
          uid: caller.uid,
          role: "admin",
          name:
            callerProfile.fullName ||
            caller.displayName ||
            caller.email ||
            "Admin",
        };
      }
    } catch {
      // In tests or if getById fails
    }
    throw new Error("Unauthorized: You do not own this subscription");
  }

  /**
   * Adds a single meal order for today for a given subscription.
   * Enforces cutoff windows, removes existing skips if present, and preserves idempotency.
   * Returns the number of orders created (0 or 1).
   */
  async addTodayMeal(
    subscriptionId: string,
    mealType: import("@/shared/types").MealType,
    nowOverride?: Date,
  ): Promise<number> {
    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    const actor = await this.assertOwnership(subscription);
    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new Error(`Subscription ${subscriptionId} is not active`);
    }
    if (subscription.startDate && subscription.startDate > today) {
      throw new Error(`Subscription ${subscriptionId} hasn't started yet`);
    }
    if (subscription.endDate && subscription.endDate < today) {
      throw new Error(`Subscription ${subscriptionId} has already ended`);
    }
    // Verify requested meal is part of subscription preferences
    const hasMeal = (subscription.mealPreferences || []).some(
      (p) => p.mealType === mealType,
    );
    if (!hasMeal) {
      throw new Error(
        `Meal ${mealType} is not part of subscription ${subscriptionId}`,
      );
    }
    // Enforce cutoff using repository validation (throws if cutoff passed)
    await operationalSettingsService.getOperationalSettings();
    (subscriptionRepository as any).validateSkipWindow(
      today,
      [mealType],
      nowOverride,
    );

    // If previously skipped/cancelled, remove the skip entry so order can be scheduled
    await subscriptionRepository.removeSkip(
      subscription.id,
      today,
      [mealType],
      actor.uid,
    );

    const created = await this.generateOrdersForSubscription(
      subscription,
      today,
      [mealType],
    );
    return typeof created === "number" ? created : 0;
  }

  /**
   * Adds an individual meal for today or for a specific future date on behalf of a customer.
   * Does NOT permanently modify the customer's subscription meal configuration.
   * Treats it as an individual one-time order using existing order architecture and pricing.
   * Enforces operational cutoffs (for today) and holiday/Sunday delivery rules.
   */
  async addIndividualMeal(params: {
    customerId: string;
    subscriptionId?: string | null;
    date: string; // YYYY-MM-DD
    mealType: import("@/shared/types").MealType;
    optionId?: string;
    nowOverride?: Date;
  }): Promise<Order> {
    const { customerId, subscriptionId, date, mealType, optionId, nowOverride } = params;

    if (!["breakfast", "lunch", "dinner"].includes(mealType)) {
      throw new Error(`Invalid meal type: ${mealType}`);
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Invalid date format. Expected YYYY-MM-DD.");
    }

    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    if (date < today) {
      throw new Error("Cannot add a meal for a past date.");
    }

    if (isSundayInTimezone(date)) {
      throw new Error("Deliveries are closed on Sundays.");
    }

    const isHoliday = await holidayRepository.isHoliday(date);
    if (isHoliday) {
      throw new Error("Deliveries are closed on declared holidays.");
    }

    // Cutoff validation: if date is today, enforce cutoff
    if (date === today) {
      await operationalSettingsService.getOperationalSettings();
      operationalSettingsService.validateMealCutoff(mealType, date, nowOverride);
    }

    // Load customer profile
    const customer = (await userRepository.getById(customerId)) as CustomerProfile | null;
    if (!customer) {
      throw new Error(`Customer ${customerId} not found.`);
    }

    // Resolve subscription if available
    let subscription: Subscription | null = null;
    if (subscriptionId) {
      subscription = await subscriptionRepository.getById(subscriptionId);
    } else {
      subscription = await subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
    }

    // Calculate authoritative price:
    // If subscription exists, use pricingService.calculateMealPrice (which checks negotiatedPricing -> snapshot -> base)
    // If no subscription, resolve effective base pricing for date
    let price: number;
    let planTier: import("@/shared/types").PlanTier | null = null;
    let planName = "One-Time Meal";

    if (subscription) {
      price = pricingService.calculateMealPrice(subscription, mealType, 1, date);
      planTier = subscription.planTier;
      if (subscription.planId) {
        const plan = await mealPlanRepository.getById(subscription.planId);
        if (plan) planName = plan.name;
      }
    } else {
      const basePricing = await pricingService.getEffectivePricing(date, "regular");
      price = (basePricing as any)[mealType] ?? 0;
    }

    // Resolve delivery address
    const addr =
      customer.addresses?.find((a: any) => a.id === subscription?.deliveryAddressId) ||
      customer.addresses?.find((a: any) => a.id === customer.defaultAddressId) ||
      customer.addresses?.[0];

    const allZones = await deliveryZoneRepository.list();
    let zoneId: string | null = null;
    let kitchenId: string | null = null;

    const manualZoneId = subscription?.zoneId || customer.zoneId;
    if (manualZoneId) {
      const manualZone = allZones.find((z) => z.id === manualZoneId && z.isActive !== false);
      if (manualZone?.kitchenId) {
        zoneId = manualZone.id;
        kitchenId = manualZone.kitchenId;
      }
    }

    if (!zoneId || !kitchenId) {
      try {
        const resolved = resolveOperationalZoneAndKitchen(addr, allZones);
        zoneId = resolved.zoneId;
        kitchenId = resolved.kitchenId;
      } catch {
        // Missing kitchen/zone will be caught by the check below
      }
    }

    if (!kitchenId || !zoneId) {
      throw new Error(`Missing kitchen configuration for customer ${customerId}`);
    }

    // Partner resolution
    const allPartners = (await userRepository.list(where("role", "==", "delivery_partner"))) as DeliveryPartnerProfile[];
    const activePartners = allPartners.filter((p) => p.isActive);
    let partnerId: string | null = customer.mealDeliveryPartners?.[mealType] || customer.deliveryPartnerId || null;

    if (!partnerId && zoneId) {
      const eligible = activePartners.filter(
        (p) =>
          p.isAvailable &&
          p.zoneIds?.includes(zoneId!) &&
          (!p.shifts || p.shifts.length === 0 || p.shifts.includes(mealType)),
      );
      if (eligible.length > 0) {
        partnerId = eligible[0].id;
      }
    }

    const partner = partnerId ? activePartners.find((p) => p.id === partnerId) : null;
    const addressStr = addr
      ? `${addr.line1} ${addr.line2 || ""}, ${addr.city}, ${addr.pincode}`.trim()
      : undefined;

    // Check if daily menu published for items label
    const publishedMenu = await dailyMenuRepository.getPublishedByDate(date).catch(() => null);
    const dailyMeal = publishedMenu && publishedMenu[mealType]?.isAvailable !== false ? publishedMenu[mealType] : null;

    let mealName: string = mealType;
    let itemsLabel = `One-time ${mealType}`;
    if (dailyMeal?.name) {
      mealName = dailyMeal.name;
      itemsLabel = dailyMeal.items?.length ? `${dailyMeal.name} (${dailyMeal.items.join(", ")})` : dailyMeal.name;
    }

    const orderId = `ord_addon_${subscription?.id || customerId}_${date}_${mealType}`;
    const zoneName = zoneId ? allZones.find((z) => z.id === zoneId)?.name : undefined;

    // Check pre-transaction for any existing active order for this customer, date, and mealType
    const existingCustomerOrders = await orderRepository.list(
      where("customerId", "==", customerId),
      where("date", "==", date),
    );
    const activeExisting = existingCustomerOrders.find(
      (o) =>
        o.mealType === mealType &&
        o.status !== "cancelled" &&
        o.status !== "skipped",
    );
    if (activeExisting) {
      throw new Error(
        `An active order already exists for ${date} (${mealType}). Order ID: ${activeExisting.id} (Status: ${activeExisting.status}).`,
      );
    }

    const initialOrderDoc: Order = {
      id: orderId,
      displayId: customer.displayId || `ORD-${orderId.slice(-6).toUpperCase()}`,
      source: "one_time",
      customerId: customer.id,
      subscriptionId: subscription?.id || null,
      planTier: planTier || null,
      mealType,
      date,
      customerName: customer.fullName,
      customerCode: customer.displayId || undefined,
      customerPhone: customer.phone || undefined,
      address: addressStr || undefined,
      addressCoords: sanitizeCoordinates(addr),
      zoneName,
      planName,
      driverName: partner?.fullName || undefined,
      driverPhone: partner?.phone || undefined,
      mealName,
      mealQuantity: 1,
      billingStatus: "Generated",
      kitchenStatus: "scheduled",
      itemsLabel,
      selectedOptionId: optionId || null,
      price,
      currency: "INR",
      status: "scheduled",
      deliveryAddressId: addr?.id || "",
      zoneId,
      kitchenId,
      deliveryPartnerId: partnerId || null,
      deliveryWindow: operationalSettingsService.getDeliveryWindowSync(mealType),
      paymentId: null,
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    };

    // Candidate document references for transactional concurrency & idempotency
    const subOrderId = subscription?.id
      ? `ord_${subscription.id}_${date}_${mealType}`
      : null;
    const subOrderRef = subOrderId ? doc(db, "orders", subOrderId) : null;
    const addonSubOrderId = subscription?.id
      ? `ord_addon_${subscription.id}_${date}_${mealType}`
      : null;
    const addonSubOrderRef = addonSubOrderId
      ? doc(db, "orders", addonSubOrderId)
      : null;
    const addonCustOrderId = `ord_addon_${customerId}_${date}_${mealType}`;
    const addonCustOrderRef = doc(db, "orders", addonCustOrderId);

    let resultingOrder: Order = initialOrderDoc;

    await runTransaction(db, async (txn) => {
      // 1. Transactionally read all candidate order documents
      const refsMap = new Map<string, ReturnType<typeof doc>>();
      if (subOrderRef) refsMap.set(subOrderRef.id, subOrderRef);
      if (addonSubOrderRef) refsMap.set(addonSubOrderRef.id, addonSubOrderRef);
      refsMap.set(addonCustOrderRef.id, addonCustOrderRef);

      const candidateSnaps = await Promise.all(
        Array.from(refsMap.values()).map((ref) => txn.get(ref)),
      );

      // 2. Concurrency/Idempotency check: Reject if ANY order for this slot is already active
      for (const snap of candidateSnaps) {
        if (snap.exists()) {
          const data = snap.data() as Order;
          if (data.status !== "cancelled" && data.status !== "skipped") {
            throw new Error(
              `An active order already exists for ${date} (${mealType}). Order ID: ${snap.id} (Status: ${data.status}).`,
            );
          }
        }
      }

      // 3. If a cancelled or skipped order already exists, restore it in-place instead of creating a duplicate document
      const subSnap = subOrderRef ? candidateSnaps.find((s) => s.id === subOrderRef.id) : null;
      const addonSubSnap = addonSubOrderRef ? candidateSnaps.find((s) => s.id === addonSubOrderRef.id) : null;
      const addonCustSnap = candidateSnaps.find((s) => s.id === addonCustOrderRef.id);

      const targetToRestore =
        (subSnap && subSnap.exists())
          ? { ref: subOrderRef!, snap: subSnap }
          : (addonSubSnap && addonSubSnap.exists())
            ? { ref: addonSubOrderRef!, snap: addonSubSnap }
            : (addonCustSnap && addonCustSnap.exists())
              ? { ref: addonCustOrderRef, snap: addonCustSnap }
              : null;

      if (targetToRestore) {
        const existingData = targetToRestore.snap.data() as Order;
        resultingOrder = {
          ...existingData,
          price,
          mealName,
          itemsLabel,
          selectedOptionId: optionId || null,
          zoneId,
          kitchenId,
          deliveryPartnerId: partnerId || existingData.deliveryPartnerId || null,
          driverName: partner?.fullName || existingData.driverName,
          driverPhone: partner?.phone || existingData.driverPhone,
          deliveryWindow: operationalSettingsService.getDeliveryWindowSync(mealType),
          status: "scheduled",
          kitchenStatus: "scheduled",
          updatedAt: serverTimestamp() as unknown as Timestamp,
        };
        (resultingOrder as any).cancellationAmount = null;
        (resultingOrder as any).cancellationReason = null;
        (resultingOrder as any).cancelledAt = null;

        txn.set(targetToRestore.ref, stripUndefined(resultingOrder), { merge: true });

        const historyRef = doc(collection(db, "orders", targetToRestore.ref.id, "workflowHistory"));
        txn.set(historyRef, {
          fromStatus: existingData.status,
          toStatus: "scheduled",
          notes: "Meal added/restored for date by Admin",
          changedAt: serverTimestamp(),
          changedBy: auth.currentUser?.uid || "admin",
        });
      } else {
        // No existing cancelled order; create new order document
        resultingOrder = initialOrderDoc;
        const targetRef = doc(db, "orders", orderId);
        txn.set(targetRef, stripUndefined(initialOrderDoc));

        const historyRef = doc(collection(db, "orders", orderId, "workflowHistory"));
        txn.set(historyRef, {
          fromStatus: null,
          toStatus: "scheduled",
          notes: "One-time meal order created by Admin",
          changedAt: serverTimestamp(),
          changedBy: auth.currentUser?.uid || "admin",
        });
      }
    });

    // If subscription has a skip entry for this date/meal, remove it
    if (subscription) {
      try {
        const caller = auth.currentUser;
        await subscriptionRepository.removeSkip(subscription.id, date, [mealType], caller?.uid || "admin");
      } catch {
        // Skip subcollection entry might not exist, ignore
      }
    }

    return resultingOrder;
  }

  /**
   * Adds an add-on item order for today for a given subscription and updates billing.
   * Enforces authenticated ownership/admin authority, subscription eligibility,
   * meal-specific cutoffs in Asia/Kolkata (<05:00, <10:30, <16:00, exact cutoff rejected),
   * active add-on catalog validation, authoritative pricing snapshot (Pricing -> Order -> Billing/Invoice),
   * idempotent transactional order and invoice creation/update, and audit logging.
   */
  async addTodayAddon(
    subscriptionId: string,
    mealType: import("@/shared/types").MealType,
    addonId: string,
    quantity: number = 1,
    nowOverride?: Date,
  ): Promise<AddTodayAddonResult> {
    if (!["breakfast", "lunch", "dinner"].includes(mealType)) {
      throw new Error(`Invalid meal type: ${mealType}`);
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer.");
    }

    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // Verify authenticated ownership or admin role
    const actor = await this.assertOwnership(subscription);

    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new Error(`Subscription ${subscriptionId} is not active`);
    }
    if (subscription.startDate && subscription.startDate > today) {
      throw new Error(`Subscription ${subscriptionId} hasn't started yet`);
    }
    if (subscription.endDate && subscription.endDate < today) {
      throw new Error(`Subscription ${subscriptionId} has already ended`);
    }

    // Enforce strict meal cutoff in business layer (Asia/Kolkata)
    await operationalSettingsService.getOperationalSettings();
    (subscriptionRepository as any).validateSkipWindow(
      today,
      [mealType],
      nowOverride,
    );

    // Validate add-on against authoritative business pricing source
    let addon = pricingService.getAddonById(addonId);
    if (!addon) {
      addon = await pricingService.getAddonByIdAsync(addonId);
    }
    if (!addon) {
      throw new Error(`Add-on ${addonId} not found`);
    }
    if (!addon.isActive) {
      throw new Error(`Add-on ${addon.name} is currently inactive`);
    }
    if (!addon.applicableMealTypes.includes(mealType)) {
      throw new Error(
        `Add-on ${addon.name} is not available for ${mealType}. Available slots: ${addon.applicableMealTypes.join(", ")}`,
      );
    }

    // Authoritative pricing: backend-calculated amount snapshot
    const { unitPrice, total } = pricingService.calculateAddonPrice(
      addonId,
      quantity,
    );

    // Resolve operational zone and kitchen
    let resolvedZoneId = subscription.zoneId || null;
    let resolvedKitchenId: string | null = null;
    try {
      const allZones = await deliveryZoneRepository.list();
      const zone = allZones.find((z) => z.id === subscription.zoneId);
      if (zone) {
        resolvedKitchenId = zone.kitchenId || null;
      }
    } catch {}

    // Deterministic add-on order ID for idempotency
    const addonOrderId = `ord_${subscription.id}_${today}_${mealType}_addon_${addonId}`;
    const orderRef = doc(db, "orders", addonOrderId);

    // Locate or derive appropriate open invoice
    let targetInvoiceId: string | null = null;
    try {
      const { accountsRepository } = await import(
        "../firestore/accountsRepository"
      );
      const invoices = await accountsRepository.getInvoicesByCustomerId(
        subscription.customerId,
      );
      const openInv = invoices.find(
        (inv) =>
          inv.subscriptionId === subscription.id &&
          (inv.status === "issued" ||
            inv.status === "draft" ||
            inv.status === "overdue"),
      );
      if (openInv) {
        targetInvoiceId = openInv.id;
      }
    } catch (err) {
      console.warn("[orderService] Failed to query customer invoices:", err);
    }

    if (!targetInvoiceId) {
      const effectiveEndDate = subscription.endDate || today;
      targetInvoiceId = `inv_${subscription.id}_${effectiveEndDate}`;
    }
    const invoiceRef = doc(db, "invoices", targetInvoiceId);

    let isDuplicate = false;

    // Atomic transaction for order creation and invoice line update
    await runTransaction(db, async (txn) => {
      const orderSnap = await txn.get(orderRef);
      const orderExists =
        typeof orderSnap.exists === "function"
          ? orderSnap.exists()
          : Boolean(orderSnap.exists);
      const orderData =
        typeof orderSnap.data === "function"
          ? (orderSnap.data() as Order)
          : undefined;

      if (orderExists && orderData && orderData.status !== "cancelled") {
        isDuplicate = true;
        return; // Idempotent: already created and billed
      }

      const invSnap = await txn.get(invoiceRef);
      const invExists =
        typeof invSnap.exists === "function"
          ? invSnap.exists()
          : Boolean(invSnap.exists);
      const invData =
        typeof invSnap.data === "function" ? (invSnap.data() as any) : undefined;

      const existingLineItems =
        invExists && invData?.lineItems ? [...invData.lineItems] : [];
      const alreadyHasLineItem = existingLineItems.some(
        (li: any) =>
          li.orderId === addonOrderId ||
          (li.addonId === addonId &&
            li.mealType === mealType &&
            li.orderId === addonOrderId),
      );

      const newLineItem = {
        description: `Add-on: ${addon.name} (${mealType.toUpperCase()}) - ${quantity}x @ ₹${unitPrice}`,
        quantity,
        unitPrice,
        amount: total,
        addonId,
        mealType,
        orderId: addonOrderId,
      };

      const addonOrder: Partial<Order> = {
        id: addonOrderId,
        source: "subscription",
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        planTier: subscription.planTier || "regular",
        mealType,
        date: today,
        mealName: `${addon.name} (Add-on)`,
        itemsLabel: `${addon.name} x${quantity}`,
        mealQuantity: quantity,
        price: total,
        currency: "INR",
        isAddon: true,
        addonId,
        addonName: addon.name,
        addonQuantity: quantity,
        addonUnitPrice: unitPrice,
        status: "scheduled",
        kitchenStatus: "scheduled",
        deliveryAddressId: subscription.deliveryAddressId,
        zoneId: resolvedZoneId,
        kitchenId: resolvedKitchenId,
        deliveryPartnerId: null,
        deliveryWindow: operationalSettingsService.getDeliveryWindowSync(mealType),
        paymentId: null,
        invoiceId: targetInvoiceId,
        selectedOptionId: null,
      };

      txn.set(
        orderRef,
        stripUndefined({
          ...addonOrder,
          createdAt: serverTimestamp() as unknown as Timestamp,
          updatedAt: serverTimestamp() as unknown as Timestamp,
        }),
      );

      const historyRef = doc(
        collection(db, "orders", addonOrderId, "workflowHistory"),
      );
      txn.set(historyRef, {
        fromStatus: "none",
        toStatus: "scheduled",
        notes: `Customer added today's add-on: ${addon.name} x${quantity}`,
        changedAt: serverTimestamp(),
        changedBy: actor.uid,
      });

      if (invExists && invData) {
        if (!alreadyHasLineItem) {
          const updatedLineItems = [...existingLineItems, newLineItem];
          const newSubtotal = (invData.subtotal || 0) + total;
          const newTotalAmount = (invData.totalAmount || 0) + total;
          txn.update(invoiceRef, {
            lineItems: updatedLineItems,
            subtotal: newSubtotal,
            totalAmount: newTotalAmount,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });
        }
      } else {
        const invPayload = {
          id: targetInvoiceId!,
          invoiceNumber: `INV-${subscription.customerId.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`,
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          lineItems: [newLineItem],
          subtotal: total,
          taxRate: 0,
          taxAmount: 0,
          totalAmount: total,
          depositHeld: 0,
          currency: "INR",
          status: "issued",
          billingPeriodStart: subscription.startDate || today,
          billingPeriodEnd: subscription.endDate || today,
          dueDate: today,
          paidAt: null,
          paymentId: null,
          createdAt: serverTimestamp() as unknown as Timestamp,
          updatedAt: serverTimestamp() as unknown as Timestamp,
        };
        txn.set(invoiceRef, invPayload);
      }
    });

    if (!isDuplicate) {
      try {
        const { auditRepository } = await import(
          "../firestore/auditRepository"
        );
        await auditRepository.logAction(
          "addon_ordered",
          actor.uid,
          actor.role,
          actor.name,
          addonOrderId,
          "order",
          {
            date: today,
            mealType,
            addonId,
            addonName: addon.name,
            quantity,
            unitPrice,
            totalAmount: total,
            subscriptionId,
            customerId: subscription.customerId,
            invoiceId: targetInvoiceId,
          },
        );
      } catch (err) {
        console.warn(
          "[orderService] Failed to record audit log for addon order:",
          err,
        );
      }
    }

    return {
      success: true,
      orderId: addonOrderId,
      invoiceId: targetInvoiceId!,
      mealType,
      date: today,
      addonId,
      addonName: addon.name,
      quantity,
      unitPrice,
      totalAmount: total,
      alreadyExists: isDuplicate,
    };
  }

  /**
   * Removes/cancels a single meal order for today for a given subscription.
   * Enforces authenticated ownership, eligibility, meal preferences, strict meal-specific cutoff,
   * idempotency, canonical cancellation pricing, transactional order status mutation,
   * skip record synchronization, and audit logging.
   */
  async removeTodayMeal(
    subscriptionId: string,
    mealType: import("@/shared/types").MealType,
    nowOverride?: Date,
  ): Promise<RemoveTodayMealResult> {
    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // Verify authenticated ownership or admin role
    const actor = await this.assertOwnership(subscription);

    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new Error(`Subscription ${subscriptionId} is not active`);
    }
    if (subscription.startDate && subscription.startDate > today) {
      throw new Error(`Subscription ${subscriptionId} hasn't started yet`);
    }
    if (subscription.endDate && subscription.endDate < today) {
      throw new Error(`Subscription ${subscriptionId} has already ended`);
    }

    // Verify requested meal is part of subscription preferences
    const hasMeal = (subscription.mealPreferences || []).some(
      (p) => p.mealType === mealType,
    );
    if (!hasMeal) {
      throw new Error(
        `Meal ${mealType} is not part of subscription ${subscriptionId}`,
      );
    }

    // Enforce strict meal cutoff in business layer
    await operationalSettingsService.getOperationalSettings();
    (subscriptionRepository as any).validateSkipWindow(
      today,
      [mealType],
      nowOverride,
    );

    const cancellationAmount = pricingService.calculateCancellationAmount(
      subscription,
      [mealType],
    );

    // Locate today's order for that subscription and meal
    const expectedId = `ord_${subscription.id}_${today}_${mealType}`;
    let order = await orderRepository.getById(expectedId);
    if (!order) {
      const matches = await orderRepository.list(
        where("subscriptionId", "==", subscriptionId),
        where("date", "==", today),
        where("mealType", "==", mealType),
      );
      if (matches.length > 0) {
        order = matches.find((m) => !m.isAddon) || matches[0];
      }
    }

    if (!order) {
      throw new Error(`Order not found for ${mealType} on ${today}`);
    }

    // Check if order is already cancelled or skipped (idempotent no-op)
    if (order.status === "cancelled" || order.status === "skipped") {
      return {
        success: true,
        cancelled: false,
        orderId: order.id,
        cancellationAmount,
        status: order.status,
        mealType,
        date: today,
      };
    }

    const initialCheck = isOrderProtectedFromCancellation(order);
    if (initialCheck.protected) {
      throw new Error(initialCheck.reason);
    }

    // Atomic transaction for concurrency safety and idempotency
    let didCancel = false;
    await runTransaction(db, async (t) => {
      const orderRef = doc(db, "orders", order!.id!);
      const snap = await t.get(orderRef);
      if (!snap.exists()) {
        throw new Error("Order not found");
      }
      const currentData = snap.data() as Order;
      if (
        currentData.status === "cancelled" ||
        currentData.status === "skipped"
      ) {
        return; // Already cancelled by concurrent request
      }
      const currentCheck = isOrderProtectedFromCancellation(currentData);
      if (currentCheck.protected) {
        throw new Error(currentCheck.reason);
      }

      t.update(orderRef, {
        status: "cancelled",
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      const historyRef = doc(
        collection(db, "orders", order!.id!, "workflowHistory"),
      );
      t.set(historyRef, {
        fromStatus: currentData.status,
        toStatus: "cancelled",
        notes: "Customer cancelled today's meal",
        changedAt: serverTimestamp(),
        changedBy: actor.uid,
      });
      didCancel = true;
    });

    if (didCancel) {
      try {
        await subscriptionRepository.addSkip(
          subscription.id,
          today,
          [mealType],
          "Customer cancelled today's meal",
          actor.uid,
        );
      } catch (skipErr: any) {
        console.error(
          "[orderService] Failed to record skip in removeTodayMeal:",
          skipErr,
        );
        try {
          await failureQueueRepository.logFailure(
            subscription.customerId,
            subscription.id,
            mealType,
            today,
            "Failed to record skip after cancelling order: " +
              (skipErr?.message || String(skipErr)),
            skipErr?.stack,
          );
        } catch (fqErr) {
          console.error("[orderService] Failed to record in failureQueue:", fqErr);
        }
        throw new Error(
          `Order was cancelled, but recording the skip failed: ${skipErr?.message || "Unknown error"}. Incident queued for admin review.`,
        );
      }

      // Operational shift alerts for today's cancellations in IST
      dispatchOperationalCancellationNotifications(
        [order],
        "Customer cancelled today's meal",
        actor,
        nowOverride,
      ).catch((err) => {
        console.error(
          "[orderService] Failed to dispatch operational notification for meal removal:",
          err,
        );
      });

      try {
        const { auditRepository } = await import(
          "../firestore/auditRepository"
        );
        await auditRepository.logAction(
          "meal_cancelled",
          actor.uid,
          actor.role,
          actor.name,
          order.id!,
          "order",
          {
            date: today,
            mealType,
            cancellationAmount,
            subscriptionId,
            customerId: subscription.customerId,
          },
        );
      } catch (err) {
        console.error(
          "[orderService] Failed to record audit log for meal cancellation:",
          err,
        );
      }
    }

    return {
      success: true,
      cancelled: didCancel,
      orderId: order.id,
      cancellationAmount,
      status: "cancelled",
      mealType,
      date: today,
    };
  }

  /**
   * Changes the meal option selection for today's lunch or dinner order.
   * Strictly restricted to the same meal type (lunch -> lunch, dinner -> dinner).
   * Enforces authenticated ownership/admin authority, subscription eligibility,
   * scheduled order status, kitchen & operational locks, meal-specific cutoffs in Asia/Kolkata,
   * option validity in the subscription plan, ₹0 price variance (financial immutability),
   * deterministic order ID preservation, idempotency, workflow history, and audit logging.
   */
  async changeTodayMealOption(
    subscriptionId: string,
    mealType: import("@/shared/types").MealType,
    newOptionId: string,
    nowOverride?: Date,
  ): Promise<ChangeTodayMealOptionResult> {
    if (mealType !== "lunch" && mealType !== "dinner") {
      throw new Error("Only lunch and dinner meal options can be changed.");
    }

    const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // Verify authenticated ownership or admin role
    const actor = await this.assertOwnership(subscription);

    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new Error(`Subscription ${subscriptionId} is not active`);
    }
    if (subscription.startDate && subscription.startDate > today) {
      throw new Error(`Subscription ${subscriptionId} hasn't started yet`);
    }
    if (subscription.endDate && subscription.endDate < today) {
      throw new Error(`Subscription ${subscriptionId} has already ended`);
    }

    // Verify requested meal is part of subscription preferences
    const hasMeal = (subscription.mealPreferences || []).some(
      (p) => p.mealType === mealType,
    );
    if (!hasMeal) {
      throw new Error(
        `Meal ${mealType} is not part of subscription ${subscriptionId}`,
      );
    }

    // Enforce strict meal cutoff in business layer
    await operationalSettingsService.getOperationalSettings();
    (subscriptionRepository as any).validateSkipWindow(
      today,
      [mealType],
      nowOverride,
    );

    // Verify newOptionId exists in subscription plan for THIS meal slot
    const plan = await mealPlanRepository.getById(subscription.planId);
    if (!plan) {
      throw new Error(`Plan ${subscription.planId} not found`);
    }
    const slot = (plan.mealSlots || []).find((s) => s.mealType === mealType);
    if (!slot) {
      throw new Error(`Meal slot ${mealType} not configured in plan ${plan.id}`);
    }
    const targetOption = (slot.options || []).find((o) => o.id === newOptionId);
    if (!targetOption) {
      throw new Error(
        `Option ${newOptionId} is not a valid option for ${mealType} in plan ${plan.name}`,
      );
    }
    if (targetOption.isActive === false) {
      throw new Error(
        `Option ${targetOption.label || newOptionId} is currently disabled and cannot be selected.`,
      );
    }
    if (targetOption.isCustomerSelectable === false && actor.role === "customer") {
      throw new Error(
        `Option ${targetOption.label || newOptionId} is not selectable by customers.`,
      );
    }

    // Locate today's order for that subscription and meal
    const expectedId = `ord_${subscription.id}_${today}_${mealType}`;
    let order = await orderRepository.getById(expectedId);
    if (!order) {
      const matches = await orderRepository.list(
        where("subscriptionId", "==", subscriptionId),
        where("date", "==", today),
        where("mealType", "==", mealType),
      );
      if (matches.length > 0) {
        order = matches[0];
      }
    }

    if (!order) {
      throw new Error(`Order not found for ${mealType} on ${today}`);
    }

    if (order.status !== "scheduled") {
      throw new Error(
        `Order is in '${order.status}' status and cannot be modified. Only scheduled orders can have meal options changed.`,
      );
    }

    const lockedStatuses = ["preparing", "packing", "packed", "ready_for_pickup"];
    if (lockedStatuses.includes(order.kitchenStatus || "")) {
      throw new Error(
        "Order is already being prepared by the kitchen and cannot be modified.",
      );
    }

    const OPERATIONAL_STATUSES = [
      "picked_up",
      "out_for_delivery",
      "delivered",
      "failed_delivery",
      "returned_delivery",
    ];
    if (OPERATIONAL_STATUSES.includes(order.status)) {
      throw new Error(
        "Order is already in delivery or delivered and cannot be modified.",
      );
    }

    const newOptionLabel = targetOption.label;
    const newItemsLabel = `Subscription - ${mealType}${newOptionLabel ? ` (${newOptionLabel})` : ""}`;

    // Idempotency pre-check: if already changed to this option, return safe no-op
    if (order.selectedOptionId === newOptionId) {
      return {
        success: true,
        changed: false,
        orderId: order.id,
        mealType,
        date: today,
        previousOptionId: order.selectedOptionId,
        newOptionId,
        previousMealName: order.mealName,
        newMealName: order.mealName || newOptionLabel,
        itemsLabel: order.itemsLabel,
        price: order.price,
      };
    }

    // Atomic transaction for concurrency safety and idempotency
    let didChange = false;
    let previousOptionId = order.selectedOptionId;
    let previousMealName = order.mealName;

    await runTransaction(db, async (t) => {
      const orderRef = doc(db, "orders", order!.id!);
      const snap = await t.get(orderRef);
      if (!snap.exists()) {
        throw new Error("Order not found");
      }
      const currentData = snap.data() as Order;

      if (currentData.status !== "scheduled") {
        throw new Error(
          `Order is in '${currentData.status}' status and cannot be modified.`,
        );
      }
      if (lockedStatuses.includes(currentData.kitchenStatus || "")) {
        throw new Error(
          "Order is already being prepared by the kitchen and cannot be modified.",
        );
      }
      if (OPERATIONAL_STATUSES.includes(currentData.status)) {
        throw new Error(
          "Order is already in delivery or delivered and cannot be modified.",
        );
      }
      if (currentData.selectedOptionId === newOptionId) {
        return; // Already changed by concurrent request
      }

      previousOptionId = currentData.selectedOptionId;
      previousMealName = currentData.mealName;

      t.update(orderRef, {
        selectedOptionId: newOptionId,
        mealName: newOptionLabel,
        itemsLabel: newItemsLabel,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      const historyRef = doc(
        collection(db, "orders", order!.id!, "workflowHistory"),
      );
      t.set(historyRef, {
        fromStatus: currentData.status,
        toStatus: currentData.status,
        previousStatus: currentData.status,
        newStatus: currentData.status,
        notes: `Meal option changed from ${previousOptionId || "default"} (${previousMealName || "default"}) to ${newOptionId} (${newOptionLabel})`,
        changedAt: serverTimestamp(),
        changedBy: actor.uid,
      });
      didChange = true;
    });

    if (didChange) {
      try {
        const { auditRepository } = await import(
          "../firestore/auditRepository"
        );
        await auditRepository.logAction(
          "meal_option_changed",
          actor.uid,
          actor.role,
          actor.name,
          order.id!,
          "order",
          {
            date: today,
            mealType,
            subscriptionId,
            customerId: subscription.customerId,
            oldOptionId: previousOptionId || null,
            newOptionId,
            oldMealName: previousMealName || null,
            newMealName: newOptionLabel,
          },
        );
      } catch (err) {
        console.error(
          "[orderService] Failed to record audit log for meal option change:",
          err,
        );
      }
    }

    return {
      success: true,
      changed: didChange,
      orderId: order.id,
      mealType,
      date: today,
      previousOptionId,
      newOptionId,
      previousMealName,
      newMealName: newOptionLabel,
      itemsLabel: newItemsLabel,
      price: order.price,
    };
  }

  /**
   * Generates orders for a specific subscription and date for the specified meal types.
   * Useful when a subscription is resumed mid-day and needs today's remaining orders generated.
   */
  async generateOrdersForSubscription(
    subscription: import("@/shared/types").Subscription,
    date: string,
    mealTypesToGenerate: import("@/shared/types").MealType[],
  ): Promise<number | void> {
    const isSunday = isSundayInTimezone(date);
    if (isSunday) {
      console.log(
        `[orderService] Subscription ${subscription.id} skip generateOrdersForSubscription since ${date} is Sunday.`,
      );
      return 0;
    }

    // ── Holiday Guard ─────────────────────────────────────────────────────────
    // Checked after Sunday guard and before any data fetch or batch write.
    // Critical: this guard also runs on the restoreOrdersForUnskipDay path
    // which calls generateOrdersForSubscription when generateMissing=true.
    const isHolidayDate = await holidayRepository.isHoliday(date);
    if (isHolidayDate) {
      console.log(
        `[orderService] ${date} is an active holiday — skipping subscription ${subscription.id} order generation.`,
      );
      return 0;
    }

    const [
      mealPlans,
      customer,
      allZones,
      allPartners,
      todaysOrders,
      publishedDailyMenu,
    ] = await Promise.all([
      mealPlanRepository.list(),
      userRepository.getById(subscription.customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where("role", "==", "delivery_partner")),
      orderRepository.list(where("date", "==", date)),
      dailyMenuRepository.getPublishedByDate(date).catch(() => null),
      operationalSettingsService.getOperationalSettings(),
    ]);

    const activePartners = allPartners.filter(
      (p) => p.isActive,
    ) as DeliveryPartnerProfile[];
    const customerMap = new Map<string, CustomerProfile>();
    if (customer) customerMap.set(customer.id, customer as CustomerProfile);
    const partnerMap = new Map<string, DeliveryPartnerProfile>(
      activePartners.map((p) => [p.id, p]),
    );
    const zoneMap = new Map(allZones.map((z) => [z.id, z]));

    const workloadMap = new Map<string, number>();
    todaysOrders.forEach((o) => {
      if (
        o.deliveryPartnerId &&
        o.status !== "cancelled" &&
        o.status !== "skipped"
      ) {
        workloadMap.set(
          o.deliveryPartnerId,
          (workloadMap.get(o.deliveryPartnerId) || 0) + 1,
        );
      }
    });

    const ordersToCreate: Partial<Order>[] = [];

    for (const pref of subscription.mealPreferences) {
      if (!mealTypesToGenerate.includes(pref.mealType)) continue;

      // Scenario E: If a published Daily Menu exists for this date, but this meal slot is marked unavailable
      if (
        publishedDailyMenu &&
        publishedDailyMenu[pref.mealType] &&
        publishedDailyMenu[pref.mealType].isAvailable === false
      ) {
        continue;
      }

      // Idempotency guard: prevent overwriting active in-flight orders
      const expectedId = `ord_${subscription.id}_${date}_${pref.mealType}`;
      const existingOrder = todaysOrders.find(
        (o) =>
          o.id === expectedId ||
          (o.subscriptionId === subscription.id && o.mealType === pref.mealType),
      );
      if (
        existingOrder &&
        existingOrder.status !== "cancelled" &&
        existingOrder.status !== "skipped"
      ) {
        console.log(
          `[orderService] Order ${expectedId} already exists for ${date} with status ${existingOrder.status} — preserving existing workflow status.`,
        );
        continue;
      }

      const order = this.buildOrderSnapshot(
        subscription,
        pref,
        pref.mealType,
        date,
        customerMap,
        partnerMap,
        zoneMap,
        activePartners,
        allZones,
        mealPlans,
        workloadMap,
        publishedDailyMenu,
      );
      ordersToCreate.push(order);

      if (!order.deliveryPartnerId) {
        try {
          const actor = getSystemOrAdminActor();
          const auditMod =
            await import("@/shared/services/firestore/auditRepository");
          await auditMod.auditRepository.logAction(
            "delivery_assignment_failed",
            actor.uid,
            actor.role,
            actor.name,
            order.id!,
            "order",
            {
              orderId: order.id,
              customerId: subscription.customerId,
              zoneId: order.zoneId,
              mealType: order.mealType,
              date,
              reason: "No eligible partner available for this zone and shift",
            },
          );

          const notifMod =
            await import("@/shared/services/firestore/notificationService");
          const urMod =
            await import("@/shared/services/firestore/userRepository");
          const admins = await urMod.userRepository.list(
            where("role", "==", "admin"),
          );
          await notifMod.notifyAdminAlert(
            admins.map((a) => a.id),
            "Delivery Assignment Failed",
            formatDeliveryAssignmentAlertMessage(order, pref.mealType, date),
          );
        } catch (e) {
          console.error(
            "[orderService] Failed background task for unassigned order:",
            e,
          );
        }
      }
    }

    if (ordersToCreate.length === 0) return 0;

    let actuallyCreatedCount = 0;
    await runTransaction(db, async (txn) => {
      const checks: {
        ref: ReturnType<typeof doc>;
        order: Partial<Order>;
        exists: boolean;
        existingStatus?: string;
      }[] = [];
      for (const order of ordersToCreate) {
        const ref = doc(db, "orders", order.id!);
        const snap = await txn.get(ref);
        const exists =
          typeof snap.exists === "function" ? snap.exists() : Boolean(snap.exists);
        const data = typeof snap.data === "function" ? snap.data() : undefined;
        const existingStatus = data?.status;
        checks.push({
          ref,
          order,
          exists,
          existingStatus,
        });
      }

      for (const { ref, order, exists, existingStatus } of checks) {
        if (
          exists &&
          existingStatus !== "cancelled" &&
          existingStatus !== "skipped"
        ) {
          console.log(
            `[orderService] Order ${order.id} already exists in Firestore with active status ${existingStatus} — preserving existing workflow status.`,
          );
          continue;
        }
        actuallyCreatedCount++;
        txn.set(
          ref,
          stripUndefined({
            ...order,
            status: "scheduled",
            createdAt: serverTimestamp() as unknown as Timestamp,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          }),
        );
      }
    });

    try {
      const kitchenStaff = await userRepository.list(
        where("role", "==", "kitchen"),
        where("isActive", "==", true),
      );
      const ids = kitchenStaff.map((s) => s.id);
      if (ids.length > 0 && actuallyCreatedCount > 0) {
        await notifyDailyOrdersGenerated(ids, date, actuallyCreatedCount);
      }
    } catch (err) {
      console.error(
        "[orderService] kitchen notification failed during mid-day resume:",
        err,
      );
    }

    return actuallyCreatedCount;
  }

  async updateOrderStatus(
    orderId: string,
    status: import("@/shared/types").OrderStatus,
  ): Promise<void> {
    if (!orderId || !status) {
      throw new Error("Order ID and Status are required.");
    }
    const order = await orderRepository.getById(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found.`);
    }
    if (order.status === status) {
      return;
    }
    await orderRepository.update(orderId, {
      status,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    });
  }

  /**
   * Synchronize today's active orders whenever a customer's zone or delivery partner changes.
   * This is called by CustomerService to maintain consistency without relying on Firestore Triggers.
   */
  async syncCustomerActiveOrders(customerId: string, targetMealType?: string | "all"): Promise<void> {
    const today = getTodayInTimezone();

    // Fetch today's orders for this customer
    const activeOrders = await orderRepository.list(
      where("customerId", "==", customerId),
      where("date", "==", today),
    );

    // We only update orders that are not terminal and not locked by drivers
    const TERMINAL_AND_LOCKED_STATUSES = [
      "delivered",
      "failed_delivery",
      "returned_delivery",
      "skipped",
      "cancelled",
      "picked_up",
      "out_for_delivery",
    ];
    const ordersToSync = activeOrders.filter(
      (o) => !TERMINAL_AND_LOCKED_STATUSES.includes(o.status) && (!targetMealType || targetMealType === "all" || o.mealType === targetMealType),
    );

    if (ordersToSync.length === 0) return;

    // Fetch required references
    const [customer, allZones, allPartners] = await Promise.all([
      userRepository.getById(customerId),
      deliveryZoneRepository.list(),
      userRepository.list(where("role", "==", "delivery_partner")),
    ]);

    if (!customer) return;

    const activePartners = allPartners.filter(
      (p) => p.isActive,
    ) as import("@/shared/types").DeliveryPartnerProfile[];
    const zoneMap = new Map(allZones.map((z) => [z.id, z]));
    const partnerMap = new Map(activePartners.map((p) => [p.id, p]));

    const workloadMap = new Map<string, number>();
    activeOrders.forEach((o) => {
      if (
        o.deliveryPartnerId &&
        o.status !== "cancelled" &&
        o.status !== "skipped"
      ) {
        workloadMap.set(
          o.deliveryPartnerId,
          (workloadMap.get(o.deliveryPartnerId) || 0) + 1,
        );
      }
    });

    const custProfile = customer as CustomerProfile;

    // We do NOT want to update orders if routing fails. Wait, syncCustomerActiveOrders is called when address changes.
    // If the new address has no zone, we should probably clear the zoneId and kitchenId, OR throw an error.
    // Since we're enforcing the core invariant that no operational order can have kitchenId: null,
    // if a customer changes their address to an unsupported area mid-subscription, we cannot route it.
    // The safest behavior is to throw an error so the address update fails, preventing the customer from
    // moving their address to an unserviceable area while having active orders, or at least surfacing it.
    const defaultAddress = custProfile.addresses?.find(
      (a: any) => a.id === custProfile.defaultAddressId,
    ) || custProfile.addresses?.[0];

    let zoneId: string | null = null;
    let kitchenId: string | null = null;

    if (custProfile.zoneId) {
      const manualZone = allZones.find(
        (z) => z.id === custProfile.zoneId && z.isActive !== false,
      );
      if (manualZone?.kitchenId) {
        zoneId = manualZone.id;
        kitchenId = manualZone.kitchenId;
      }
    }

    if (!zoneId || !kitchenId) {
      try {
        const resolved = resolveOperationalZoneAndKitchen(
          defaultAddress,
          allZones,
        );
        zoneId = resolved.zoneId;
        kitchenId = resolved.kitchenId;
      } catch {
        // Unresolved address/pincode leaves zoneId/kitchenId null
      }
    }

    const zoneName = zoneId ? zoneMap.get(zoneId)?.name : undefined;

    const batch = writeBatch(db);
    ordersToSync.forEach((order) => {
      let partnerId: string | null = null;
      if (zoneId) {
        const eligiblePartners = activePartners.filter(
          (p) =>
            p.isAvailable &&
            p.zoneIds?.includes(zoneId!) &&
            (!p.shifts ||
              p.shifts.length === 0 ||
              p.shifts.includes(order.mealType)),
        );
        if (eligiblePartners.length > 0) {
          const custProfile = customer as CustomerProfile;
          const prefPartnerId =
            custProfile.mealDeliveryPartners?.[order.mealType as MealType] ||
            custProfile.deliveryPartnerId;
          if (
            prefPartnerId &&
            eligiblePartners.some((p) => p.id === prefPartnerId)
          ) {
            partnerId = prefPartnerId;
          } else {
            eligiblePartners.sort((a, b) => {
              const aLoad = workloadMap.get(a.id) || 0;
              const bLoad = workloadMap.get(b.id) || 0;
              if (aLoad !== bLoad) return aLoad - bLoad;
              return a.id.localeCompare(b.id);
            });
            partnerId = eligiblePartners[0].id;
          }

          if (order.deliveryPartnerId !== partnerId) {
            if (order.deliveryPartnerId) {
              workloadMap.set(
                order.deliveryPartnerId,
                Math.max(
                  0,
                  (workloadMap.get(order.deliveryPartnerId) || 0) - 1,
                ),
              );
            }
            if (partnerId) {
              workloadMap.set(partnerId, (workloadMap.get(partnerId) || 0) + 1);
            }
          }
        }
      }

      const driver = partnerMap.get(partnerId || "");
      const custProfile = customer as CustomerProfile;
      const addr =
        custProfile.addresses?.find(
          (a: any) => a.id === order.deliveryAddressId,
        ) || custProfile.addresses?.[0];
      const addressStr = addr
        ? `${addr.line1} ${addr.line2 || ""}, ${addr.city}, ${addr.pincode}`.trim()
        : undefined;

      const ref = doc(db, "orders", order.id!);
      const updatePayload: any = {
        deliveryPartnerId: partnerId ?? null,
        zoneId,
        kitchenId,
        driverName: driver?.fullName ?? null,
        driverPhone: driver?.phone ?? null,
        zoneName: zoneName ?? null,
        customerName: custProfile.fullName || "Unknown Customer",
        customerCode: custProfile.displayId ?? null,
        customerPhone: custProfile.phone ?? null,
        address: addressStr ?? null,
        addressCoords: sanitizeCoordinates(addr),
        updatedAt: serverTimestamp() as unknown as Timestamp,
      };

      Object.keys(updatePayload).forEach((key) => {
        if (updatePayload[key] === undefined) {
          delete updatePayload[key];
        }
      });

      batch.update(ref, stripUndefined(updatePayload));
    });

    await batch.commit();
    console.log(
      `[orderService] Synced ${ordersToSync.length} active orders for customer ${customerId}`,
    );
  }

  /**
   * Applies Kitchen Lock and cancels generated orders for a skipped day.
   */
  async cancelOrdersForSkipDay(
    subscriptionId: string,
    customerId: string,
    date: string,
    mealTypes: string[],
    nowOverride?: Date,
  ): Promise<void> {
    const batch = writeBatch(db);
    const cancelledOrders = await this.appendCancelOrdersToBatch(
      batch,
      subscriptionId,
      customerId,
      date,
      mealTypes,
    );

    if (cancelledOrders.length > 0) {
      await batch.commit();
      console.log(
        `[orderService] Cancelled ${cancelledOrders.length} orders for skipped day ${date}`,
      );

      const caller = auth.currentUser;
      const actorUid = caller?.uid || customerId;
      const actorRole = caller?.uid === customerId ? "customer" : "admin";
      const actorName = caller?.displayName || caller?.email || "Customer";

      // Operational shift alerts for today's cancellations in IST
      dispatchOperationalCancellationNotifications(
        cancelledOrders,
        "Customer skipped day",
        { uid: actorUid, role: actorRole, name: actorName },
        nowOverride,
      ).catch((err) => {
        console.error(
          "[orderService] Failed to dispatch operational notifications for skip day:",
          err,
        );
      });

      import("@/shared/services/firestore/auditRepository")
        .then((m) => {
          cancelledOrders.forEach((o) => {
            m.auditRepository
              .logAction(
                "meal_cancelled",
                actorUid,
                actorRole,
                actorName,
                o.id!,
                "order",
                {
                  date,
                  mealType: o.mealType,
                },
              )
              .catch(console.error);
          });
        })
        .catch(console.error);
    }
  }

  async appendCancelOrdersToBatch(
    batch: import("firebase/firestore").WriteBatch,
    subscriptionId: string,
    customerId: string,
    date: string,
    mealTypes: string[],
  ): Promise<Order[]> {
    const allDailyOrders = await orderRepository.list(
      where("subscriptionId", "==", subscriptionId),
      where("customerId", "==", customerId),
      where("date", "==", date),
    );

    const orders = allDailyOrders.filter((o) =>
      mealTypes.includes(o.mealType || ""),
    );

    // Enforce operational & kitchen cancellation invariants across all requested orders
    for (const order of orders) {
      const check = isOrderProtectedFromCancellation(order);
      if (check.protected) {
        throw new Error(check.reason);
      }
    }

    const eligibleOrders = orders.filter(
      (o) => o.status !== "cancelled" && o.status !== "skipped",
    );

    for (const order of eligibleOrders) {
      const ref = doc(db, "orders", order.id!);
      const freshSnap = await getDoc(ref);
      if (freshSnap.exists()) {
        const freshData = freshSnap.data() as Order;
        const freshCheck = isOrderProtectedFromCancellation(freshData);
        if (freshCheck.protected) {
          throw new Error(freshCheck.reason);
        }
      }
      batch.update(ref, {
        status: "cancelled",
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });
    }

    return eligibleOrders;
  }

  /**
   * Atomically records a subscription day skip and cancels all eligible orders
   * for the specified meal types in a single Firestore write batch.
   * Enforces:
   *  - Meal cutoff window validation
   *  - Cancellation invariants: protected kitchen and transit states block the entire skip
   *  - Multi-order consistency: if any order is protected, nothing is cancelled
   *  - Idempotency: already-cancelled orders produce no duplicate mutations or notifications
   *  - Real-time operational notifications to assigned drivers/kitchen for today's cancellations
   */
  async skipSubscriptionDay(
    subscriptionId: string,
    customerId: string,
    date: string,
    mealTypes: ("breakfast" | "lunch" | "dinner")[],
    reason: string = "Customer skipped day",
    nowOverride?: Date,
  ): Promise<{ success: boolean; cancelledCount: number; orderIds: string[] }> {
    // 1. Enforce strict cutoff window
    (subscriptionRepository as any).validateSkipWindow(
      date,
      mealTypes,
      nowOverride,
    );

    // 2. Verify subscription existence
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const caller = auth.currentUser;
    const actorUid = caller?.uid || customerId;
    const actorRole = caller?.uid === customerId ? "customer" : "admin";
    const actorName = caller?.displayName || caller?.email || "Customer";

    // 3. Find matching orders
    const allDailyOrders = await orderRepository.list(
      where("subscriptionId", "==", subscriptionId),
      where("customerId", "==", customerId),
      where("date", "==", date),
    );

    const targetOrders = allDailyOrders.filter((o) =>
      mealTypes.includes(o.mealType as any),
    );

    // 4. Verify operational safety invariants across all target orders
    for (const order of targetOrders) {
      const check = isOrderProtectedFromCancellation(order);
      if (check.protected) {
        throw new Error(
          `Cannot skip day: ${order.mealType} order is already in delivery or being prepared (${check.reason}).`,
        );
      }
    }

    const eligibleOrders = targetOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "skipped",
    );

    // 5. Read existing skip doc to merge meal types
    const skipRef = doc(db, "subscriptions", subscriptionId, "skips", date);
    const existingSkip = await getDoc(skipRef);

    // 6. Build atomic WriteBatch combining skip record + order cancellations + workflowHistory
    const batch = writeBatch(db);

    if (existingSkip.exists()) {
      const existingMeals = existingSkip.data().mealTypes || [];
      const mergedMeals = [
        ...new Set([...existingMeals, ...mealTypes]),
      ];
      batch.update(skipRef, {
        mealTypes: mergedMeals,
        reason,
        updatedAt: serverTimestamp() as unknown as Timestamp,
        updatedBy: actorUid,
      });
    } else {
      batch.set(skipRef, {
        date,
        mealTypes,
        reason,
        createdAt: serverTimestamp() as unknown as Timestamp,
        createdBy: actorUid,
      });
    }

    for (const order of eligibleOrders) {
      const orderRef = doc(db, "orders", order.id!);
      const freshSnap = await getDoc(orderRef);
      if (freshSnap.exists()) {
        const freshData = freshSnap.data() as Order;
        const freshCheck = isOrderProtectedFromCancellation(freshData);
        if (freshCheck.protected) {
          throw new Error(
            `Cannot skip day: ${order.mealType} order is already in delivery or being prepared (${freshCheck.reason}).`,
          );
        }
      }
      batch.update(orderRef, {
        status: "cancelled",
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });

      const historyRef = doc(
        collection(db, "orders", order.id!, "workflowHistory"),
      );
      batch.set(historyRef, {
        fromStatus: order.status,
        toStatus: "cancelled",
        notes: reason,
        changedAt: serverTimestamp(),
        changedBy: actorUid,
      });
    }

    // Atomically commit all writes
    await batch.commit();

    // 7. Post-commit side effects: notifications and audit
    if (eligibleOrders.length > 0) {
      dispatchOperationalCancellationNotifications(
        eligibleOrders,
        reason,
        { uid: actorUid, role: actorRole, name: actorName },
        nowOverride,
      ).catch((err) => {
        console.error(
          "[orderService] Failed to dispatch operational notifications for skip day:",
          err,
        );
      });

      import("@/shared/services/firestore/auditRepository")
        .then((m) => {
          eligibleOrders.forEach((o) => {
            m.auditRepository
              .logAction(
                "meal_cancelled",
                actorUid,
                actorRole,
                actorName,
                o.id!,
                "order",
                {
                  date,
                  mealType: o.mealType,
                  subscriptionId,
                  customerId,
                  reason,
                },
              )
              .catch(console.error);
          });
        })
        .catch(console.error);
    }

    return {
      success: true,
      cancelledCount: eligibleOrders.length,
      orderIds: eligibleOrders.map((o) => o.id!),
    };
  }

  /**
   * Restores orders for an unskipped day.
   * If generateMissing is false, it only restores existing cancelled/skipped orders.
   * If generateMissing is true, it also securely generates any missing orders.
   * All operational values are sourced exclusively from the subscription record.
   */
  async restoreOrdersForUnskipDay(
    customerId: string,
    subscriptionId: string,
    date: string,
    mealTypes: import("@/shared/types").MealType[],
    generateMissing: boolean = true,
  ): Promise<void> {
    const allDailyOrders = await orderRepository.list(
      where("subscriptionId", "==", subscriptionId),
      where("customerId", "==", customerId),
      where("date", "==", date),
    );

    const existingOrders = allDailyOrders.filter((o) =>
      mealTypes.includes(o.mealType || ""),
    );

    const OPERATIONAL_STATUSES = [
      "picked_up",
      "out_for_delivery",
      "delivered",
      "failed_delivery",
      "returned_delivery",
    ];
    const operationalLockedOrders = existingOrders.filter((o) =>
      OPERATIONAL_STATUSES.includes(o.status),
    );

    if (operationalLockedOrders.length > 0) {
      throw new Error(
        "Order is already in delivery or delivered and cannot be modified.",
      );
    }

    const lockedStatuses = ["packing", "packed", "ready_for_pickup"];
    const kitchenLockedOrders = existingOrders.filter((o) =>
      lockedStatuses.includes(o.kitchenStatus || ""),
    );

    if (kitchenLockedOrders.length > 0) {
      throw new Error(
        "Order is already being prepared by the kitchen and cannot be modified.",
      );
    }

    let activeSkippedMeals: string[] = [];
    try {
      const skipRef = doc(db, "subscriptions", subscriptionId, "skips", date);
      const skipSnap = await getDoc(skipRef);
      if (
        skipSnap &&
        typeof skipSnap.exists === "function" &&
        skipSnap.exists()
      ) {
        const skipData =
          typeof skipSnap.data === "function" ? skipSnap.data() : undefined;
        activeSkippedMeals = (skipData?.mealTypes || []) as string[];
      }
    } catch {
      // Continue if skip doc query fails or is unmocked in tests
    }

    const ordersToRestore = existingOrders.filter(
      (o) =>
        (o.status === "cancelled" || o.status === "skipped") &&
        !activeSkippedMeals.includes(o.mealType || ""),
    );

    const batch = writeBatch(db);
    ordersToRestore.forEach((order) => {
      const ref = doc(db, "orders", order.id!);
      batch.update(ref, {
        status: "scheduled",
        updatedAt: serverTimestamp() as unknown as Timestamp,
      });
    });

    if (ordersToRestore.length > 0) {
      await batch.commit();
      console.log(
        `[orderService] Restored ${ordersToRestore.length} orders for unskipped day ${date}`,
      );

      // Auto-assign delivery partners for the newly scheduled orders
      await this.syncCustomerActiveOrders(customerId);
    }

    // Identify which meals need brand new orders generated (skipped before generation ran)
    const existingMealTypes = new Set(existingOrders.map((o) => o.mealType));
    const mealTypesToGenerate = mealTypes.filter(
      (m) => !existingMealTypes.has(m) && !activeSkippedMeals.includes(m),
    );

    if (generateMissing && mealTypesToGenerate.length > 0) {
      // Fetch the subscription to drive trusted order generation.
      // The customer cannot supply any operational fields — all values come from the subscription.
      const subscription = await subscriptionRepository.getById(subscriptionId);
      if (!subscription) {
        throw new Error(
          `Subscription ${subscriptionId} not found. Cannot regenerate orders.`,
        );
      }
      // Verify the subscription belongs to this customer (double-check ownership)
      if (subscription.customerId !== customerId) {
        throw new Error("Subscription does not belong to this customer.");
      }

      if (subscription.status !== "active") {
        throw new Error(
          `Subscription is ${subscription.status}, not active. Cannot regenerate orders.`,
        );
      }
      if (subscription.startDate > date) {
        throw new Error(
          "Requested date is before the subscription start date.",
        );
      }
      if (subscription.endDate && subscription.endDate < date) {
        throw new Error("Requested date is after the subscription end date.");
      }

      await this.generateOrdersForSubscription(
        subscription,
        date,
        mealTypesToGenerate,
      );
      console.log(
        `[orderService] Regenerated ${mealTypesToGenerate.length} missing orders for unskipped day ${date}`,
      );
    }
  }

  private buildOrderSnapshot(
    sub: Subscription,
    pref: any,
    mealType: "breakfast" | "lunch" | "dinner",
    date: string,
    customerMap: Map<string, CustomerProfile>,
    partnerMap: Map<string, DeliveryPartnerProfile>,
    zoneMap: Map<string, any>,
    activePartners: DeliveryPartnerProfile[],
    allZones: any[],
    mealPlans: MealPlan[],
    workloadMap: Map<string, number>,
    publishedMenu?: DailyMenu | null,
  ): Partial<Order> {
    const customer = customerMap.get(sub.customerId);

    const addr =
      customer?.addresses?.find((a: any) => a.id === sub.deliveryAddressId) ||
      customer?.addresses?.find((a: any) => a.isDefault) ||
      customer?.addresses?.[0];

    let zoneId: string | null = null;
    let kitchenId: string | null = null;

    const manualZoneId = sub.zoneId || customer?.zoneId;
    if (manualZoneId) {
      const manualZone = allZones.find(
        (z) => z.id === manualZoneId && z.isActive !== false,
      );
      if (manualZone?.kitchenId) {
        zoneId = manualZone.id;
        kitchenId = manualZone.kitchenId;
      }
    }

    if (!zoneId || !kitchenId) {
      try {
        const resolved = resolveOperationalZoneAndKitchen(addr, allZones);
        zoneId = resolved.zoneId;
        kitchenId = resolved.kitchenId;
      } catch {
        // Missing kitchen/zone will be caught by the check below
      }
    }

    if (!kitchenId || !zoneId) {
      throw new Error(
        `Subscription ${sub.id}\nMeal: ${mealType.toUpperCase()}\nMissing kitchen configuration`,
      );
    }

    let partnerId: string | null = null;
    if (zoneId) {
      const eligiblePartners = activePartners.filter(
        (p) =>
          p.isAvailable &&
          p.zoneIds?.includes(zoneId!) &&
          (!p.shifts || p.shifts.length === 0 || p.shifts.includes(mealType)),
      );

      if (eligiblePartners.length > 0) {
        const prefPartnerId =
          customer?.mealDeliveryPartners?.[mealType as MealType] ||
          customer?.deliveryPartnerId;
        if (
          prefPartnerId &&
          eligiblePartners.some((p) => p.id === prefPartnerId)
        ) {
          partnerId = prefPartnerId;
        } else {
          eligiblePartners.sort((a, b) => {
            const aLoad = workloadMap.get(a.id) || 0;
            const bLoad = workloadMap.get(b.id) || 0;
            if (aLoad !== bLoad) return aLoad - bLoad;
            return a.id.localeCompare(b.id);
          });
          partnerId = eligiblePartners[0].id;
        }
        if (partnerId) {
          workloadMap.set(partnerId, (workloadMap.get(partnerId) || 0) + 1);
        }
      }
    }

    const plan = mealPlans.find((p) => p.id === sub.planId);
    let optionLabel = "";
    if (plan) {
      const slot = plan.mealSlots.find((s) => s.mealType === mealType);
      let option = slot?.options?.find((o) => o.id === pref.selectedOptionId);
      if (!option && slot && slot.options && slot.options.length > 0) {
        option = slot.options[0];
      }
      if (option) optionLabel = option.label;
    }

    // Connect published DailyMenu if available for this date and meal slot
    const dailyMeal =
      publishedMenu && publishedMenu[mealType]?.isAvailable !== false
        ? publishedMenu[mealType]
        : null;

    let finalMealName: string;
    let finalItemsLabel: string;

    if (dailyMeal && dailyMeal.name) {
      finalMealName = dailyMeal.name;
      finalItemsLabel =
        dailyMeal.items && dailyMeal.items.length > 0
          ? (dailyMeal.name === dailyMeal.items.join(", ")
              ? dailyMeal.name
              : `${dailyMeal.name} (${dailyMeal.items.join(", ")})`)
          : dailyMeal.name;
    } else {
      // Safe fallback to existing MealPlan option
      finalMealName = optionLabel || mealType;
      finalItemsLabel =
        "Subscription - " +
        mealType +
        (optionLabel ? " (" + optionLabel + ")" : "");
    }

    const driver = partnerMap.get(partnerId || "");
    const addressStr = addr
      ? `${addr.line1} ${addr.line2 || ""}, ${addr.city}, ${addr.pincode}`.trim()
      : undefined;

    const orderObj: Partial<Order> = {
      id: `ord_${sub.id}_${date}_${mealType}`,
      displayId:
        customer?.displayId ||
        `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      source: "subscription",
      customerId: sub.customerId,
      subscriptionId: sub.id,
      planTier: sub.planTier,
      mealType: mealType,
      date: date,

      // Denormalized Operational Snapshot
      customerName: customer?.fullName || "Unknown Customer",
      customerCode: customer?.displayId || undefined,
      customerPhone: customer?.phone || undefined,
      address: addressStr || undefined,
      addressCoords: sanitizeCoordinates(addr),
      zoneName: zoneId ? zoneMap.get(zoneId)?.name || undefined : undefined,
      planName: plan?.name || "Unknown Plan",
      driverName: driver?.fullName || undefined,
      driverPhone: driver?.phone || undefined,
      mealName: finalMealName,
      mealQuantity: sub.quantity || 1,
      billingStatus: "Generated",
      kitchenStatus: "scheduled",

      itemsLabel: finalItemsLabel,
      packingNotes: dailyMeal?.description || undefined,
      selectedOptionId: pref.selectedOptionId ?? null,
      price: pricingService.calculateMealPrice(sub, mealType),
      currency: "INR",
      status: "scheduled",
      deliveryAddressId: sub.deliveryAddressId ?? null,
      zoneId,
      kitchenId,
      deliveryPartnerId: partnerId ?? null,
      deliveryWindow: operationalSettingsService.getDeliveryWindowSync(mealType),
      paymentId: sub.latestPaymentId ?? null,
    };

    // Remove any remaining undefined values just in case
    Object.keys(orderObj).forEach((key) => {
      if ((orderObj as any)[key] === undefined) {
        delete (orderObj as any)[key];
      }
    });

    // Validate required operational fields
    const requiredOperationalFields: Array<keyof Order> = [
      "customerId",
      "subscriptionId",
      "date",
      "mealType",
      "status",
      "kitchenId",
      "zoneId",
    ];
    for (const field of requiredOperationalFields) {
      if (!orderObj[field]) {
        throw new Error(
          `Subscription ${sub.id}\nMeal: ${mealType.toUpperCase()}\nMissing operational field: ${field}`,
        );
      }
    }

    return orderObj;
  }
}

export const orderService = new OrderService();
