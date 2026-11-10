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
  name?: string;
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
  negotiatedPricing?: MealPlanPricing | null;
}

export interface AdminChangeSubscriptionPlanInput {
  subscriptionId: string;
  newPlanId: string;
  newMealPreferences?: MealPreference[];
  adminActor: AdminActor;
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
      negotiatedPricing?: MealPlanPricing | null;
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

    // Validate negotiatedPricing if supplied
    let sanitizedNegotiated: MealPlanPricing | undefined = undefined;
    if (options?.negotiatedPricing && Object.keys(options.negotiatedPricing).length > 0) {
      if (!options.adminActor || options.adminActor.role !== "admin") {
        throw new Error(
          "Unauthorized: Only Admin can configure customer-specific negotiated pricing.",
        );
      }
      sanitizedNegotiated = {} as MealPlanPricing;
      for (const [key, val] of Object.entries(options.negotiatedPricing)) {
        if (val !== undefined && val !== null) {
          if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
            throw new Error(
              `Invalid negotiated price for '${key}'. Must be a finite, non-negative number.`,
            );
          }
          (sanitizedNegotiated as any)[key] = val;
        }
      }
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

    const subscriptionPayload: any = {
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
      deliveryPartnerId: null,
      latestPaymentId: null,
      depositAmount,
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    };

    if (sanitizedNegotiated && Object.keys(sanitizedNegotiated).length > 0) {
      subscriptionPayload.negotiatedPricing = sanitizedNegotiated;
    }

    await subscriptionRepository.create(
      subscriptionPayload,
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
    const quantity = Math.floor(input.quantity && input.quantity > 0 ? input.quantity : 1);
    const pricingSnapshot =
      input.pricingMatrixSnapshot ||
      (await pricingService.getEffectivePricing(input.startDate, plan.tier));

    // Validate negotiatedPricing if supplied
    let sanitizedNegotiated: MealPlanPricing | undefined = undefined;
    if (input.negotiatedPricing && Object.keys(input.negotiatedPricing).length > 0) {
      sanitizedNegotiated = {} as MealPlanPricing;
      for (const [key, val] of Object.entries(input.negotiatedPricing)) {
        if (val !== undefined && val !== null) {
          if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
            throw new Error(
              `Invalid negotiated price for '${key}'. Must be a finite, non-negative number.`,
            );
          }
          (sanitizedNegotiated as any)[key] = val;
        }
      }
    }

    const pricePerDay =
      input.pricePerDaySnapshot !== undefined
        ? input.pricePerDaySnapshot
        : await pricingService.calculateSubscriptionPrice(
            input.mealPreferences,
            input.startDate,
            plan.tier,
            sanitizedNegotiated,
          );

    // 9. Calculate or validate custom end date
    const billingCycle = input.billingCycle || "monthly";
    let endDate: string | null = null;
    if (input.endDate !== undefined && input.endDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
        throw new Error("Invalid end date format. Expected YYYY-MM-DD.");
      }
      if (input.endDate < input.startDate) {
        throw new Error("Subscription end date cannot be earlier than start date.");
      }
      endDate = input.endDate;
    } else {
      endDate = calculateSubscriptionEndDate(input.startDate, billingCycle);
    }

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
      {
        status: initialStatus,
        adminActor,
        negotiatedPricing: sanitizedNegotiated,
      },
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
          endDate,
          quantity,
          pricePerDay,
          hasNegotiatedPricing: !!(sanitizedNegotiated && Object.keys(sanitizedNegotiated).length > 0),
          negotiatedPricing: sanitizedNegotiated || null,
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
   * Admin-assisted customer subscription plan change.
   * Updates plan tier, recalculates pricing snapshot, validates against new plan's slots,
   * preserves existing negotiated pricing if configured, preserves lifecycle state, and logs audit record.
   */
  async changeSubscriptionPlan(
    input: AdminChangeSubscriptionPlanInput,
  ): Promise<void> {
    const { subscriptionId, newPlanId, newMealPreferences, adminActor } = input;

    // 1. Authorization: Only admin can change customer plans
    if (!adminActor || adminActor.role !== "admin") {
      throw new Error(
        "Unauthorized: Only Admin can change customer subscription plan.",
      );
    }

    // 2. Validate subscription exists
    if (!subscriptionId) {
      throw new Error("Subscription ID is required.");
    }
    const subscription = await subscriptionRepository.getById(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found.");
    }

    // 3. Lifecycle checks: cannot change cancelled or expired subscription
    if (
      subscription.status === "cancelled" ||
      subscription.status === "expired"
    ) {
      throw new Error(
        `Cannot change plan on ${subscription.status} subscription.`,
      );
    }

    // 4. Validate new plan exists and is active
    if (!newPlanId) {
      throw new Error("New Plan ID is required.");
    }
    const { mealPlanRepository } = await import(
      "../firestore/mealPlanRepository"
    );
    const newPlan = await mealPlanRepository.getById(newPlanId);
    if (!newPlan || !newPlan.isActive) {
      throw new Error("Invalid or inactive meal plan.");
    }

    // 5. Determine meal preferences
    const mealPreferences =
      newMealPreferences && newMealPreferences.length > 0
        ? newMealPreferences
        : subscription.mealPreferences || [];

    if (mealPreferences.length === 0) {
      throw new Error("At least one meal preference is required.");
    }

    // Validate meal preferences against new plan's slots
    if (newPlan.mealSlots && newPlan.mealSlots.length > 0) {
      const planSlotTypes = new Set(newPlan.mealSlots.map((s) => s.mealType));
      for (const pref of mealPreferences) {
        if (!planSlotTypes.has(pref.mealType)) {
          throw new Error(
            `Meal type '${pref.mealType}' is not offered by plan '${newPlan.name}'.`,
          );
        }
      }
    }

    const todayIST = getTodayIST();

    // 6. Pricing resolution
    // New base pricing matrix snapshot for the new plan tier
    const newPricingMatrix = await pricingService.getEffectivePricing(
      todayIST,
      newPlan.tier,
    );

    // Calculate price per day snapshot for the new plan
    let newPricePerDay: number;
    if (
      subscription.negotiatedPricing &&
      Object.keys(subscription.negotiatedPricing).length > 0
    ) {
      // If customer has negotiated pricing override, calculate with negotiated pricing
      const meals = mealPreferences.map((m) => m.mealType);
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
      const flatNegotiated = subscription.negotiatedPricing as any;
      if (key && flatNegotiated[key] !== undefined) {
        newPricePerDay = flatNegotiated[key];
      } else {
        newPricePerDay = await pricingService.calculateSubscriptionPrice(
          mealPreferences,
          todayIST,
          newPlan.tier,
        );
      }
    } else {
      newPricePerDay = await pricingService.calculateSubscriptionPrice(
        mealPreferences,
        todayIST,
        newPlan.tier,
      );
    }

    const previousPlanId = subscription.planId;
    const previousPlanTier = subscription.planTier;
    const previousPricePerDay = subscription.pricePerDaySnapshot;

    // 7. Update subscription record in Firestore
    await subscriptionRepository.update(subscription.id, {
      planId: newPlan.id,
      planTier: newPlan.tier,
      mealPreferences,
      pricingMatrixSnapshot: newPricingMatrix,
      pricePerDaySnapshot: newPricePerDay,
      updatedAt: serverTimestamp() as unknown as Timestamp,
    });

    // 8. Audit Logging
    try {
      const { auditRepository } = await import(
        "../firestore/auditRepository"
      );
      await auditRepository.logAction(
        "admin_subscription_plan_changed",
        adminActor.uid,
        adminActor.role || "admin",
        adminActor.fullName || "Admin",
        subscription.id,
        "subscription",
        {
          customerId: subscription.customerId,
          subscriptionId: subscription.id,
          previousPlanId,
          previousPlanTier,
          previousPricePerDay,
          newPlanId: newPlan.id,
          newPlanName: newPlan.name,
          newPlanTier: newPlan.tier,
          newPricePerDay,
          action: "admin_subscription_plan_changed",
        },
      );
    } catch (auditErr) {
      console.error(
        "[SubscriptionService] Failed to record audit log for plan change:",
        auditErr,
      );
    }
  }

  /**
   * Activates a subscription without payment (Option B).
   * Atomically commits subscription status -> 'active' and an immutable audit log.
   */
  async activateSubscriptionUnpaid(
    adminActor: AdminActor,
    subscription: Subscription,
    confirmation: { confirmedUnpaid: boolean },
    reason?: string,
  ): Promise<void> {
    if (!adminActor || adminActor.role !== "admin") {
      throw new Error("Unauthorized: Only Admin can perform unpaid subscription activation.");
    }
    if (!confirmation || confirmation.confirmedUnpaid !== true) {
      throw new Error("Unpaid activation requires explicit confirmation: confirmedUnpaid must be true.");
    }
    if (subscription.status === "active") {
      return; // Idempotency
    }
    if (subscription.status !== "draft" && subscription.status !== "pending_payment") {
      throw new Error(`Cannot activate subscription with status '${subscription.status}'. Only draft or pending_payment subscriptions can be activated.`);
    }

    const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
    const { db } = await import("@/shared/lib/firebase");
    const batch = writeBatch(db);
    const subRef = doc(db, "subscriptions", subscription.id);
    const auditId = `unpaid_act_${subscription.id}_${subscription.startDate}`;
    const auditRef = doc(db, "auditLogs", auditId);

    batch.update(subRef, {
      status: "active",
      updatedAt: serverTimestamp(),
    });

    batch.set(auditRef, {
      action: "admin_subscription_unpaid_activation",
      entityType: "subscription",
      entityId: subscription.id,
      performedBy: adminActor.uid,
      performedByRole: "admin",
      performedByName: adminActor.fullName || adminActor.name || "Admin",
      details: {
        customerId: subscription.customerId,
        unpaidConfirmed: true,
        activationMode: "unpaid_manual_override",
        previousStatus: subscription.status,
      },
      previousValue: { status: subscription.status },
      newValue: { status: "active" },
      reason: reason || "Unpaid administrative activation override",
      timestamp: serverTimestamp(),
      ipAddress: null,
    });

    await batch.commit();

    if (subscription.pauseStartDate || subscription.pauseEndDate) {
      await subscriptionRepository.update(subscription.id, {
        pauseStartDate: null,
        pauseEndDate: null,
      });
    }

    // Immediately generate initial orders for start date (or today if already started)
    try {
      const { orderService } = await import("./orderService");
      const today = getTodayInTimezone();
      const targetDate = subscription.startDate <= today ? today : subscription.startDate;
      const mealTypes = (subscription.mealPreferences || []).map((p) => p.mealType);
      console.log(`[SubscriptionService] Subscription ${subscription.id} activated (unpaid). Generating initial orders for ${targetDate}...`);
      await orderService.generateOrdersForSubscription(subscription, targetDate, mealTypes);
    } catch (err) {
      console.error(`[SubscriptionService] Failed to generate initial orders for subscription ${subscription.id}:`, err);
    }

    try {
      const { notifySubscriptionApproved } = await import("../firestore/notificationService");
      await notifySubscriptionApproved(
        subscription.customerId,
        subscription.id,
        subscription.planTier,
        subscription.startDate,
      );
    } catch (err) {
      console.warn("[SubscriptionService] Failed to send approval notification:", err);
    }
  }

  /**
   * Activates a subscription with verified payment (Option A).
   * Verifies the specific payment document matches customer & subscription, and verifies it atomically.
   */
  async activateSubscriptionPaid(
    adminActor: AdminActor,
    subscription: Subscription,
    paymentId: string,
    notes?: string,
  ): Promise<void> {
    if (!adminActor || adminActor.role !== "admin") {
      throw new Error("Unauthorized: Only Admin can approve subscription payment.");
    }
    if (!paymentId) {
      throw new Error("Payment ID is required for paid subscription activation.");
    }
    if (subscription.status === "active") {
      return; // Idempotency
    }
    if (subscription.status !== "draft" && subscription.status !== "pending_payment") {
      throw new Error(`Cannot activate subscription with status '${subscription.status}'. Only draft or pending_payment subscriptions can be activated.`);
    }

    const { doc, getDoc, updateDoc, serverTimestamp } = await import("firebase/firestore");
    const { db } = await import("@/shared/lib/firebase");
    const pSnap = await getDoc(doc(db, "payments", paymentId));
    if (!pSnap || typeof pSnap.exists !== "function" || !pSnap.exists()) {
      throw new Error(`Payment ${paymentId} not found.`);
    }

    const payment = pSnap.data();
    if (
      !payment.customerId ||
      payment.customerId !== subscription.customerId ||
      !payment.subscriptionId ||
      payment.subscriptionId !== subscription.id
    ) {
      throw new Error("Payment does not match subscription or customer.");
    }

    if (payment.status === "verified") {
      if (payment.purpose !== "security_deposit") {
        throw new Error(
          `Cannot activate subscription with payment purpose '${payment.purpose}'. Purpose must be 'security_deposit'.`,
        );
      }
      if (payment.amount !== subscription.depositAmount) {
        throw new Error(
          `Payment amount (₹${payment.amount}) does not match required subscription deposit (₹${subscription.depositAmount}).`,
        );
      }

      await updateDoc(doc(db, "subscriptions", subscription.id), {
        status: "active",
        latestPaymentId: paymentId,
        updatedAt: serverTimestamp(),
      });

      if (subscription.pauseStartDate || subscription.pauseEndDate) {
        await subscriptionRepository.update(subscription.id, {
          pauseStartDate: null,
          pauseEndDate: null,
        });
      }

      const { orderService } = await import("./orderService");
      const { getTodayInTimezone } = await import("@/shared/lib/date");
      const today = getTodayInTimezone();
      const targetDate = subscription.startDate <= today ? today : subscription.startDate;
      const mealTypes = (subscription.mealPreferences || []).map((p) => p.mealType);
      try {
        await orderService.generateOrdersForSubscription(subscription, targetDate, mealTypes);
      } catch (err) {
        console.error(`[SubscriptionService] Failed to generate initial orders for subscription ${subscription.id}:`, err);
      }

      try {
        const { notifySubscriptionApproved } = await import("../firestore/notificationService");
        await notifySubscriptionApproved(
          subscription.customerId,
          subscription.id,
          subscription.planTier,
          subscription.startDate,
        );
      } catch (err) {
        console.warn("[SubscriptionService] Failed to send approval notification:", err);
      }
      return;
    } else if (payment.status === "pending") {
      if (subscription.status !== "pending_payment") {
        throw new Error(
          `Cannot approve pending payment for subscription with status '${subscription.status}'. Subscription must be pending_payment.`,
        );
      }
      if (payment.purpose !== "security_deposit") {
        throw new Error(
          `Cannot activate subscription with payment purpose '${payment.purpose}'. Purpose must be 'security_deposit'.`,
        );
      }

      const { paymentService } = await import("./paymentService");
      await paymentService.approvePayment(paymentId, adminActor.uid, notes);

      const updatedSubSnap = await getDoc(doc(db, "subscriptions", subscription.id));
      const updatedSub = updatedSubSnap.data();
      if (!updatedSub || updatedSub.status !== "active") {
        throw new Error(
          `Subscription ${subscription.id} failed to transition to active after payment approval.`,
        );
      }

      try {
        const { notifySubscriptionApproved } = await import("../firestore/notificationService");
        await notifySubscriptionApproved(
          subscription.customerId,
          subscription.id,
          subscription.planTier,
          subscription.startDate,
        );
      } catch (err) {
        console.warn("[SubscriptionService] Failed to send approval notification:", err);
      }
    } else {
      throw new Error(
        `Cannot activate subscription with payment status '${payment.status}'. Payment must be verified or pending.`,
      );
    }
  }

  async approveSubscription(
    subscription: Subscription,
    options?: {
      adminActor?: AdminActor;
      paymentId?: string;
      confirmation?: { confirmedUnpaid: boolean };
      reason?: string;
    },
  ): Promise<void> {
    if (!subscription || !subscription.id) {
      throw new Error("Valid subscription object is required.");
    }
    if (subscription.status === "active") {
      return; // Idempotency: Already active
    }
    if (subscription.status === "cancelled" || subscription.status === "expired") {
      throw new Error(`Cannot approve a ${subscription.status} subscription — use renew instead.`);
    }

    const { getAuth } = await import("firebase/auth");
    const currentAuth = getAuth().currentUser;
    const adminActor: AdminActor = options?.adminActor || {
      uid: currentAuth?.uid || "admin",
      role: "admin",
      fullName: currentAuth?.displayName || "Admin",
      name: currentAuth?.displayName || "Admin",
    };

    if (options?.paymentId) {
      await this.activateSubscriptionPaid(adminActor, subscription, options.paymentId, options?.reason);
      return;
    }

    if (options?.confirmation?.confirmedUnpaid) {
      await this.activateSubscriptionUnpaid(adminActor, subscription, options.confirmation, options?.reason);
      return;
    }

    // Check if there is a matching pending payment for this subscription & customer
    const { paymentRepository } = await import("../firestore/paymentRepository");
    const { payments } = await paymentRepository.getPaymentsPaginated({ status: "pending" }, 100);
    const matchingPayment = payments.find(
      (p) => p.subscriptionId === subscription.id && p.customerId === subscription.customerId,
    );

    if (matchingPayment) {
      await this.activateSubscriptionPaid(adminActor, subscription, matchingPayment.id, options?.reason);
      return;
    }

    // Fail closed: neither valid payment nor unpaid confirmation provided
    throw new Error("Subscription activation requires payment verification or explicit unpaid activation confirmation.");
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
    actor?: { uid: string; role: string; fullName?: string } | AdminActor,
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
      const { getModifiableMeals } = await import("@/shared/utils/dateUtils");
      const modifiableMealsForToday = getModifiableMeals(
        today,
        subscription.mealPreferences?.map((p) => p.mealType) || ["breakfast", "lunch", "dinner"]
      );

      const cancelledOrders = await orderService.appendCancelOrdersToBatch(
        batch,
        subscription.id,
        subscription.customerId,
        today,
        modifiableMealsForToday,
      );

      await batch.commit();

      if (cancelledOrders.length > 0) {
        const actorUid = actor?.uid || subscription.customerId;
        const actorRole = actor?.role || "customer";
        const actorName =
          actor?.fullName ||
          (actorRole === "admin" ? "Admin" : "Customer");

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
                    date: today,
                    mealType: o.mealType,
                    source: actorRole === "admin" ? "admin_pause" : "customer_pause",
                  },
                )
                .catch(console.error);
            });
          })
          .catch(console.error);

        // Adjust any issued/open invoice for paused orders
        try {
          const { billingService } = await import("./billingService");
          await billingService.adjustInvoiceForCancelledOrders(cancelledOrders, subscription, actorUid);
        } catch (invErr) {
          console.warn("[subscriptionService] Failed to adjust invoice for paused orders:", invErr);
        }
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
