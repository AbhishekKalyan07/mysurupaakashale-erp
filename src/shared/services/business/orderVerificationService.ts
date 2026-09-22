import { doc, getDoc, where } from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { orderRepository } from "../firestore/orderRepository";
import { subscriptionRepository } from "../firestore/subscriptionRepository";
import { holidayRepository } from "../firestore/holidayRepository";
import {
  getTodayInTimezone,
  getDayOfWeekInTimezone,
  isSundayInTimezone,
} from "@/shared/lib/date";
import type { MealType, Subscription } from "@/shared/types";

export interface MissingOrderInfo {
  subscriptionId: string;
  customerId: string;
  mealType: MealType;
}

export interface DuplicateOrderInfo {
  subscriptionId: string;
  mealType: MealType;
  count: number;
}

export interface OrderVerificationResult {
  businessDate: string;
  timezone: string;
  subscriptions: {
    total: number;
    active: number;
    paused: number;
    cancelled: number;
    eligible: number;
  };
  calendar: {
    day: string;
    isHoliday: boolean;
    reason: string;
  };
  orders: {
    expectedBreakfast: number;
    expectedLunch: number;
    expectedDinner: number;
    expectedTotal: number;

    actualBreakfast: number;
    actualLunch: number;
    actualDinner: number;
    actualTotal: number;

    missing: MissingOrderInfo[];
    duplicates: DuplicateOrderInfo[];
  };
  verification: "PASS" | "FAIL";
  finalResult: "SUCCESS" | "FAILED";
  isExpectedZero: boolean;
  failureReasons: string[];
}

export class OrderVerificationService {
  /**
   * Independently queries Firestore to verify that all expected orders for the
   * given business date actually exist, with no missing orders and no duplicates.
   */
  async verifyDailyOrders(dateOverride?: string): Promise<OrderVerificationResult> {
    const businessDate = dateOverride || getTodayInTimezone();
    const timezone = "Asia/Kolkata";
    const failureReasons: string[] = [];

    // 1. Calendar Status
    const day = getDayOfWeekInTimezone(businessDate, timezone);
    const isSunday = isSundayInTimezone(businessDate, timezone);
    const isHolidayDeclared = await holidayRepository.isHoliday(businessDate);
    const isHoliday = isSunday || isHolidayDeclared;

    let holidayReason = "None";
    if (isSunday) {
      holidayReason = "Sunday weekly holiday";
    } else if (isHolidayDeclared) {
      try {
        const holidayDoc = await holidayRepository.getHoliday(businessDate);
        holidayReason = holidayDoc?.name || "Configured official holiday";
      } catch {
        holidayReason = "Configured official holiday";
      }
    }

    // 2. Fetch Subscriptions
    const allSubs = await subscriptionRepository.list();
    const totalSubs = allSubs.length;
    let activeCount = 0;
    let pausedCount = 0;
    let cancelledCount = 0;
    const eligibleSubs: Subscription[] = [];

    for (const sub of allSubs) {
      if (sub.status === "active") activeCount++;
      if (sub.status === "paused") pausedCount++;
      if (sub.status === "cancelled") cancelledCount++;

      // Check eligibility for businessDate
      const isStatusActive = sub.status === "active";
      const isStarted = sub.startDate <= businessDate;
      const isNotEnded = !sub.endDate || sub.endDate >= businessDate;
      const isPausedForDate = Boolean(
        sub.status === "paused" ||
          (sub.pauseStartDate &&
            sub.pauseEndDate &&
            sub.pauseStartDate <= businessDate &&
            sub.pauseEndDate >= businessDate) ||
          (sub.pauseStartDate === businessDate &&
            (!sub.pauseEndDate || sub.pauseEndDate >= businessDate)),
      );

      if (isStatusActive && isStarted && isNotEnded && !isPausedForDate) {
        eligibleSubs.push(sub);
      }
    }

    // 3. Calculate Expected Orders
    let expectedBreakfast = 0;
    let expectedLunch = 0;
    let expectedDinner = 0;

    interface ExpectedMealTarget {
      subscriptionId: string;
      customerId: string;
      mealType: MealType;
    }
    const expectedTargets: ExpectedMealTarget[] = [];

    if (!isHoliday) {
      for (const sub of eligibleSubs) {
        let skippedMeals: MealType[] = [];
        try {
          const skipRef = doc(db, "subscriptions", sub.id, "skips", businessDate);
          const skipDoc = await getDoc(skipRef);
          if (skipDoc.exists()) {
            skippedMeals = (skipDoc.data().mealTypes || []) as MealType[];
          }
        } catch {
          // If skip fetch fails, proceed with empty skip list
        }

        for (const pref of sub.mealPreferences || []) {
          if (skippedMeals.includes(pref.mealType)) {
            continue; // Skipped by customer
          }

          expectedTargets.push({
            subscriptionId: sub.id,
            customerId: sub.customerId,
            mealType: pref.mealType,
          });

          if (pref.mealType === "breakfast") expectedBreakfast++;
          else if (pref.mealType === "lunch") expectedLunch++;
          else if (pref.mealType === "dinner") expectedDinner++;
        }
      }
    }

    const expectedTotal = expectedBreakfast + expectedLunch + expectedDinner;

    // 4. Query Actual Orders from Firestore
    const actualOrders = await orderRepository.list(
      where("date", "==", businessDate),
    );

    // Filter active (non-cancelled, non-skipped) orders
    const activeOrders = actualOrders.filter(
      (o) => o.status !== "cancelled" && o.status !== "skipped",
    );

    const actualBreakfast = activeOrders.filter(
      (o) => o.mealType === "breakfast",
    ).length;
    const actualLunch = activeOrders.filter(
      (o) => o.mealType === "lunch",
    ).length;
    const actualDinner = activeOrders.filter(
      (o) => o.mealType === "dinner",
    ).length;
    const actualTotal = activeOrders.length;

    // 5. Detect Missing Orders
    const missing: MissingOrderInfo[] = [];
    if (!isHoliday) {
      for (const target of expectedTargets) {
        const found = activeOrders.some(
          (o) =>
            o.subscriptionId === target.subscriptionId &&
            o.mealType === target.mealType,
        );
        if (!found) {
          missing.push(target);
        }
      }
    }

    // 6. Detect Duplicate Orders
    const orderKeyMap = new Map<string, number>();
    for (const order of activeOrders) {
      if (order.subscriptionId && order.mealType) {
        const key = `${order.subscriptionId}__${order.mealType}`;
        orderKeyMap.set(key, (orderKeyMap.get(key) || 0) + 1);
      }
    }

    const duplicates: DuplicateOrderInfo[] = [];
    for (const [key, count] of orderKeyMap.entries()) {
      if (count > 1) {
        const [subscriptionId, mealType] = key.split("__");
        duplicates.push({
          subscriptionId,
          mealType: mealType as MealType,
          count,
        });
      }
    }

    // 7. Evaluate Verification Result
    let verification: "PASS" | "FAIL" = "PASS";
    let isExpectedZero = false;

    if (isHoliday) {
      // Holiday or Sunday: expected is 0
      isExpectedZero = true;
      if (actualTotal > 0) {
        verification = "FAIL";
        failureReasons.push(
          `UNEXPECTED ORDERS ON HOLIDAY: ${actualTotal} orders found on ${businessDate} (${holidayReason}).`,
        );
      }
    } else if (expectedTotal === 0) {
      // Expected zero due to no eligible subscriptions or all paused/skipped
      isExpectedZero = true;
      if (actualTotal > 0) {
        verification = "FAIL";
        failureReasons.push(
          `UNEXPECTED ORDERS: 0 orders were expected but ${actualTotal} active orders were found.`,
        );
      }
    } else {
      // Regular operating day with expected orders
      if (actualTotal === 0) {
        verification = "FAIL";
        failureReasons.push(
          `UNEXPECTED ZERO: ${eligibleSubs.length} eligible subscription(s) expected ${expectedTotal} orders, but 0 orders exist in Firestore.`,
        );
      } else if (missing.length > 0) {
        verification = "FAIL";
        failureReasons.push(
          `PARTIAL GENERATION: Expected ${expectedTotal} orders, but ${missing.length} order(s) are missing in Firestore.`,
        );
      }

      if (duplicates.length > 0) {
        verification = "FAIL";
        failureReasons.push(
          `DUPLICATES DETECTED: Found ${duplicates.length} duplicate order key(s) in Firestore.`,
        );
      }
    }

    const finalResult: "SUCCESS" | "FAILED" =
      verification === "PASS" ? "SUCCESS" : "FAILED";

    return {
      businessDate,
      timezone,
      subscriptions: {
        total: totalSubs,
        active: activeCount,
        paused: pausedCount,
        cancelled: cancelledCount,
        eligible: eligibleSubs.length,
      },
      calendar: {
        day,
        isHoliday,
        reason: holidayReason,
      },
      orders: {
        expectedBreakfast,
        expectedLunch,
        expectedDinner,
        expectedTotal,
        actualBreakfast,
        actualLunch,
        actualDinner,
        actualTotal,
        missing,
        duplicates,
      },
      verification,
      finalResult,
      isExpectedZero,
      failureReasons,
    };
  }

  /**
   * Formats the exact structured banner output required by Phase 6.
   */
  formatReport(res: OrderVerificationResult): string {
    return [
      "========================================",
      "MYSURU PAAKASHALE DAILY AUTOMATION",
      "========================================",
      "",
      `Business Date: ${res.businessDate}`,
      `Timezone: ${res.timezone}`,
      "",
      "Subscriptions",
      "-------------",
      `Total: ${res.subscriptions.total}`,
      `Active: ${res.subscriptions.active}`,
      `Paused: ${res.subscriptions.paused}`,
      `Cancelled: ${res.subscriptions.cancelled}`,
      `Eligible: ${res.subscriptions.eligible}`,
      "",
      "Calendar",
      "--------",
      `Day: ${res.calendar.day}`,
      `Holiday: ${res.calendar.isHoliday ? "Yes" : "No"}`,
      `Reason: ${res.calendar.reason}`,
      "",
      "Orders",
      "------",
      `Expected Breakfast: ${res.orders.expectedBreakfast}`,
      `Expected Lunch: ${res.orders.expectedLunch}`,
      `Expected Dinner: ${res.orders.expectedDinner}`,
      `Expected Total: ${res.orders.expectedTotal}`,
      "",
      `Generated Breakfast: ${res.orders.actualBreakfast}`,
      `Generated Lunch: ${res.orders.actualLunch}`,
      `Generated Dinner: ${res.orders.actualDinner}`,
      `Generated Total: ${res.orders.actualTotal}`,
      "",
      `Missing: ${res.orders.missing.length}`,
      `Duplicates: ${res.orders.duplicates.length}`,
      "",
      "Verification:",
      res.verification,
      "",
      "Final Result:",
      res.finalResult,
      "========================================",
    ].join("\n");
  }
}

export const orderVerificationService = new OrderVerificationService();
