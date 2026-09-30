import {
  Timestamp,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";
import {
  getTodayInTimezone,
  getTodayIST,
  calculateSubscriptionEndDate,
} from "@/shared/lib/date";
import { subscriptionRepository } from "../firestore/subscriptionRepository";
import { db } from "@/shared/lib/firebase";
import { settingsRepository } from "../firestore/settingsRepository";
import { orderService } from "./orderService";
import { pricingService } from "./pricingService";
import type {
  MealPreference,
  PlanTier,
  Subscription,
  SubscriptionStatus,
  MealPlanPricing,
} from "@/shared/types";

export interface AdminActor {
  uid: string;
  role: string;
  fullName?: string;
}

export interface AdminCreateSubscriptionInput {
  customerId: string;
  planId: string;
  startDate: string; // YYYY-MM-DD
  mealPreferences: MealPreference[];
  deliveryAddressId: string;
  billingCycle?: "weekly" | "monthly";
  quantity?: number;
  autoRenew?: boolean;
  status?: SubscriptionStatus;
  pricePerDaySnapshot?: number;
  pricingMatrixSnapshot?: MealPlanPricing;
  endDate?: string | null;
}

class SubscriptionService {
  /**
   * Create a new subscription draft.
   */
  async createSubscription(
    customerId: string,
    planId: string,
    planTier: PlanTier,
    quantity: number,
    pricePerDaySnapshot: number,
    pricingMatrixSnapshot: MealPlanPricing,
    mealPreferences: MealPreference[],
    startDate: string,
    deliveryAddressId: string,
    billingCycle: "weekly" | "monthly",
    endDate: string | null,
    autoRenew: boolean = true,
    options?: {
      status?: SubscriptionStatus;
      adminActor?: AdminActor;
    },
  ): Promise<string> {
    if (
      !customerId ||
      !planId ||
      !planTier ||
      quantity <= 0 ||
      !startDate ||
      !deliveryAddressId
    ) {
      throw new Error(
        "Invalid subscription data: Missing required fields or invalid quantity.",
      );
    }
    if (!mealPreferences || mealPreferences.length === 0) {
      throw new Error("At least one meal preference is required.");
    }

    const subscriptionId = crypto.randomUUID();
    const settings = await settingsRepository.getBusinessSettings();
    const depositAmount = settings?.pricing.securityDepositAmount || 1000;

    let finalPricingMatrix = pricingMatrixSnapshot;
    if (!finalPricingMatrix || Object.keys(finalPricingMatrix).length === 0) {
      finalPricingMatrix = await pricingService.getEffectivePricing(
        startDate,
        planTier,
      );
    }

    const initialStatus = options?.status || "pending_payment";

    await subscriptionRepository.create(
      {
        customerId,
        planId,
        status: initialStatus,
        planTier,
        quantity,
        pricePerDaySnapshot,
        pricingMatrixSnapshot: finalPricingMatrix,
        zoneId: null,
        mealPreferences,
        startDate,
        endDate,
        billingCycle,
        autoRenew,
        deliveryAddressId,
        latestPaymentId: null,
        depositAmount,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      },
      subscriptionId,
    );

    return subscriptionId;
  }

  /**
   * Admin-assisted customer subscription creation (Phase E3).
   * Authoritatively validates customer, plan, dates, preferences, duplicates, and E2 pricing.
   */
  async createSubscriptionByAdmin(
    adminActor: AdminActor,
    input: AdminCreateSubscriptionInput,
  ): Promise<string> {
    // 1. Authorization: Only admin can execute this flow
    if (!adminActor || adminActor.role !== "admin") {
      throw new Error(
        "Unauthorized: Only Admin can create customer subscriptions.",
      );
    }

    // 2. Validate customer exists
    if (!input.customerId) {
      throw new Error("Customer ID is required.");
    }
    const { userRepository } = await import("../firestore/userRepository");
    const customer = await userRepository.getById(input.customerId);
    if (!customer || customer.role !== "customer") {
      throw new Error("Customer does not exist.");
    }

    // 3. Validate plan exists and is active
    if (!input.planId) {
      throw new Error("Plan ID is required.");
    }
    const { mealPlanRepository } = await import("../firestore/mealPlanRepository");
    const plan = await mealPlanRepository.getById(input.planId);
    if (!plan || !plan.isActive) {
      throw new Error("Invalid or inactive meal plan.");
    }

    // 4. Validate start date format and future/today constraint
    if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      throw new Error("Invalid start date format. Expected YYYY-MM-DD.");
    }
    const todayIST = getTodayIST();
    if (input.startDate < todayIST) {
      throw new Error("Subscription start date cannot be in the past.");
    }

    // 5. Validate meal preferences
    if (!input.mealPreferences || input.mealPreferences.length === 0) {
      throw new Error("At least one meal preference is required.");
    }
    if (plan.mealSlots && plan.mealSlots.length > 0) {
      const planSlotTypes = new Set(plan.mealSlots.map((s) => s.mealType));
      for (const pref of input.mealPreferences) {
        if (!planSlotTypes.has(pref.mealType)) {
          throw new Error(
            `Meal type '${pref.mealType}' is not offered by plan '${plan.name}'.`,
          );
        }
      }
    }

    // 6. Validate duplicate / conflicting active subscription
    const existingActive =
      await subscriptionRepository.getActiveSubscriptionByCustomerId(
        input.customerId,
      );
    if (
      existingActive &&
      (existingActive.status === "active" ||
        existingActive.status === "paused")
    ) {
      throw new Error(
        "Customer already has an active subscription. Conflicting active subscriptions are not permitted.",
      );
    }

    // 7. Validate delivery address
    if (!input.deliveryAddressId) {
      throw new Error("Delivery address is required.");
    }

    // 8. Pricing resolution (E2 authoritative)
    const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
    const pricingSnapshot =
      input.pricingMatrixSnapshot ||
      (await pricingService.getEffectivePricing(input.startDate, plan.tier));

    const pricePerDay =
      input.pricePerDaySnapshot !== undefined
        ? input.pricePerDaySnapshot
        : await pricingService.calculateSubscriptionPrice(
            input.mealPreferences,
            input.startDate,
            plan.tier,
          );

    // 9. Calculate end date if not provided
    const billingCycle = input.billingCycle || "monthly";
    const endDate =
      input.endDate !== undefined
        ? input.endDate
        : calculateSubscriptionEndDate(input.startDate, billingCycle);

    const initialStatus = input.status || "active";

    // 10. Persist subscription via createSubscription
    const subscriptionId = await this.createSubscription(
      input.customerId,
      plan.id,
      plan.tier,
      quantity,
      pricePerDay,
      pricingSnapshot,
      input.mealPreferences,
      input.startDate,
      input.deliveryAddressId,
      billingCycle,
      endDate,
      input.autoRenew ?? true,
      { status: initialStatus, adminActor },
    );

    // 11. Lifecycle initializations for active subscription
    if (initialStatus === "active") {
      if (input.startDate <= todayIST) {
        try {
          const { orderService } = await import("./orderService");
          const createdSub = await subscriptionRepository.getById(subscriptionId);
          if (createdSub) {
            const mealTypes = (input.mealPreferences || []).map((p) => p.mealType);
            await orderService.generateOrdersForSubscription(
              createdSub,
              todayIST,
              mealTypes,
            );
          }
        } catch (err) {
          console.error(
            `[SubscriptionService] Failed to generate initial orders for subscription ${subscriptionId}:`,
            err,
          );
        }
      }

      // Notifications
      try {
        const { notifySubscriptionApproved } = await import(
          "../firestore/notificationService"
        );
        notifySubscriptionApproved(
          input.customerId,
          subscriptionId,
          plan.tier,
          input.startDate,
        ).catch(() => {});
      } catch (err) {
        console.error(
          "[SubscriptionService] Failed to send activation notification:",
          err,
        );
      }
    } else {
      try {
        const { notifySubscriptionCreated } = await import(
          "../firestore/notificationService"
        );
        notifySubscriptionCreated(
          input.customerId,
          subscriptionId,
          plan.tier,
        ).catch(() => {});
      } catch (err) {
        console.error(
          "[SubscriptionService] Failed to send creation notification:",
          err,
        );
      }
    }

    // 12. Audit Logging
    try {
      const { auditRepository } = await import("../firestore/auditRepository");
      await auditRepository.logAction(
        "admin_subscription_created",
        adminActor.uid,
        adminActor.role || "admin",
        adminActor.fullName || "Admin",
        subscriptionId,
        "subscription",
        {
          actorId: adminActor.uid,
          actorRole: adminActor.role,
          customerId: input.customerId,
          subscriptionId,
          selectedPlan: plan.name,
          planId: plan.id,
          planTier: plan.tier,
          startDate: input.startDate,
          status: initialStatus,
          action: "admin_subscription_created",
        },
      );
    } catch (err) {
      console.error("[SubscriptionService] Failed to log audit event:", err);
    }

    return subscriptionId;
  }

  /**
   * Admin fast-path activation for a subscription that's still in
   * 'draft' or 'pending_payment'
   */
  async approveSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error("Valid subscription object is required.");
    }
    if (subscription.status === "active") {
      return; // Idempotency: Already active
    }
    if (
      subscription.status === "cancelled" ||
      subscription.status === "expired"
    ) {
      throw new Error(
        `Cannot approve a ${subscription.status} subscription — use renew instead.`,
      );
    }
    await subscriptionRepository.updateStatus(subscription.id, "active");
    if (subscription.pauseStartDate || subscription.pauseEndDate) {
      await subscriptionRepository.update(subscription.id, {
        pauseStartDate: null,
        pauseEndDate: null,
      });
    }

    // Verify any pending payments associated with this subscription
    const { paymentRepository } =
      await import("../firestore/paymentRepository");
    const { payments } = await paymentRepository.getPaymentsPaginated(
      { status: "pending" },
      100,
    );
    const relatedPayments = payments.filter(
      (p) => p.subscriptionId === subscription.id,
    );

    for (const payment of relatedPayments) {
      await paymentRepository.update(payment.id, {
        status: "verified",
        verificationNotes: "Verified via subscription fast-path activation.",
      });
    }

    // Immediately generate initial orders for start date (or today if already started)
    const { orderService } = await import("./orderService");
    const today = getTodayInTimezone();
    const targetDate =
      subscription.startDate <= today ? today : subscription.startDate;

    const mealTypes = (subscription.mealPreferences || []).map(
      (p) => p.mealType,
    );
    console.log(
      `[SubscriptionService] Subscription ${subscription.id} activated. Generating initial orders for ${targetDate}...`,
    );

    try {
      await orderService.generateOrdersForSubscription(
        subscription,
        targetDate,
        mealTypes,
      );
    } catch (err) {
      console.error(
        `[SubscriptionService] Failed to generate initial orders for subscription ${subscription.id}:`,
        err,
      );
    }

    try {
      const { notifySubscriptionApproved } =
        await import("../firestore/notificationService");
      const { auditRepository } = await import("../firestore/auditRepository");
      const { auth } = await import("@/shared/lib/firebase");
      await notifySubscriptionApproved(
        subscription.customerId,
        subscription.id,
        subscription.planTier,
        subscription.startDate,
      );
      await auditRepository.logAction(
        "subscription_approved",
        auth.currentUser?.uid || "system",
        "admin",
        "Admin",
        subscription.id,
        "subscription",
      );
    } catch (err) {
      console.warn(
        "[SubscriptionService] Failed to send notification or audit:",
        err,
      );
    }
  }

  /** Cancels a subscription and rejects any pending payments. */
  async rejectSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error("Valid subscription object is required.");
    }
    if (subscription.status === "cancelled") {
      return; // Idempotency
    }
    const { getTodayInTimezone } = await import("@/shared/lib/date");
    await subscriptionRepository.update(subscription.id, {
      status: "cancelled",
      cancellationDate: getTodayInTimezone(),
    });

    // Reject any pending payments associated with this subscription (admin-only privilege)
    try {
      const { paymentRepository } =
        await import("../firestore/paymentRepository");
      const { payments } = await paymentRepository.getPaymentsPaginated(
        { status: "pending" },
        100,
      );
      const relatedPayments = payments.filter(
        (p) => p.subscriptionId === subscription.id,
      );

      for (const payment of relatedPayments) {
        await paymentRepository.update(payment.id, {
          status: "rejected",
          verificationNotes:
            "Subscription draft was cancelled by the customer or admin.",
        });
      }
    } catch (paymentErr) {
      // In customer self-cancellation context, client writes to /payments are restricted by security rules.
      // Daily automation / backend settles unverified claims.
      console.warn(
        `[SubscriptionService] Client payment cleanup skipped (handled by backend):`,
        paymentErr,
      );
    }

    // Unify natural expiry + manual cancellation settlement
    if (subscription.status === "active" || subscription.status === "paused") {
      const { billingService } = await import("./billingService");
      const today = getTodayInTimezone();
      try {
        await billingService.processSubscriptionEnd(
          subscription,
          today,
          "cancelled",
        );
      } catch (err) {
        // In customer self-cancellation context, invoice creation is restricted to admin/accounts by security rules.
        // Daily billing automation will settle this cancelled subscription via processDailyBilling.
        console.warn(
          `[SubscriptionService] Final settlement deferred to daily billing automation for cancelled subscription ${subscription.id}:`,
          err,
        );
      }
    }
  }

  /** Admin override of the customer's own pause action, with optional schedule. */
  async pauseSubscription(
    subscription: Subscription,
    shouldPauseNow: boolean = true,
    pauseStartDate: string | null = null,
    pauseEndDate: string | null = null,
  ): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error("Valid subscription object is required.");
    }
    if (
      subscription.status !== "active" &&
      subscription.status !== "paused" &&
      shouldPauseNow
    ) {
      throw new Error(
        "Only an active or already paused subscription can be paused immediately.",
      );
    }
    if (
      subscription.status === "paused" &&
      shouldPauseNow &&
      subscription.pauseStartDate === pauseStartDate &&
      subscription.pauseEndDate === pauseEndDate
    ) {
      return; // Idempotency
    }
    const batch = writeBatch(db);
    const subRef = doc(db, "subscriptions", subscription.id);
    batch.update(subRef, {
      status: shouldPauseNow ? "paused" : "active",
      pauseStartDate,
      pauseEndDate,
    });

    if (shouldPauseNow) {
      const today = getTodayInTimezone();
      const cancelledOrders = await orderService.appendCancelOrdersToBatch(
        batch,
        subscription.id,
        subscription.customerId,
        today,
        ["breakfast", "lunch", "dinner"], // Cancel all eligible meals for today
      );

      await batch.commit();

      if (cancelledOrders.length > 0) {
        import("@/shared/services/firestore/auditRepository")
          .then((m) => {
            cancelledOrders.forEach((o) => {
              m.auditRepository
                .logAction(
                  "meal_cancelled",
                  subscription.customerId,
                  "customer",
                  "Customer",
                  o.id!,
                  "order",
                  {
                    date: today,
                    mealType: o.mealType,
                  },
                )
                .catch(console.error);
            });
          })
          .catch(console.error);
      }
    } else {
      await batch.commit();
    }
  }

  /** Admin override of the customer's own resume action, clearing any schedules. */
  async resumeSubscription(subscription: Subscription): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error("Valid subscription object is required.");
    }
    if (
      subscription.status === "active" &&
      !subscription.pauseStartDate &&
      !subscription.pauseEndDate
    ) {
      return; // Idempotency
    }
    await subscriptionRepository.update(subscription.id, {
      status: "active",
      pauseStartDate: null,
      pauseEndDate: null,
    });

    // When resuming, if today falls within subscription validity, restore today's cancelled orders and generate missing ones
    const today = getTodayInTimezone();
    const isStarted = subscription.startDate <= today;
    const isNotEnded = !subscription.endDate || subscription.endDate >= today;

    if (isStarted && isNotEnded) {
      let eligibleMealTypes = (subscription.mealPreferences || []).map(
        (p) => p.mealType,
      );

      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("@/shared/lib/firebase");
        const skipRef = doc(db, "subscriptions", subscription.id, "skips", today);
        const skipSnap = await getDoc(skipRef);
        if (
          skipSnap &&
          typeof skipSnap.exists === "function" &&
          skipSnap.exists()
        ) {
          const skipData =
            typeof skipSnap.data === "function" ? skipSnap.data() : undefined;
          const skippedMeals = (skipData?.mealTypes || []) as string[];
          eligibleMealTypes = eligibleMealTypes.filter(
            (m) => !skippedMeals.includes(m),
          );
        }
      } catch (skipErr) {
        console.warn(
          `[SubscriptionService] Could not check skips on resume for subscription ${subscription.id}:`,
          skipErr,
        );
      }

      if (eligibleMealTypes.length > 0) {
        try {
          const { orderService } = await import("./orderService");
          await orderService.restoreOrdersForUnskipDay(
            subscription.customerId,
            subscription.id,
            today,
            eligibleMealTypes,
            true, // generateMissing: true
          );
        } catch (restoreErr) {
          console.warn(
            `[SubscriptionService] Order restoration warning on resume for subscription ${subscription.id}:`,
            restoreErr,
          );
        }
      }
    }
  }
}

export const subscriptionService = new SubscriptionService();
