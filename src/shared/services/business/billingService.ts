import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { subscriptionRepository } from "../firestore/subscriptionRepository";

import { orderRepository } from "../firestore/orderRepository";
import { paymentRepository } from "../firestore/paymentRepository";
import type { Subscription } from "@/shared/types";
import { pricingService } from "./pricingService";
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
    cycleStartDate?: string,
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
      cycleStartDate || subscription.startDate,
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

    // Determine the authoritative start date for the billing cycle currently being settled.
    // If lastBilledDate is present, the current cycle begins strictly after that prior settlement boundary.
    // Otherwise, the cycle begins at subscription.startDate.
    let cycleStartDate = subscription.startDate;
    if (subscription.lastBilledDate) {
      const [ly, lm, ld] = subscription.lastBilledDate.split("-").map(Number);
      const nextDay = new Date(Date.UTC(ly, lm - 1, ld + 1));
      const nextDayStr = nextDay.toISOString().split("T")[0];
      if (nextDayStr > cycleStartDate) {
        cycleStartDate = nextDayStr;
      }
    }

    // Helper to compute next period dates (same logic as original)
    const computeNextPeriod = () => {
      let nextStart: string;
      let nextEnd: string;
      const currentEnd = subscription.endDate || effectiveEndDate || today;
      if (subscription.billingCycle === "monthly") {
        const [yearStr, monthStr, dayStr] = currentEnd.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        const nextStartDate = new Date(Date.UTC(year, month - 1, day + 1));
        const nextStartYear = nextStartDate.getUTCFullYear();
        const nextStartMonth = String(nextStartDate.getUTCMonth() + 1).padStart(2, "0");
        const nextStartDay = String(nextStartDate.getUTCDate()).padStart(2, "0");
        nextStart = `${nextStartYear}-${nextStartMonth}-${nextStartDay}`;
        const lastDayObj = new Date(Date.UTC(nextStartYear, nextStartDate.getUTCMonth() + 1, 0));
        const nextEndDay = String(lastDayObj.getUTCDate()).padStart(2, "0");
        nextEnd = `${nextStartYear}-${nextStartMonth}-${nextEndDay}`;
      } else {
        // Weekly: 7 active delivery days (skip Sundays)
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
      return { nextStart, nextEnd };
    };


    // Check if an invoice already exists for this cycle
    const existingInvSnap = await getDoc(invoiceRef);
    if (existingInvSnap.exists()) {
      const invData = existingInvSnap.data() as any;
      const invStatus = invData.status as string;
      // If renewal already processed for this invoice, skip further work
      if ((subscription as any).lastInvoiceId === invoiceId) {
        console.log(`[BillingService] Renewal already processed for subscription ${subscription.id} with invoice ${invoiceId}`);
        return true;
      }

      // If subscription was cancelled, record billing settlement metadata and do not renew
      if (reason === "cancelled") {
        await runTransaction(db, async (txn) => {
          const subRef = doc(db, "subscriptions", subscription.id);
          txn.update(subRef, {
            lastBilledDate: effectiveEndDate,
            lastInvoiceId: invoiceId,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });
        });
        return true;
      }

      // Perform renewal (or expiry) irrespective of invoice payment status
      await runTransaction(db, async (txn) => {
        const subRef = doc(db, "subscriptions", subscription.id);
        if (subscription.autoRenew !== false) {
          const { nextStart, nextEnd } = computeNextPeriod();
          txn.update(subRef, {
            startDate: nextStart,
            endDate: nextEnd,
            status: "active",
            lastBilledDate: effectiveEndDate,
            lastInvoiceId: invoiceId,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });
          console.log(`[BillingService] Auto-renewed (existing ${invStatus} invoice) subscription ${subscription.id}: ${nextStart} to ${nextEnd}`);
        } else {
          txn.update(subRef, {
            status: "expired",
            lastBilledDate: effectiveEndDate,
            lastInvoiceId: invoiceId,
            updatedAt: serverTimestamp() as unknown as Timestamp,
          });
          console.log(`[BillingService] Expired (existing ${invStatus} invoice) subscription ${subscription.id}`);
        }
      });
      // Invoice already exists, no need to create a new one
      return true;
    }

    const customerOrders = await this.getOrdersForSubscription(
      subscription,
      effectiveEndDate,
      cycleStartDate,
    );

    // Under the delivery-first, bill-after-delivery model, only successfully delivered meals are billable.
    // Scheduled, skipped, cancelled, failed_delivery, and returned_delivery meals are excluded.
    const billableOrders = customerOrders.filter(
      (o) =>
        o.subscriptionId === subscription.id &&
        o.status === "delivered" &&
        o.date >= cycleStartDate &&
        o.date <= effectiveEndDate,
    );

    // Group by date
    const ordersByDate = new Map<string, typeof billableOrders>();
    billableOrders.forEach((o) => {
      if (!ordersByDate.has(o.date)) ordersByDate.set(o.date, []);
      ordersByDate.get(o.date)!.push(o);
    });

    let standardTotal = 0;
    let addonTotal = 0;
    const allAddonOrders: typeof billableOrders = [];

    for (const [_, dailyOrders] of Array.from(ordersByDate.entries())) {
      const standardOrders = dailyOrders.filter((o) => !o.isAddon);
      const addonOrders = dailyOrders.filter((o) => o.isAddon);

      // De-duplicate add-on orders by order.id to prevent duplicate billing on retried delivery confirmations
      const seenAddonOrderIds = new Set<string>();
      addonOrders.forEach((ao) => {
        if (ao.id && seenAddonOrderIds.has(ao.id)) return;
        if (ao.id) seenAddonOrderIds.add(ao.id);
        addonTotal += ao.price || 0;
        allAddonOrders.push(ao);
      });

      // Ensure unique meal types per date to prevent duplicate billing if delivery confirmation was retried
      const seenMealsForDay = new Set<string>();
      const uniqueStandardOrders = standardOrders.filter((o) => {
        if (seenMealsForDay.has(o.mealType)) return false;
        seenMealsForDay.add(o.mealType);
        return true;
      });

      const meals = uniqueStandardOrders.map((o) => o.mealType);
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
        standardTotal += pricingService.calculateAggregatedAmount(
          subscription,
          key,
          subscription.quantity || 1,
        );
      }
    }

    const totalAmount = standardTotal + addonTotal;

    // 1b. Calculate verified payments for the current billing cycle
    const payments = await paymentRepository.getByCustomerId(
      subscription.customerId,
    );
    const cycleBillingMonth = cycleStartDate.slice(0, 7);
    const seenPaymentIds = new Set<string>();

    const verifiedUsagePayments = payments.filter((p) => {
      // 1. Must match subscription, be verified, and not be a security deposit
      if (
        p.subscriptionId !== subscription.id ||
        p.status !== "verified" ||
        p.purpose === "security_deposit"
      ) {
        return false;
      }

      // 2. Prevent duplicate payment records from double-counting
      if (seenPaymentIds.has(p.id)) {
        return false;
      }

      // 3. If payment is already linked to another invoice, never re-attribute to this invoice
      if (p.invoiceId && p.invoiceId !== invoiceId) {
        return false;
      }

      // 4. If payment is explicitly linked to this cycle's invoice, attribute directly
      if (p.invoiceId && p.invoiceId === invoiceId) {
        seenPaymentIds.add(p.id);
        return true;
      }

      // 5. Scoped cycle attribution without guessing
      let isEligible = false;
      if (subscription.billingCycle === "monthly") {
        if (p.billingMonth) {
          isEligible = p.billingMonth === cycleBillingMonth;
        } else if (p.paymentDate) {
          isEligible =
            p.paymentDate >= cycleStartDate &&
            p.paymentDate <= effectiveEndDate;
        } else {
          isEligible = false; // Do not guess receipts lacking cycle or date attribution
        }
      } else {
        // Weekly or custom cycles: match payments strictly within this cycle window
        if (p.paymentDate) {
          isEligible =
            p.paymentDate >= cycleStartDate &&
            p.paymentDate <= effectiveEndDate;
        } else {
          isEligible = false;
        }
      }

      if (isEligible) {
        seenPaymentIds.add(p.id);
        return true;
      }
      return false;
    });

    const seenDepositIds = new Set<string>();
    const verifiedSecurityDeposits = payments.filter((p) => {
      if (
        p.subscriptionId === subscription.id &&
        p.status === "verified" &&
        p.purpose === "security_deposit"
      ) {
        if (seenDepositIds.has(p.id)) return false;
        seenDepositIds.add(p.id);
        return true;
      }
      return false;
    });
    const paymentsTotal = verifiedUsagePayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const depositHeld = verifiedSecurityDeposits.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

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

      // Consumption-Based Billing (Phase 6B & 6E - Option A):
      // Meal charges are billed strictly after delivery. Wallet credit is eliminated for meal billing.
      // Do not apply legacy wallet balances automatically, and do not generate cycle_credit or wallet credit.
      const grossCycleCharge = totalAmount;
      const invoiceTotalAmount = grossCycleCharge;
      const invoiceCollectedAmount = paymentsTotal; // verified payments for this cycle
      const invoicePaidAmount = Math.min(invoiceTotalAmount, invoiceCollectedAmount);
      const remainingDue = Math.max(0, invoiceTotalAmount - invoicePaidAmount);
      const remainingToRefund = Math.max(0, invoiceCollectedAmount - invoiceTotalAmount);
      const isSettled = remainingDue <= 0;

      const invoiceLineItems: any[] = [
        {
          description: `${(subscription.planTier || "regular").toUpperCase()} Plan (${subscription.billingCycle})`,
          quantity: 1,
          unitPrice: standardTotal,
          amount: standardTotal,
        },
        ...allAddonOrders.map((ao) => ({
          description: `Add-on: ${ao.mealName || ao.itemsLabel} (${ao.date})`,
          quantity: ao.addonQuantity || 1,
          unitPrice: ao.addonUnitPrice || ao.price,
          amount: ao.price,
          addonId: ao.addonId,
          mealType: ao.mealType,
          orderId: ao.id,
        })),
      ];

      txn.set(invoiceRef, {
        id: invoiceId,
        invoiceNumber,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        lineItems: invoiceLineItems,
        subtotal: grossCycleCharge,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: invoiceTotalAmount,
        paidAmount: invoicePaidAmount,
        collectedAmount: invoiceCollectedAmount,
        creditApplied: 0,
        depositHeld,
        remainingToRefund,
        currency: "INR",
        status: isSettled ? "paid" : "issued",
        billingPeriodStart: cycleStartDate,
        billingPeriodEnd: effectiveEndDate,
        dueDate: today, // due immediately on generation
        paidAt: isSettled ? today : null,
        paymentId: isSettled && verifiedUsagePayments.length > 0 ? verifiedUsagePayments[0].id : null,
        createdAt: serverTimestamp() as unknown as Timestamp,
      });

      // Under Phase 6B, wallet credit is eliminated for meal billing:
      // No creditApplied or cycle_credit ledger entries are generated, and user creditBalance is untouched.

      // 2. Auto-renew or Expire (record billing metadata if cancelled)
      const subRef = doc(db, "subscriptions", subscription.id);
      if (reason === "cancelled") {
        txn.update(subRef, {
          lastBilledDate: effectiveEndDate,
          lastInvoiceId: invoiceId,
          updatedAt: serverTimestamp() as unknown as Timestamp,
        });
        console.log(
          `[BillingService] Settled cancelled subscription ${subscription.id} with invoice ${invoiceId}`,
        );
      } else if (subscription.autoRenew !== false) {
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
    });

    return true;
  }

  /**
   * Adjusts any existing issued or open invoice when one or more meal orders are cancelled.
   *
   * Business rules:
   * 1. Consumption-based billing: Cancelled meals directly reduce the invoice subtotal/total.
   * 2. No wallet credits: Do NOT add funds to customer creditBalance or create cycle_credit entries.
   * 3. Idempotency: Retrying cancellation cannot deduct the same meal twice.
   * 4. Unpaid / partially-paid invoices: Recalculate totalAmount and reconcile remainingDue while
   *    preserving payment history.
   * 5. Fully paid invoices: Do NOT silently fabricate refunds or credit. Flag for explicit authorized decision.
   * 6. Security deposits: Unaffected.
   */
  async adjustInvoiceForCancelledOrders(
    orders: import("@/shared/types").Order[],
    subscription: Subscription,
    actorUid: string = "system",
  ): Promise<{ adjusted: boolean; invoiceId?: string; deductedAmount: number; remainingToRefund?: number }> {
    if (!orders || orders.length === 0) {
      return { adjusted: false, deductedAmount: 0 };
    }

    // 1. Locate relevant invoice: check order.invoiceId or open invoice for subscription
    const invoiceIdFromOrders = orders.find((o) => o.invoiceId)?.invoiceId;
    let targetInvoice: import("@/shared/types").Invoice | null = null;

    if (invoiceIdFromOrders) {
      const invSnap = await getDoc(doc(db, "invoices", invoiceIdFromOrders));
      if (invSnap.exists()) {
        targetInvoice = invSnap.data() as import("@/shared/types").Invoice;
      }
    }

    if (!targetInvoice) {
      // Look for open / issued invoice for this subscription
      try {
        const { accountsRepository } = await import("../firestore/accountsRepository");
        const customerInvoices = await accountsRepository.getInvoicesByCustomerId(subscription.customerId);
        const openInv = customerInvoices.find(
          (inv) =>
            (inv.subscriptionId === subscription.id || !inv.subscriptionId) &&
            (inv.status === "issued" || inv.status === "draft" || inv.status === "overdue" || inv.status === "paid"),
        );
        if (openInv) {
          targetInvoice = openInv;
        }
      } catch {
        // In mock unit test environments or if repository query fails, continue without open invoice
      }
    }

    // If no existing invoice has been issued yet, cancellation is naturally handled
    // at cycle-end by processSubscriptionEnd which excludes cancelled orders from billable consumption.
    if (!targetInvoice) {
      return { adjusted: false, deductedAmount: 0 };
    }

    // Do not modify void invoices
    if (targetInvoice.status === "void") {
      return { adjusted: false, invoiceId: targetInvoice.id, deductedAmount: 0 };
    }

    // Start transaction for atomic adjustment & idempotency
    const invoiceRef = doc(db, "invoices", targetInvoice.id);
    let finalDeducted = 0;
    let finalRemainingToRefund = 0;

    await runTransaction(db, async (txn) => {
      const invSnap = await txn.get(invoiceRef);
      if (!invSnap.exists()) return;
      const currentInv = invSnap.data() as import("@/shared/types").Invoice;

      if (currentInv.status === "void") return;

      const existingLineItems = [...(currentInv.lineItems || [])];
      const deductedOrderIds = new Set<string>((currentInv as any).deductedOrderIds || []);

      let totalDeduction = 0;
      const newLineItems = [...existingLineItems];

      for (const order of orders) {
        // Idempotency: skip if this order was already deducted
        if (deductedOrderIds.has(order.id!)) {
          continue;
        }

        // Also check if line items already contain this order's cancellation
        const alreadyInLineItems = existingLineItems.some(
          (li) => li.orderId === order.id && li.amount < 0,
        );
        if (alreadyInLineItems) {
          deductedOrderIds.add(order.id!);
          continue;
        }

        // Calculate authoritative price for this cancelled meal
        let mealPrice = order.price || 0;
        if (!mealPrice || mealPrice <= 0) {
          if (order.isAddon) {
            mealPrice = (order.addonUnitPrice || 0) * (order.addonQuantity || 1);
          } else {
            mealPrice = pricingService.calculateCancellationAmount(
              subscription,
              [order.mealType],
            );
          }
        }

        if (mealPrice > 0) {
          totalDeduction += mealPrice;
          deductedOrderIds.add(order.id!);
          newLineItems.push({
            description: `Cancelled meal: ${(order.mealType || "meal").toUpperCase()} (${order.date})`,
            quantity: 1,
            unitPrice: -mealPrice,
            amount: -mealPrice,
            mealType: order.mealType,
            orderId: order.id,
          });
        }
      }

      if (totalDeduction <= 0) {
        return; // Nothing new to deduct
      }

      finalDeducted = totalDeduction;
      const newSubtotal = Math.max(0, (currentInv.subtotal || 0) - totalDeduction);
      const newTotalAmount = Math.max(0, (currentInv.totalAmount || 0) - totalDeduction);

      // Reconcile paidAmount and remainingDue while strictly preserving payment history (Phase 6E Option A)
      const { getInvoiceCollectedAmount } = await import("@/shared/types");
      const collected = getInvoiceCollectedAmount(currentInv);
      const newPaidAmount = Math.min(newTotalAmount, collected);
      const confirmedRefunds = Math.max(0, (currentInv as any).confirmedRefunds || 0);

      let newStatus: import("@/shared/types").InvoiceStatus = currentInv.status;
      let remainingToRefund = 0;

      if (collected >= newTotalAmount) {
        newStatus = "paid";
        // Excess paid amount calculated as max(0, collectedAmount - revisedTotalAmount - confirmedRefunds)
        remainingToRefund = Math.max(0, collected - newTotalAmount - confirmedRefunds);
        finalRemainingToRefund = remainingToRefund;
      } else {
        newStatus = currentInv.status === "paid" ? "issued" : currentInv.status;
        remainingToRefund = 0;
        finalRemainingToRefund = 0;
      }

      txn.update(invoiceRef, {
        lineItems: newLineItems,
        subtotal: newSubtotal,
        totalAmount: newTotalAmount,
        paidAmount: newPaidAmount, // Strictly capped at newTotalAmount under Option A contract
        collectedAmount: collected, // Explicitly preserve verified payment collections
        status: newStatus,
        remainingToRefund,
        paidAt: newStatus === "paid" && !currentInv.paidAt ? serverTimestamp() : currentInv.paidAt || null,
        deductedOrderIds: Array.from(deductedOrderIds),
        updatedAt: serverTimestamp(),
      });
    });

    if (finalDeducted > 0) {
      try {
        const { auditRepository } = await import("../firestore/auditRepository");
        await auditRepository.logAction(
          "invoice_adjusted_for_cancellation",
          actorUid,
          "system",
          "BillingService",
          targetInvoice.id,
          "invoice",
          {
            invoiceId: targetInvoice.id,
            deductedAmount: finalDeducted,
            remainingToRefund: finalRemainingToRefund,
            requiresManualRefundAction: finalRemainingToRefund > 0,
            orderIds: orders.map((o) => o.id),
            customerId: subscription.customerId,
            subscriptionId: subscription.id,
          },
        );
      } catch {}
    }

    return {
      adjusted: finalDeducted > 0,
      invoiceId: targetInvoice.id,
      deductedAmount: finalDeducted,
      remainingToRefund: finalRemainingToRefund,
    };
  }
}

export const billingService = new BillingService();
