import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import { orderService, getTodayInTimezone } from "../orders";
import { subscriptionRepository } from "../repositories";
import type { Subscription } from "../types";

const getDb = () => {
  if (getApps().length === 0) {
    initializeApp({
      projectId:
        process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test",
    });
  }
  return getFirestore();
};

export interface ScheduledPausesResult {
  pausedCount: number;
  resumedCount: number;
  clearedCount: number;
}

export interface ProcessUnskipsResult {
  processedCount: number;
  failedCount: number;
}

export interface CheckExpiryResult {
  expiredCount: number;
  remindersCount: number;
}

export function getDateInTimezone(date: Date = new Date(), timezone: string = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export class BackendAutomationService {
  /**
   * Process Scheduled Pauses and Resumes
   * Runs at midnight before order generation to ensure pausing subscriptions
   * do not receive orders for today, and resumed subscriptions do.
   */
  async processScheduledPauses(dateOverride?: string): Promise<ScheduledPausesResult> {
    const today = dateOverride || getTodayInTimezone();
    logger.info(`[automationService] Processing scheduled pauses/resumes for date: ${today}`);

    const [activeSubs, pausedSubs] = await Promise.all([
      subscriptionRepository.list({ field: "status", op: "==", val: "active" }),
      subscriptionRepository.list({ field: "status", op: "==", val: "paused" }),
    ]);
    const subsToCheck: Subscription[] = [...activeSubs, ...pausedSubs];

    let pausedCount = 0;
    let resumedCount = 0;
    let clearedCount = 0;

    for (const sub of subsToCheck) {
      if (
        sub.status === "active" &&
        sub.pauseStartDate &&
        sub.pauseStartDate <= today
      ) {
        if (sub.pauseEndDate && sub.pauseEndDate < today) {
          await subscriptionRepository.update(sub.id!, {
            pauseStartDate: null,
            pauseEndDate: null,
          });
          clearedCount++;
          logger.info(`[automationService] Cleared outdated pause schedule for subscription ${sub.id}`);
        } else {
          await subscriptionRepository.update(sub.id!, { status: "paused" });
          pausedCount++;
          logger.info(`[automationService] Auto-paused subscription ${sub.id}`);
        }
      } else if (
        sub.status === "paused" &&
        sub.pauseEndDate &&
        sub.pauseEndDate < today
      ) {
        await subscriptionRepository.update(sub.id!, {
          status: "active",
          pauseStartDate: null,
          pauseEndDate: null,
        });
        resumedCount++;
        logger.info(`[automationService] Auto-resumed subscription ${sub.id}`);
      }
    }

    return { pausedCount, resumedCount, clearedCount };
  }

  /**
   * Process Pending Unskip Requests
   * Regenerates/restores orders for customers who unskipped before cutoff.
   */
  async processUnskipRequests(): Promise<ProcessUnskipsResult> {
    logger.info("[automationService] Processing pending unskip requests...");

    const snapshot = await getDb()
      .collection("unskipRequests")
      .where("status", "==", "pending")
      .get();

    let processedCount = 0;
    let failedCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      try {
        await orderService.restoreOrdersForUnskipDay(
          data.customerId,
          data.subscriptionId,
          data.date,
          data.mealTypes,
          true,
        );
        await docSnap.ref.update({
          status: "processed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        processedCount++;
        logger.info(`[automationService] Successfully processed unskip request ${docSnap.id}`);
      } catch (err) {
        logger.error(`[automationService] Failed to process unskip request ${docSnap.id}:`, err);
        failedCount++;
      }
    }

    return { processedCount, failedCount };
  }

  /**
   * Subscription Expiry & Renewal Reminders
   * Expires past subscriptions via transaction and writes idempotent in-app notifications.
   */
  async checkSubscriptionExpiry(dateOverride?: string): Promise<CheckExpiryResult> {
    const today = dateOverride || getTodayInTimezone();
    const todayDate = new Date(`${today}T00:00:00.000Z`);

    const tomorrow = getDateInTimezone(new Date(todayDate.getTime() + 1 * 86400000), "Asia/Kolkata");
    const in3Days = getDateInTimezone(new Date(todayDate.getTime() + 3 * 86400000), "Asia/Kolkata");
    const in7Days = getDateInTimezone(new Date(todayDate.getTime() + 7 * 86400000), "Asia/Kolkata");

    const snap = await getDb()
      .collection("subscriptions")
      .where("status", "==", "active")
      .get();

    let expiredCount = 0;
    let remindersCount = 0;

    for (const docSnap of snap.docs) {
      const sub = { id: docSnap.id, ...docSnap.data() } as Subscription;
      if (!sub.endDate) continue;

      let reminderType: "expired" | "tomorrow" | "3_days" | "7_days" | null = null;
      if (sub.endDate < today) reminderType = "expired";
      else if (sub.endDate === tomorrow) reminderType = "tomorrow";
      else if (sub.endDate === in3Days) reminderType = "3_days";
      else if (sub.endDate === in7Days) reminderType = "7_days";

      if (reminderType === "expired") {
        const wasUpdated = await getDb().runTransaction(async (txn) => {
          const ref = getDb().collection("subscriptions").doc(sub.id!);
          const currentSnap = await txn.get(ref);
          if (currentSnap.exists && currentSnap.data()?.status === "active") {
            txn.update(ref, {
              status: "expired",
              updatedAt: FieldValue.serverTimestamp(),
            });
            return true;
          }
          return false;
        });

        if (wasUpdated) {
          expiredCount++;
          const notifId = `sub_expired_${sub.id}_${today}`;
          await getDb().collection("notifications").doc(notifId).set(
            {
              recipientId: sub.customerId,
              recipientRole: "customer",
              channel: "in_app",
              type: "subscription_renewal_reminder",
              title: "Subscription expired",
              message: "Your meal plan subscription has expired. Please renew to continue receiving meals.",
              priority: "high",
              relatedEntityType: "subscription",
              relatedEntityId: sub.id,
              metadata: { endDate: sub.endDate },
              inAppStatus: "unread",
              status: "unread",
              createdBy: "system",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              expiresAt: null,
            },
            { merge: true },
          );
        }
      } else if (reminderType) {
        remindersCount++;
        const daysMap: Record<string, number> = {
          tomorrow: 1,
          "3_days": 3,
          "7_days": 7,
        };
        const daysLeft = daysMap[reminderType] ?? 1;
        const urgency = daysLeft <= 1 ? "high" : daysLeft <= 3 ? "normal" : "low";
        const notifId = `sub_renewal_${sub.id}_${reminderType}_${today}`;

        await getDb().collection("notifications").doc(notifId).set(
          {
            recipientId: sub.customerId,
            recipientRole: "customer",
            channel: "in_app",
            type: "subscription_renewal_reminder",
            title: `Subscription expiring ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}`,
            message: `Your meal plan subscription ends on ${sub.endDate}. Renew now to continue receiving meals without interruption.`,
            priority: urgency,
            relatedEntityType: "subscription",
            relatedEntityId: sub.id,
            metadata: { daysLeft, endDate: sub.endDate },
            inAppStatus: "unread",
            status: "unread",
            createdBy: "system",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: null,
          },
          { merge: true },
        );
      }
    }

    return { expiredCount, remindersCount };
  }

  /**
   * Generate Daily Sales and Operational Summary
   * Calculates metrics for today and stores them at `analytics/summary_${today}`.
   */
  async generateDailySummary(dateOverride?: string) {
    const today = dateOverride || getTodayInTimezone();
    logger.info(`[automationService] Generating daily summary for ${today}...`);

    // 1. Fetch today's orders
    const ordersSnap = await getDb()
      .collection("orders")
      .where("date", "==", today)
      .get();
    const todayOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 2. Fetch active and paused subscriptions
    const subsSnap = await getDb()
      .collection("subscriptions")
      .where("status", "in", ["active", "paused"])
      .get();
    const allSubs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Subscription[];

    // 3. Fetch today's payments (since midnight UTC of today)
    const startOfDay = new Date(`${today}T00:00:00.000Z`);
    let todayPayments: any[] = [];
    try {
      const paymentsSnap = await getDb()
        .collection("payments")
        .where("createdAt", ">=", Timestamp.fromDate(startOfDay))
        .get();
      todayPayments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      // Fallback in case payments collection does not exist or index is missing
      todayPayments = [];
    }

    let totalRevenue = 0;
    let cashPayments = 0;
    let onlinePayments = 0;
    let pendingPayments = 0;
    let refundedPayments = 0;
    let verifiedRevenue = 0;
    let pendingRevenue = 0;
    let rejectedRevenue = 0;
    const methodDistribution: Record<string, number> = {};

    todayPayments.forEach((p: any) => {
      const amt = Number(p.amount) || 0;
      if (p.status === "verified") {
        totalRevenue += amt;
        verifiedRevenue += amt;
        if (p.paymentMethod === "cash") cashPayments += amt;
        else onlinePayments += amt;
        const method = p.paymentMethod || "other";
        methodDistribution[method] = (methodDistribution[method] || 0) + amt;
      } else if (p.status === "pending") {
        pendingPayments += amt;
        pendingRevenue += amt;
      } else if (p.status === "rejected") {
        rejectedRevenue += amt;
      } else if (p.status === "refunded") {
        refundedPayments += amt;
      }
    });

    const planDistribution: Record<string, number> = {};
    let activeSubscriptions = 0;
    allSubs.forEach((s) => {
      if (s.status === "active") activeSubscriptions++;
      if (s.status === "active" || s.status === "paused") {
        const tier = s.planTier || "regular";
        planDistribution[tier] = (planDistribution[tier] || 0) + 1;
      }
    });

    let breakfastCount = 0;
    let lunchCount = 0;
    let dinnerCount = 0;
    let completedOrders = 0;
    let pendingOrders = 0;
    let kitchenPreparedToday = 0;
    let kitchenPendingToday = 0;
    const deliveryByArea: Record<string, number> = {};
    const partnerCount: Record<string, number> = {};
    const peakHourCount: Record<string, number> = {};

    for (const o of todayOrders as any[]) {
      if (o.status !== "cancelled" && o.status !== "skipped") {
        if (o.mealType === "breakfast") breakfastCount++;
        if (o.mealType === "lunch") lunchCount++;
        if (o.mealType === "dinner") dinnerCount++;

        if (o.status === "delivered") {
          completedOrders++;
          if (o.zoneId) {
            deliveryByArea[o.zoneId] = (deliveryByArea[o.zoneId] || 0) + 1;
          }
          if (o.deliveryPartnerId) {
            partnerCount[o.deliveryPartnerId] = (partnerCount[o.deliveryPartnerId] || 0) + 1;
          }
        } else if (
          [
            "scheduled",
            "preparing",
            "packing",
            "packed",
            "ready_for_pickup",
            "out_for_delivery",
          ].includes(o.status)
        ) {
          pendingOrders++;
        }

        if (
          ["ready_for_pickup", "out_for_delivery", "delivered"].includes(o.status)
        ) {
          kitchenPreparedToday++;
        } else if (
          ["scheduled", "preparing", "packing", "packed"].includes(o.status)
        ) {
          kitchenPendingToday++;
        }

        if (o.createdAt) {
          const hr =
            typeof o.createdAt.toDate === "function"
              ? o.createdAt.toDate().getHours()
              : o.createdAt.seconds
              ? new Date(o.createdAt.seconds * 1000).getHours()
              : new Date(o.createdAt).getHours();
          if (!isNaN(hr)) {
            peakHourCount[hr.toString()] = (peakHourCount[hr.toString()] || 0) + 1;
          }
        }
      }
    }

    const summaryId = `summary_${today}`;
    const summary = {
      id: summaryId,
      date: today,
      totalRevenue,
      cashPayments,
      onlinePayments,
      pendingPayments,
      refundedPayments,
      activeCustomers: new Set(allSubs.map((s) => s.customerId)).size,
      newCustomers: 0,
      activeSubscriptions,
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalDeliveries: todayOrders.length,
      completedDeliveries: todayOrders.filter((o: any) => o.status === "delivered").length,
      failedDeliveries: todayOrders.filter((o: any) => o.status === "failed_delivery").length,
      planDistribution,
      deliveryByArea,
      methodDistribution,
      partnerCount,
      peakHourCount,
      verifiedRevenue,
      pendingRevenue,
      rejectedRevenue,
      completedOrders,
      pendingOrders,
      kitchenPreparedToday,
      kitchenPendingToday,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await getDb().collection("analytics").doc(summaryId).set(summary, { merge: true });
    logger.info(`[automationService] Generated daily summary for ${today}.`);

    return summary;
  }
}

export const backendAutomationService = new BackendAutomationService();
