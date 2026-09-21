import { doc, getDoc, where } from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { orderRepository } from "../firestore/orderRepository";
import { subscriptionRepository } from "../firestore/subscriptionRepository";
import { deliveryZoneRepository } from "../firestore/deliveryZoneRepository";
import { holidayRepository } from "../firestore/holidayRepository";
import { failureQueueRepository } from "../firestore/failureQueueRepository";
import { userRepository } from "../firestore/userRepository";
import { orderService } from "./orderService";
import { getTodayInTimezone } from "@/shared/lib/date";
import type { CustomerProfile, MealType } from "@/shared/types";

export interface OrderDiagnosticResult {
  date: string;
  totalActiveSubscriptions: number;
  scheduledCount: number;
  existingOrdersCount: number;
  pausedCustomers: Array<{
    subscriptionId: string;
    customerId: string;
    customerName: string;
    pauseStartDate?: string | null;
    pauseEndDate?: string | null;
  }>;
  skippedCustomers: Array<{
    subscriptionId: string;
    customerId: string;
    customerName: string;
    mealTypes: string[];
    reason?: string;
  }>;
  cancelledOrders: Array<{
    orderId: string;
    customerId: string;
    customerName: string;
    mealType: string;
  }>;
  futureSubscribers: Array<{
    subscriptionId: string;
    customerId: string;
    customerName: string;
    startDate: string;
  }>;
  autoHealedCount: number;
  faultDetails: Array<{
    subscriptionId: string;
    customerId: string;
    customerName: string;
    reason: string;
  }>;
  status:
    | "healthy"
    | "sunday_holiday"
    | "official_holiday"
    | "no_active_subscriptions"
    | "all_paused_or_skipped"
    | "future_only"
    | "auto_healed"
    | "fault_detected";
  summaryText: string;
}

export class OrderDiagnosticService {
  /**
   * Evaluates order health for a specific date.
   * If valid subscriptions are missing orders, it automatically self-heals by generating them.
   * Accurately tracks per-customer pauses, skips, and cancellations.
   */
  async diagnoseAndRemediate(targetDate?: string): Promise<OrderDiagnosticResult> {
    const date = targetDate || getTodayInTimezone();

    // 1. Sunday Check
    const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    if (isSunday) {
      return {
        date,
        totalActiveSubscriptions: 0,
        scheduledCount: 0,
        existingOrdersCount: 0,
        pausedCustomers: [],
        skippedCustomers: [],
        cancelledOrders: [],
        futureSubscribers: [],
        autoHealedCount: 0,
        faultDetails: [],
        status: "sunday_holiday",
        summaryText: "Sunday is a weekly holiday. Meal delivery operations are closed.",
      };
    }

    // 2. Official Holiday Check
    const isHoliday = await holidayRepository.isHoliday(date);
    if (isHoliday) {
      return {
        date,
        totalActiveSubscriptions: 0,
        scheduledCount: 0,
        existingOrdersCount: 0,
        pausedCustomers: [],
        skippedCustomers: [],
        cancelledOrders: [],
        futureSubscribers: [],
        autoHealedCount: 0,
        faultDetails: [],
        status: "official_holiday",
        summaryText: "Scheduled holiday. No meal deliveries are scheduled for today.",
      };
    }

    // 3. Fetch Existing Orders
    const existingOrders = await orderRepository.list(where("date", "==", date));
    const cancelledOrdersList = existingOrders
      .filter((o) => o.status === "cancelled")
      .map((o) => ({
        orderId: o.id!,
        customerId: o.customerId,
        customerName: o.customerName || "Customer",
        mealType: o.mealType || "meal",
      }));
    const scheduledOrders = existingOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "skipped",
    );

    // 4. Fetch Subscriptions
    const [activeSubs, pausedSubs] = await Promise.all([
      subscriptionRepository.list(where("status", "==", "active")),
      subscriptionRepository.list(where("status", "==", "paused")),
    ]);

    const allRelevantSubs = [...activeSubs, ...pausedSubs];

    if (allRelevantSubs.length === 0) {
      const pendingSubs = await subscriptionRepository.list(
        where("status", "in", ["pending_payment", "draft"]),
      );
      return {
        date,
        totalActiveSubscriptions: 0,
        scheduledCount: scheduledOrders.length,
        existingOrdersCount: existingOrders.length,
        pausedCustomers: [],
        skippedCustomers: [],
        cancelledOrders: cancelledOrdersList,
        futureSubscribers: [],
        autoHealedCount: 0,
        faultDetails: [],
        status: "no_active_subscriptions",
        summaryText:
          pendingSubs.length > 0
            ? `No active subscriptions. ${pendingSubs.length} subscription(s) are pending payment or approval.`
            : "No active or paused subscriptions found in the system.",
      };
    }

    // 5. Fetch Customer Profiles for Subscriber Names
    const customerIds = Array.from(
      new Set(allRelevantSubs.map((s) => s.customerId).filter(Boolean)),
    );
    let customerMap = new Map<string, CustomerProfile>();
    try {
      const customers = await userRepository.getByIds(customerIds);
      customerMap = new Map(customers.map((c) => [c.id, c as CustomerProfile]));
    } catch {
      // Fallback: continue even if bulk customer fetch had partial errors
    }

    // 6. Categorize each subscription for date D
    const pausedCustomers: OrderDiagnosticResult["pausedCustomers"] = [];
    const skippedCustomers: OrderDiagnosticResult["skippedCustomers"] = [];
    const futureSubscribers: OrderDiagnosticResult["futureSubscribers"] = [];
    const faultDetails: OrderDiagnosticResult["faultDetails"] = [];

    interface MissingGenerationPlan {
      subscription: (typeof allRelevantSubs)[0];
      missingMeals: MealType[];
    }
    const missingPlans: MissingGenerationPlan[] = [];

    for (const sub of allRelevantSubs) {
      const customer = customerMap.get(sub.customerId);
      const customerName = customer?.fullName || "Customer";

      // A. Explicit Pause Status or Pause Window
      const isPausedStatus = sub.status === "paused";
      const isWithinPauseWindow = Boolean(
        sub.pauseStartDate &&
          sub.pauseEndDate &&
          sub.pauseStartDate <= date &&
          sub.pauseEndDate >= date,
      );

      if (isPausedStatus || isWithinPauseWindow) {
        pausedCustomers.push({
          subscriptionId: sub.id,
          customerId: sub.customerId,
          customerName,
          pauseStartDate: sub.pauseStartDate || null,
          pauseEndDate: sub.pauseEndDate || null,
        });
        continue;
      }

      // B. Expired Subscription
      if (sub.endDate && sub.endDate < date) {
        continue;
      }

      // C. Future Start Date
      if (sub.startDate > date) {
        futureSubscribers.push({
          subscriptionId: sub.id,
          customerId: sub.customerId,
          customerName,
          startDate: sub.startDate,
        });
        continue;
      }

      // D. Check Skips subcollection for date D
      let skippedMealsForSub: string[] = [];
      let skipReason = "";
      try {
        const skipRef = doc(db, "subscriptions", sub.id, "skips", date);
        const skipDoc = await getDoc(skipRef);
        if (skipDoc.exists()) {
          const skipData = skipDoc.data();
          skippedMealsForSub = skipData.mealTypes || [];
          skipReason = skipData.reason || "Customer skip";
        }
      } catch {
        // Continue if skip read fails
      }

      if (skippedMealsForSub.length > 0) {
        skippedCustomers.push({
          subscriptionId: sub.id,
          customerId: sub.customerId,
          customerName,
          mealTypes: skippedMealsForSub,
          reason: skipReason,
        });
      }

      // E. Check which subscribed meal types are missing an order
      const subscribedMeals = (sub.mealPreferences || []).map((p) => p.mealType);
      const missingMeals: MealType[] = [];

      for (const mealType of subscribedMeals) {
        if (skippedMealsForSub.includes(mealType)) {
          // Meal was explicitly skipped by customer, do not generate active order
          continue;
        }

        const orderAlreadyExists = existingOrders.some(
          (o) =>
            (o.id === `ord_${sub.id}_${date}_${mealType}` ||
              (o.subscriptionId === sub.id && o.mealType === mealType)),
        );

        if (!orderAlreadyExists) {
          missingMeals.push(mealType as MealType);
        }
      }

      if (missingMeals.length > 0) {
        missingPlans.push({
          subscription: sub,
          missingMeals,
        });
      }
    }

    // 7. Auto-Remediation: Generate Missing Orders
    let autoHealedCount = 0;
    if (missingPlans.length > 0) {
      const allZones = await deliveryZoneRepository.list();

      if (!allZones || allZones.length === 0) {
        for (const plan of missingPlans) {
          const customer = customerMap.get(plan.subscription.customerId);
          const customerName = customer?.fullName || "Customer";
          faultDetails.push({
            subscriptionId: plan.subscription.id,
            customerId: plan.subscription.customerId,
            customerName,
            reason:
              "Configuration Fault: No delivery zones configured in the system. Orders cannot be routed to kitchens.",
          });
        }
      } else {
        for (const plan of missingPlans) {
          const customer = customerMap.get(plan.subscription.customerId);
          const customerName = customer?.fullName || "Customer";
          try {
            await orderService.generateOrdersForSubscription(
              plan.subscription,
              date,
              plan.missingMeals,
            );
            autoHealedCount += plan.missingMeals.length;
          } catch (err: any) {
            const reason = String(err?.message || err);
            faultDetails.push({
              subscriptionId: plan.subscription.id,
              customerId: plan.subscription.customerId,
              customerName,
              reason,
            });

            failureQueueRepository
              .logFailure(
                plan.subscription.customerId,
                plan.subscription.id,
                plan.missingMeals.join(","),
                date,
                reason,
                String(err?.stack || ""),
              )
              .catch(console.error);
          }
        }
      }
    }

    // 8. Re-evaluate post-healing order count
    const finalScheduledCount = scheduledOrders.length + autoHealedCount;

    // 9. Determine Status & Summary
    let status: OrderDiagnosticResult["status"] = "healthy";
    let summaryText = "";

    if (faultDetails.length > 0) {
      status = "fault_detected";
      summaryText = `${faultDetails.length} subscriber(s) failed routing: ${faultDetails[0].reason}`;
    } else if (autoHealedCount > 0) {
      status = "auto_healed";
      summaryText = `Auto-healed: Generated ${autoHealedCount} missing order(s) for ${date}.`;
    } else if (finalScheduledCount > 0) {
      status = "healthy";
      summaryText = `${finalScheduledCount} active order(s) scheduled for ${date}.`;
    } else if (
      allRelevantSubs.length > 0 &&
      futureSubscribers.length === allRelevantSubs.length
    ) {
      status = "future_only";
      const earliest = futureSubscribers.map((f) => f.startDate).sort()[0];
      summaryText = `${futureSubscribers.length} active subscription(s) have future start dates (earliest starts on ${earliest}).`;
    } else if (
      pausedCustomers.length > 0 ||
      skippedCustomers.length > 0 ||
      cancelledOrdersList.length > 0
    ) {
      status = "all_paused_or_skipped";
      const parts = [];
      if (pausedCustomers.length > 0) parts.push(`${pausedCustomers.length} paused`);
      if (skippedCustomers.length > 0) parts.push(`${skippedCustomers.length} skipped`);
      if (cancelledOrdersList.length > 0) parts.push(`${cancelledOrdersList.length} cancelled`);
      summaryText = `All orders inactive for ${date}: ${parts.join(", ")}.`;
    } else {
      status = "healthy";
      summaryText = `0 orders scheduled for ${date}.`;
    }

    return {
      date,
      totalActiveSubscriptions: activeSubs.length,
      scheduledCount: finalScheduledCount,
      existingOrdersCount: existingOrders.length + autoHealedCount,
      pausedCustomers,
      skippedCustomers,
      cancelledOrders: cancelledOrdersList,
      futureSubscribers,
      autoHealedCount,
      faultDetails,
      status,
      summaryText,
    };
  }
}

export const orderDiagnosticService = new OrderDiagnosticService();
