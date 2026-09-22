import {
  Timestamp,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { subscriptionRepository } from "../firestore/subscriptionRepository";

import { orderRepository } from "../firestore/orderRepository";
import { paymentRepository } from "../firestore/paymentRepository";
import type { Subscription } from "@/shared/types";

class BillingService {
  /**
   * Process daily billing and auto-renewals.
   * Runs daily to catch subscriptions whose cycle has ended.
   */
  async processDailyBilling(
    today: string,
  ): Promise<{
    success: boolean;
    processed: number;
    errors: number;
    quarantined: number;
  }> {
    let processed = 0;
    let errors = 0;
    let quarantined = 0;

    try {
      const allSubs = await subscriptionRepository.list();

      // Look back up to 30 days relative to today for expired subscriptions to catch any that were missed
      // or marked expired before their invoice could be generated (e.g. from prior failed runs).
      const todayDate = new Date(`${today}T00:00:00Z`);
      const thirtyDaysAgo = new Date(
        todayDate.getTime() - 30 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0];

      const subscriptions = allSubs.filter((sub) => {
        if (
          (sub.status === "active" || sub.status === "paused") &&
          sub.endDate &&
          sub.endDate < today
        ) {
          return true;
        }
        // Include recently expired subscriptions that have not yet had their invoice generated
        if (
          sub.status === "expired" &&
          sub.endDate &&
          sub.endDate >= thirtyDaysAgo &&
          (sub as any).lastBilledDate !== sub.endDate
        ) {
          return true;
        }
        // Include cancelled subscriptions that have not yet had their final usage invoiced
        if (
          sub.status === "cancelled" &&
          sub.cancellationDate &&
          (sub as any).lastBilledDate !== sub.cancellationDate
        ) {
          return true;
        }
        return false;
      });

      for (const sub of subscriptions) {
        try {
          const reason = sub.status === "cancelled" ? "cancelled" : "expired";
          const didProcess = await this.processWithRetry(() =>
            this.processSubscriptionEnd(sub, today, reason),
          );
          if (didProcess) {
            processed++;
          }
        } catch (err: any) {
          console.error(
            `[BillingService] Error processing subscription ${sub.id}:`,
            err,
          );
          errors++;

          try {
            const { failureQueueRepository } = await import(
              "../firestore/failureQueueRepository"
            );
            await failureQueueRepository.logFailure(
              sub.customerId,
              sub.id,
              "billing",
              today,
              `Billing failed: ${err?.message || String(err)}`,
              err?.stack,
            );
            quarantined++;
          } catch (qErr) {
            console.error(
              `[BillingService] Failed to log failure to queue for subscription ${sub.id}:`,
              qErr,
            );
          }
        }
      }
    } catch (err) {
      console.error(
        "[BillingService] Failed to list subscriptions for billing:",
        err,
      );
      return { success: false, processed, errors, quarantined };
    }

    return {
      success: errors === 0 || errors === quarantined,
      processed,
      errors,
      quarantined,
    };
  }

  /**
   * Executes an asynchronous operation with retry logic and exponential backoff.
   * Absorbs transient network glitches or momentary Firestore concurrency contention.
   */
  private async processWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 2,
    baseDelayMs = 300,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        if (attempt <= maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Retrieves orders for subscription billing using a multi-tiered approach:
   * Tier 1: Query by subscriptionId (uses built-in single-field index, zero composite index requirement)
   * Tier 2: Query by customerId in date range (composite query with automatic in-memory fallback)
   */
  private async getOrdersForSubscription(
    subscription: Subscription,
    effectiveEndDate: string,
  ) {
    try {
      if (typeof orderRepository.getBySubscriptionId === "function") {
        const subOrders = await orderRepository.getBySubscriptionId(
          subscription.id,
        );
        if (subOrders && subOrders.length > 0) {
          return subOrders;
        }
      }
    } catch (err) {
      console.warn(
        `[BillingService] getBySubscriptionId failed for ${subscription.id}, falling back to range query:`,
        err,
      );
    }

    return await orderRepository.getCustomerOrdersInRange(
      subscription.customerId,
      subscription.startDate,
      effectiveEndDate,
    );
  }

  async processSubscriptionEnd(
    subscription: Subscription,
    today: string,
    reason: "expired" | "cancelled" = "expired",
  ): Promise<boolean> {
    const effectiveEndDate =
      reason === "cancelled"
        ? subscription.cancellationDate || today
        : subscription.cancellationDate || subscription.endDate || today;
    const invoiceId = `inv_${subscription.id}_${effectiveEndDate}`;
    const invoiceRef = doc(db, "invoices", invoiceId);

    // Check if invoice already exists for this cycle to avoid redundant order fetching
    const existingInvCheck = await getDoc(invoiceRef);
    if (existingInvCheck.exists()) {
      if (
        subscription.status === "expired" &&
        (subscription as any).lastBilledDate !== effectiveEndDate
      ) {
        try {
          const subRef = doc(db, "subscriptions", subscription.id);
          await updateDoc(subRef, { lastBilledDate: effectiveEndDate });
        } catch {}
      }
      return false;
    }

    const customerOrders = await this.getOrdersForSubscription(
      subscription,
      effectiveEndDate,
    );

    // Calculate total bill for the ended cycle
    const terminalStatuses = [
      "scheduled",
      "skipped",
      "cancelled",
      "failed_delivery",
      "returned_delivery",
    ];
    const billableOrders = customerOrders.filter(
      (o) =>
        o.subscriptionId === subscription.id &&
        !terminalStatuses.includes(o.status) &&
        o.date >= subscription.startDate &&
        o.date <= effectiveEndDate,
    );

    const PRICING_MATRIX = {
      basic: {
        breakfast: 60,
        lunch: 65,
        dinner: 65,
        breakfast_lunch: 115,
        lunch_dinner: 115,
        breakfast_dinner: 115,
        breakfast_lunch_dinner: 159,
      },
      regular: {
        breakfast: 60,
        lunch: 85,
        dinner: 85,
        breakfast_lunch: 140,
        lunch_dinner: 140,
        breakfast_dinner: 140,
        breakfast_lunch_dinner: 210,
      },
    };

    // Group by date
    const ordersByDate = new Map<string, typeof billableOrders>();
    billableOrders.forEach((o) => {
      if (!ordersByDate.has(o.date)) ordersByDate.set(o.date, []);
      ordersByDate.get(o.date)!.push(o);
    });

    let totalAmount = 0;
    const tier = subscription.planTier as "basic" | "regular";

    for (const [_, dailyOrders] of Array.from(ordersByDate.entries())) {
      const meals = dailyOrders.map((o) => o.mealType);
      let key = "";
      if (
        meals.includes("breakfast") &&
        meals.includes("lunch") &&
        meals.includes("dinner")
      ) {
        key = "breakfast_lunch_dinner";
      } else if (meals.includes("breakfast") && meals.includes("lunch")) {
        key = "breakfast_lunch";
      } else if (meals.includes("lunch") && meals.includes("dinner")) {
        key = "lunch_dinner";
      } else if (meals.includes("breakfast") && meals.includes("dinner")) {
        key = "breakfast_dinner";
      } else if (meals.includes("breakfast")) {
        key = "breakfast";
      } else if (meals.includes("lunch")) {
        key = "lunch";
      } else if (meals.includes("dinner")) {
        key = "dinner";
      }

      if (key) {
        if (subscription.pricingMatrixSnapshot) {
          totalAmount +=
            (subscription.pricingMatrixSnapshot as any)[key] *
            (subscription.quantity || 1);
        } else {
          // Legacy calculation
          const fullMeals = (subscription.mealPreferences || []).map(
            (m: any) => m.mealType,
          );
          let fullKey = "";
          if (fullMeals.includes("breakfast")) fullKey += "breakfast";
          if (fullMeals.includes("lunch"))
            fullKey += (fullKey ? "_" : "") + "lunch";
          if (fullMeals.includes("dinner"))
            fullKey += (fullKey ? "_" : "") + "dinner";

          if (key === fullKey) {
            totalAmount +=
              (subscription.pricePerDaySnapshot || 0) *
              (subscription.quantity || 1);
          } else {
            totalAmount +=
              ((PRICING_MATRIX[tier] as any)[key] ||
                subscription.pricePerDaySnapshot ||
                0) * (subscription.quantity || 1);
          }
        }
      }
    }

    // 1b. Calculate verified payments
    const payments = await paymentRepository.getByCustomerId(
      subscription.customerId,
    );
    const verifiedUsagePayments = payments.filter(
      (p) =>
        p.subscriptionId === subscription.id &&
        p.status === "verified" &&
        p.purpose !== "security_deposit",
    );
    const verifiedSecurityDeposits = payments.filter(
      (p) =>
        p.subscriptionId === subscription.id &&
        p.status === "verified" &&
        p.purpose === "security_deposit",
    );
    const paymentsTotal = verifiedUsagePayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const depositHeld = verifiedSecurityDeposits.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

    const balanceDue = totalAmount - paymentsTotal;
    const payableAmount = Math.max(0, balanceDue);

    let prefix = "INV";
    try {
      const { settingsRepository } = await import(
        "../firestore/settingsRepository"
      );
      const settings = await settingsRepository.getBusinessSettings();
      if (settings?.financials?.invoicePrefix) {
        prefix = settings.financials.invoicePrefix.replace(/[-_]$/, "");
      }
    } catch {}

    const invoiceNumber = `${prefix}-${subscription.customerId.substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Start Transaction for Idempotency
    await runTransaction(db, async (txn) => {
      const existingInv = await txn.get(invoiceRef);
      if (existingInv.exists()) {
        console.log(
          `[BillingService] Invoice already exists for subscription ${subscription.id} ending on ${effectiveEndDate}`,
        );
        return; // Idempotent block
      }

      txn.set(invoiceRef, {
        id: invoiceId,
        invoiceNumber,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        lineItems: [
          {
            description: `${(subscription.planTier || "regular").toUpperCase()} Plan (${subscription.billingCycle})`,
            quantity: 1,
            unitPrice: totalAmount,
            amount: totalAmount,
          },
          {
            description: "Less: Verified Payments Received",
            quantity: 1,
            unitPrice: -paymentsTotal,
            amount: -paymentsTotal,
          },
        ],
        subtotal: totalAmount,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: payableAmount,
        depositHeld,
        currency: "INR",
        status: balanceDue <= 0 ? "paid" : "issued",
        billingPeriodStart: subscription.startDate,
        billingPeriodEnd: effectiveEndDate,
        dueDate: today, // due immediately on generation
        paidAt: balanceDue <= 0 ? today : null,
        paymentId: null,
        createdAt: serverTimestamp() as unknown as Timestamp,
      });

      // 2. Auto-renew or Expire (skip if manually cancelled)
      if (reason !== "cancelled") {
        const subRef = doc(db, "subscriptions", subscription.id);
        if (subscription.autoRenew !== false) {
          let nextStart: string;
          let nextEnd: string;

          const currentEnd = subscription.endDate || effectiveEndDate || today;

          if (subscription.billingCycle === "monthly") {
            // Continuous delivery: nextStart is the day immediately following currentEnd
            const [yearStr, monthStr, dayStr] = currentEnd.split("-");
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10); // 1-12
            const day = parseInt(dayStr, 10);

            // UTC-safe date addition: start the very next day with no gap
            const nextStartDate = new Date(Date.UTC(year, month - 1, day + 1));
            const nextStartYear = nextStartDate.getUTCFullYear();
            const nextStartMonth = String(nextStartDate.getUTCMonth() + 1).padStart(2, "0");
            const nextStartDay = String(nextStartDate.getUTCDate()).padStart(2, "0");
            nextStart = `${nextStartYear}-${nextStartMonth}-${nextStartDay}`;

            // nextEnd: last calendar day of nextStart's month (day 0 of following month)
            const lastDayObj = new Date(Date.UTC(nextStartYear, nextStartDate.getUTCMonth() + 1, 0));
            const nextEndDay = String(lastDayObj.getUTCDate()).padStart(2, "0");
            nextEnd = `${nextStartYear}-${nextStartMonth}-${nextEndDay}`;
          } else {
            // Weekly: 7 active delivery days (skipping Sundays)
            const [sy, sm, sd] = currentEnd.split("-").map(Number);
            const d = new Date(Date.UTC(sy, sm - 1, sd));
            let foundStart = false;
            while (!foundStart) {
              d.setUTCDate(d.getUTCDate() + 1);
              if (d.getUTCDay() !== 0) foundStart = true;
            }
            nextStart = d.toISOString().split("T")[0];

            let durationDays = 6;
            let daysAdded = 0;
            const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            while (daysAdded < durationDays) {
              e.setUTCDate(e.getUTCDate() + 1);
              if (e.getUTCDay() !== 0) daysAdded++;
            }
            nextEnd = e.toISOString().split("T")[0];
          }

          txn.update(subRef, {
            startDate: nextStart,
            endDate: nextEnd,
            status: "active",
            lastBilledDate: effectiveEndDate,
            lastInvoiceId: invoiceId,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });

          console.log(
            `[BillingService] Auto-renewed subscription ${subscription.id}: ${nextStart} to ${nextEnd}`,
          );
        } else {
          txn.update(subRef, {
            status: "expired",
            lastBilledDate: effectiveEndDate,
            lastInvoiceId: invoiceId,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });
          console.log(
            `[BillingService] Expired subscription ${subscription.id}`,
          );
        }
      }
    });

    return true;
  }
}

export const billingService = new BillingService();
