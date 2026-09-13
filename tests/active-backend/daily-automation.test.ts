process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-test";

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestApp, getFirestore } from "../../functions/src/test-init";

initTestApp();
const db = getFirestore();

import {
  backendAutomationService,
  getDateInTimezone,
} from "../../functions/src/services/automationService";
import { runDailyAutomation } from "../../functions/src/scheduled/dailyAutomation";
import { orderService } from "../../functions/src/orders";
import { billingService } from "../../functions/src/billing";

describe("trusted backend daily automation", () => {
  const testPrefix = `test_${Date.now()}`;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("A. Pipeline Orchestration & Stage Sequence", () => {
    it("executes all 6 stages in exact order and returns structured metrics", async () => {
      const callOrder: string[] = [];

      vi.spyOn(backendAutomationService, "processScheduledPauses").mockImplementation(async () => {
        callOrder.push("pauses");
        return { pausedCount: 1, resumedCount: 1, clearedCount: 0 };
      });

      vi.spyOn(backendAutomationService, "processUnskipRequests").mockImplementation(async () => {
        callOrder.push("unskips");
        return { processedCount: 2, failedCount: 0 };
      });

      vi.spyOn(orderService, "generateDailyOrders").mockImplementation(async () => {
        callOrder.push("orders");
        return { success: true, message: "Generated 10 orders", ordersGenerated: 10 };
      });

      vi.spyOn(billingService, "processDailyBilling").mockImplementation(async () => {
        callOrder.push("billing");
        return { processed: 2, errors: 0 };
      });

      vi.spyOn(backendAutomationService, "checkSubscriptionExpiry").mockImplementation(async () => {
        callOrder.push("expiry");
        return { expiredCount: 1, remindersCount: 3 };
      });

      vi.spyOn(backendAutomationService, "generateDailySummary").mockImplementation(async () => {
        callOrder.push("summary");
        return { id: "summary_2026-08-01", totalRevenue: 1500, totalDeliveries: 10 } as any;
      });

      const result = await runDailyAutomation("2026-08-01");

      expect(callOrder).toEqual([
        "pauses",
        "unskips",
        "orders",
        "billing",
        "expiry",
        "summary",
      ]);

      expect(result.date).toBe("2026-08-01");
      expect(result.stages.pauses.pausedCount).toBe(1);
      expect(result.stages.unskips.processedCount).toBe(2);
      expect(result.stages.orders.ordersGenerated).toBe(10);
      expect(result.stages.billing.processed).toBe(2);
      expect(result.stages.expiry.expiredCount).toBe(1);
      expect(result.stages.summary.id).toBe("summary_2026-08-01");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fails fast and propagates error if order generation fails", async () => {
      vi.spyOn(backendAutomationService, "processScheduledPauses").mockResolvedValue({
        pausedCount: 0,
        resumedCount: 0,
        clearedCount: 0,
      });
      vi.spyOn(backendAutomationService, "processUnskipRequests").mockResolvedValue({
        processedCount: 0,
        failedCount: 0,
      });

      vi.spyOn(orderService, "generateDailyOrders").mockResolvedValue({
        success: false,
        message: "Database batch commit failed.",
        ordersGenerated: 0,
      });

      await expect(runDailyAutomation("2026-08-01")).rejects.toThrow(
        "Daily order generation failed: Database batch commit failed.",
      );
    });
  });

  describe("B. Emulator Integration: Component Operations", () => {
    it("processScheduledPauses: pauses active subs on pauseStartDate, clears stale schedules, and resumes paused subs on pauseEndDate", async () => {
      const today = "2026-08-01";
      const sub1Id = `${testPrefix}_sub_pause`;
      const sub2Id = `${testPrefix}_sub_stale`;
      const sub3Id = `${testPrefix}_sub_resume`;

      await db.collection("subscriptions").doc(sub1Id).set({
        customerId: "cust_1",
        status: "active",
        pauseStartDate: "2026-08-01",
        pauseEndDate: "2026-08-05",
      });
      await db.collection("subscriptions").doc(sub2Id).set({
        customerId: "cust_2",
        status: "active",
        pauseStartDate: "2026-07-20",
        pauseEndDate: "2026-07-28",
      });
      await db.collection("subscriptions").doc(sub3Id).set({
        customerId: "cust_3",
        status: "paused",
        pauseEndDate: "2026-07-31",
      });

      const res = await backendAutomationService.processScheduledPauses(today);
      expect(res.pausedCount).toBeGreaterThanOrEqual(1);
      expect(res.clearedCount).toBeGreaterThanOrEqual(1);
      expect(res.resumedCount).toBeGreaterThanOrEqual(1);

      const [snap1, snap2, snap3] = await Promise.all([
        db.collection("subscriptions").doc(sub1Id).get(),
        db.collection("subscriptions").doc(sub2Id).get(),
        db.collection("subscriptions").doc(sub3Id).get(),
      ]);

      expect(snap1.data()?.status).toBe("paused");
      expect(snap2.data()?.status).toBe("active");
      expect(snap2.data()?.pauseStartDate).toBeNull();
      expect(snap3.data()?.status).toBe("active");
      expect(snap3.data()?.pauseEndDate).toBeNull();
    });

    it("processUnskipRequests: processes pending requests and marks status processed", async () => {
      const unskipId = `${testPrefix}_unskip_1`;
      await db.collection("unskipRequests").doc(unskipId).set({
        customerId: "cust_unskip",
        subscriptionId: "sub_unskip",
        date: "2026-08-01",
        mealTypes: ["breakfast", "lunch"],
        status: "pending",
      });

      const restoreSpy = vi
        .spyOn(orderService, "restoreOrdersForUnskipDay")
        .mockResolvedValue(undefined);

      const res = await backendAutomationService.processUnskipRequests();
      expect(res.processedCount).toBeGreaterThanOrEqual(1);
      expect(restoreSpy).toHaveBeenCalledWith(
        "cust_unskip",
        "sub_unskip",
        "2026-08-01",
        ["breakfast", "lunch"],
        true,
      );

      const snap = await db.collection("unskipRequests").doc(unskipId).get();
      expect(snap.data()?.status).toBe("processed");
    });

    it("checkSubscriptionExpiry: expires past subscriptions transactionally and creates notifications", async () => {
      const today = "2026-08-01";
      const expSubId = `${testPrefix}_sub_exp`;
      const remTomorrowId = `${testPrefix}_sub_rem_tomorrow`;
      const rem3DaysId = `${testPrefix}_sub_rem_3days`;
      const rem7DaysId = `${testPrefix}_sub_rem_7days`;

      await db.collection("subscriptions").doc(expSubId).set({
        customerId: "cust_exp",
        status: "active",
        endDate: "2026-07-31",
      });
      await db.collection("subscriptions").doc(remTomorrowId).set({
        customerId: "cust_tomorrow",
        status: "active",
        endDate: "2026-08-02",
      });
      await db.collection("subscriptions").doc(rem3DaysId).set({
        customerId: "cust_3days",
        status: "active",
        endDate: "2026-08-04",
      });
      await db.collection("subscriptions").doc(rem7DaysId).set({
        customerId: "cust_7days",
        status: "active",
        endDate: "2026-08-08",
      });

      const res = await backendAutomationService.checkSubscriptionExpiry(today);
      expect(res.expiredCount).toBeGreaterThanOrEqual(1);
      expect(res.remindersCount).toBeGreaterThanOrEqual(3);

      const subSnap = await db.collection("subscriptions").doc(expSubId).get();
      expect(subSnap.data()?.status).toBe("expired");

      // Verify deterministic notifications
      const notifExp = await db.collection("notifications").doc(`sub_expired_${expSubId}_${today}`).get();
      expect(notifExp.exists).toBe(true);
      expect(notifExp.data()?.title).toBe("Subscription expired");
      expect(notifExp.data()?.recipientId).toBe("cust_exp");

      const notifTomorrow = await db.collection("notifications").doc(`sub_renewal_${remTomorrowId}_tomorrow_${today}`).get();
      expect(notifTomorrow.exists).toBe(true);
      expect(notifTomorrow.data()?.priority).toBe("high");

      const notif3Days = await db.collection("notifications").doc(`sub_renewal_${rem3DaysId}_3_days_${today}`).get();
      expect(notif3Days.exists).toBe(true);
      expect(notif3Days.data()?.priority).toBe("normal");

      const notif7Days = await db.collection("notifications").doc(`sub_renewal_${rem7DaysId}_7_days_${today}`).get();
      expect(notif7Days.exists).toBe(true);
      expect(notif7Days.data()?.priority).toBe("low");
    });

    it("generateDailySummary: writes accurate operational metrics to analytics/summary_${today}", async () => {
      const summaryDate = "2026-08-15";
      const orderId1 = `${testPrefix}_ord_1`;
      const orderId2 = `${testPrefix}_ord_2`;
      const payId = `${testPrefix}_pay_1`;

      await db.collection("orders").doc(orderId1).set({
        date: summaryDate,
        mealType: "breakfast",
        status: "delivered",
        zoneId: "zone_east",
        deliveryPartnerId: "driver_test",
        createdAt: new Date(),
      });
      await db.collection("orders").doc(orderId2).set({
        date: summaryDate,
        mealType: "lunch",
        status: "ready_for_pickup",
        zoneId: "zone_east",
        createdAt: new Date(),
      });
      await db.collection("payments").doc(payId).set({
        amount: 300,
        status: "verified",
        paymentMethod: "online",
        createdAt: new Date(),
      });

      const summary = await backendAutomationService.generateDailySummary(summaryDate);
      expect(summary.id).toBe(`summary_${summaryDate}`);
      expect(summary.date).toBe(summaryDate);
      expect(summary.totalDeliveries).toBeGreaterThanOrEqual(2);
      expect(summary.completedDeliveries).toBeGreaterThanOrEqual(1);

      const savedSnap = await db.collection("analytics").doc(`summary_${summaryDate}`).get();
      expect(savedSnap.exists).toBe(true);
      expect(savedSnap.data()?.date).toBe(summaryDate);
    });
  });

  describe("C. Idempotency & Duplicate Run Safety", () => {
    it("repeated executions on the same date merge safely without duplicate entities", async () => {
      const idempotencyDate = "2026-08-20";
      const subId = `${testPrefix}_idem_sub`;

      await db.collection("subscriptions").doc(subId).set({
        customerId: "cust_idem",
        status: "active",
        endDate: "2026-08-19",
      });

      // Spies for order and billing to simulate real idempotency behavior
      const orderSpy = vi.spyOn(orderService, "generateDailyOrders")
        .mockResolvedValueOnce({
          success: true,
          message: "Generated 10 orders",
          ordersGenerated: 10,
        })
        .mockResolvedValueOnce({
          success: true,
          message: "0 new orders generated. (Orders may have already been generated for today)",
          ordersGenerated: 0,
        });

      const billingSpy = vi.spyOn(billingService, "processDailyBilling")
        .mockResolvedValueOnce({ processed: 1, errors: 0 })
        .mockResolvedValueOnce({ processed: 0, errors: 0 });

      // First run
      const run1 = await runDailyAutomation(idempotencyDate);
      expect(run1.stages.orders.ordersGenerated).toBe(10);
      expect(run1.stages.expiry.expiredCount).toBeGreaterThanOrEqual(1);

      // Second run on identical state
      const run2 = await runDailyAutomation(idempotencyDate);
      expect(run2.stages.orders.ordersGenerated).toBe(0);
      // Subscription was already set to expired, so 0 newly expired
      expect(run2.stages.expiry.expiredCount).toBe(0);

      // Verify deterministic notification doc exists only once
      const notifSnap = await db.collection("notifications").doc(`sub_expired_${subId}_${idempotencyDate}`).get();
      expect(notifSnap.exists).toBe(true);

      // Verify summary doc exists only once
      const summarySnap = await db.collection("analytics").doc(`summary_${idempotencyDate}`).get();
      expect(summarySnap.exists).toBe(true);
    });
  });

  describe("D. Boundary Handling", () => {
    it("getDateInTimezone formats correct YYYY-MM-DD across month and year transitions", () => {
      const eom = new Date("2026-07-31T20:00:00.000Z"); // 01:30 IST on August 1
      expect(getDateInTimezone(eom, "Asia/Kolkata")).toBe("2026-08-01");

      const eoy = new Date("2026-12-31T20:00:00.000Z"); // 01:30 IST on January 1, 2027
      expect(getDateInTimezone(eoy, "Asia/Kolkata")).toBe("2027-01-01");

      const leap = new Date("2028-02-28T20:00:00.000Z"); // 01:30 IST on February 29, 2028
      expect(getDateInTimezone(leap, "Asia/Kolkata")).toBe("2028-02-29");
    });
  });
});
