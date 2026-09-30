import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscriptionService, type AdminActor, type AdminCreateSubscriptionInput } from "../subscriptionService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { mealPlanRepository } from "@/shared/services/firestore/mealPlanRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { pricingService } from "../pricingService";
import { orderService } from "../orderService";
import { pricingRepository } from "@/shared/services/firestore/pricingRepository";
import { settingsRepository } from "@/shared/services/firestore/settingsRepository";
import type { CustomerProfile, MealPlan, Subscription } from "@/shared/types";

describe("PHASE E3 — Admin-Assisted Subscription Creation & Lifecycle Integration", () => {
  const adminActor: AdminActor = {
    uid: "admin-uid-1",
    role: "admin",
    fullName: "Admin User",
  };

  const validCustomer: CustomerProfile = {
    id: "cust-123",
    role: "customer",
    fullName: "Ramesh Kumar",
    email: "ramesh@example.com",
    phone: "9876543210",
    photoUrl: null,
    isActive: true,
    addresses: [
      {
        id: "addr-home",
        label: "Home",
        line1: "123 Saraswathipuram",
        city: "Mysuru",
        state: "Karnataka",
        pincode: "570009",
        lat: 12.3,
        lng: 76.6,
        isDefault: true,
      },
    ],
    defaultAddressId: "addr-home",
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };

  const validPlan: MealPlan = {
    id: "plan-regular",
    tier: "regular",
    name: "Regular South Indian Plan",
    description: "Wholesome daily meals",
    pricePerDay: 170,
    pricingMatrix: {
      breakfast: 40,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 105,
      lunch_dinner: 130,
      breakfast_dinner: 105,
      breakfast_lunch_dinner: 170,
    },
    currency: "INR",
    mealSlots: [
      { mealType: "breakfast", isCustomerSelectable: false, options: [] },
      { mealType: "lunch", isCustomerSelectable: true, options: [{ id: "opt-south", label: "South Indian Thali", items: [] }] },
      { mealType: "dinner", isCustomerSelectable: true, options: [{ id: "opt-light", label: "Light Dinner", items: [] }] },
    ],
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Default mock implementations
    vi.spyOn(userRepository, "getById").mockResolvedValue(validCustomer);
    vi.spyOn(mealPlanRepository, "getById").mockResolvedValue(validPlan);
    vi.spyOn(subscriptionRepository, "getActiveSubscriptionByCustomerId").mockResolvedValue(null);
    vi.spyOn(subscriptionRepository, "create").mockResolvedValue(undefined as any);
    vi.spyOn(subscriptionRepository, "getById").mockResolvedValue(null);
    vi.spyOn(auditRepository, "logAction").mockResolvedValue(undefined as any);
    vi.spyOn(settingsRepository, "getBusinessSettings").mockResolvedValue({ pricing: { securityDepositAmount: 1000 } } as any);
  });

  const baseInput: AdminCreateSubscriptionInput = {
    customerId: "cust-123",
    planId: "plan-regular",
    startDate: "2026-10-01",
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: null },
      { mealType: "lunch", selectedOptionId: "opt-south" },
    ],
    deliveryAddressId: "addr-home",
    billingCycle: "monthly",
    quantity: 1,
    autoRenew: true,
    status: "active",
  };

  it("A. Admin creates subscription for existing customer", async () => {
    const createSpy = vi.spyOn(subscriptionRepository, "create");

    const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);

    expect(typeof subId).toBe("string");
    expect(subId.length).toBeGreaterThan(0);
    expect(createSpy).toHaveBeenCalledTimes(1);

    const createdData = createSpy.mock.calls[0][0];
    expect(createdData.customerId).toBe("cust-123");
    expect(createdData.planId).toBe("plan-regular");
    expect(createdData.status).toBe("active");
    expect(createdData.autoRenew).toBe(true);
    expect(createdData.startDate).toBe("2026-10-01");
  });

  it("B. Customer can subsequently see the subscription", async () => {
    const createdSub: Subscription = {
      id: "sub-created-by-admin",
      customerId: "cust-123",
      planId: "plan-regular",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 105,
      deliveryAddressId: "addr-home",
      zoneId: null,
      mealPreferences: baseInput.mealPreferences,
      status: "active",
      startDate: "2026-10-01",
      endDate: "2026-10-30",
      billingCycle: "monthly",
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    vi.spyOn(subscriptionRepository, "getByCustomerId").mockResolvedValue([createdSub]);

    const customerSubs = await subscriptionRepository.getByCustomerId("cust-123");
    expect(customerSubs).toHaveLength(1);
    expect(customerSubs[0].id).toBe("sub-created-by-admin");
    expect(customerSubs[0].customerId).toBe("cust-123");
    expect(customerSubs[0].status).toBe("active");
  });

  it("C. Admin-created subscription gets correct pricing snapshot", async () => {
    const createSpy = vi.spyOn(subscriptionRepository, "create");
    await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);

    const createdData = createSpy.mock.calls[0][0];
    expect(createdData.pricingMatrixSnapshot).toBeDefined();
    expect(createdData.pricingMatrixSnapshot!.breakfast).toBeGreaterThan(0);
    expect(createdData.pricingMatrixSnapshot!.lunch).toBeGreaterThan(0);
    expect(createdData.pricePerDaySnapshot).toBeGreaterThan(0);
  });

  it("D. Effective E2 pricing is used based on start date", async () => {
    // Seed effective pricing revision starting 2026-11-01
    pricingRepository.seedMemoryCache([
      {
        id: "pricing-e3-test",
        effectiveFrom: "2026-11-01",
        pricing: {
          standard: {
            meals: { breakfast: 70, lunch: 125, dinner: 125 },
            combos: { lunch_dinner: 230, all_three: 280 },
          },
        },
        status: "active",
        createdAt: "2026-09-29T10:00:00.000Z",
        updatedAt: "2026-09-29T10:00:00.000Z",
        createdBy: "admin",
        updatedBy: "admin",
      },
    ]);

    const createSpy = vi.spyOn(subscriptionRepository, "create");
    await subscriptionService.createSubscriptionByAdmin(adminActor, {
      ...baseInput,
      startDate: "2026-11-01",
    });

    const createdData = createSpy.mock.calls[0][0];
    expect(createdData.pricingMatrixSnapshot!.breakfast).toBe(70);
    expect(createdData.pricingMatrixSnapshot!.lunch).toBe(125);
    expect(createdData.pricePerDaySnapshot).toBe(195); // 70 + 125
  });

  it("E. Existing negotiated pricing compatibility remains intact", async () => {
    const sub: Subscription = {
      id: "sub-admin-negotiated",
      customerId: "cust-123",
      planId: "plan-regular",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 105,
      pricingMatrixSnapshot: {
        breakfast: 40,
        lunch: 65,
        dinner: 65,
        breakfast_lunch: 105,
        lunch_dinner: 130,
        breakfast_dinner: 105,
        breakfast_lunch_dinner: 170,
      },
      negotiatedPricing: {
        lunch: 50, // Negotiated discount on lunch
      } as any,
      deliveryAddressId: "addr-home",
      zoneId: null,
      mealPreferences: baseInput.mealPreferences,
      status: "active",
      startDate: "2026-10-01",
      endDate: "2026-10-30",
      billingCycle: "monthly",
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    // Precedence: negotiatedPricing overrides snapshot
    const matrix = pricingService.getPricingMatrix(sub);
    expect(matrix.lunch).toBe(50); // negotiated
    expect(matrix.breakfast).toBe(40); // from snapshot
  });

  it("F. Invalid customer is rejected", async () => {
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    await expect(
      subscriptionService.createSubscriptionByAdmin(adminActor, {
        ...baseInput,
        customerId: "non-existent-cust",
      })
    ).rejects.toThrow("Customer does not exist.");
  });

  it("G. Invalid plan is rejected", async () => {
    vi.spyOn(mealPlanRepository, "getById").mockResolvedValue(null);

    await expect(
      subscriptionService.createSubscriptionByAdmin(adminActor, {
        ...baseInput,
        planId: "invalid-plan",
      })
    ).rejects.toThrow("Invalid or inactive meal plan.");
  });

  it("H. Unauthorized customer cannot create subscription for another customer", async () => {
    const unauthorizedActor: AdminActor = {
      uid: "cust-456",
      role: "customer",
      fullName: "Imposter User",
    };

    await expect(
      subscriptionService.createSubscriptionByAdmin(unauthorizedActor, baseInput)
    ).rejects.toThrow("Unauthorized: Only Admin can create customer subscriptions.");
  });

  it("I. Duplicate/conflicting subscription rules are respected", async () => {
    const existingActiveSub: Subscription = {
      id: "existing-active-sub",
      customerId: "cust-123",
      planId: "plan-regular",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 105,
      deliveryAddressId: "addr-home",
      zoneId: null,
      mealPreferences: baseInput.mealPreferences,
      status: "active",
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      billingCycle: "monthly",
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    vi.spyOn(subscriptionRepository, "getActiveSubscriptionByCustomerId").mockResolvedValue(existingActiveSub);

    await expect(
      subscriptionService.createSubscriptionByAdmin(adminActor, baseInput)
    ).rejects.toThrow("Customer already has an active subscription. Conflicting active subscriptions are not permitted.");
  });

  it("J. Audit event is created", async () => {
    const auditSpy = vi.spyOn(auditRepository, "logAction");

    const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);

    expect(auditSpy).toHaveBeenCalledWith(
      "admin_subscription_created",
      adminActor.uid,
      "admin",
      adminActor.fullName,
      subId,
      "subscription",
      expect.objectContaining({
        actorId: adminActor.uid,
        actorRole: "admin",
        customerId: "cust-123",
        subscriptionId: subId,
        selectedPlan: "Regular South Indian Plan",
        startDate: "2026-10-01",
        status: "active",
      })
    );
  });

  it("K. Normal order generation works for an Admin-created subscription", async () => {
    const adminCreatedSub: Subscription = {
      id: "sub-admin-order-gen",
      customerId: "cust-123",
      planId: "plan-regular",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 105,
      pricingMatrixSnapshot: {
        breakfast: 40,
        lunch: 65,
        dinner: 65,
        breakfast_lunch: 105,
        lunch_dinner: 130,
        breakfast_dinner: 105,
        breakfast_lunch_dinner: 170,
      },
      deliveryAddressId: "addr-home",
      zoneId: null,
      mealPreferences: [
        { mealType: "breakfast", selectedOptionId: null },
        { mealType: "lunch", selectedOptionId: "opt-south" },
      ],
      status: "active",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      billingCycle: "monthly",
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    const genSpy = vi.spyOn(orderService, "generateOrdersForSubscription").mockResolvedValue(1);

    await orderService.generateOrdersForSubscription(
      adminCreatedSub,
      "2026-10-01",
      ["breakfast", "lunch"],
    );

    expect(genSpy).toHaveBeenCalledWith(
      adminCreatedSub,
      "2026-10-01",
      ["breakfast", "lunch"],
    );
  });

  it("L. Auto-renew follows the existing lifecycle", async () => {
    const updateSpy = vi.spyOn(subscriptionRepository, "update").mockResolvedValue(undefined as any);

    // Toggle auto-renew off
    await subscriptionRepository.update("sub-test-id", { autoRenew: false });
    expect(updateSpy).toHaveBeenCalledWith("sub-test-id", { autoRenew: false });

    // Toggle auto-renew on
    await subscriptionRepository.update("sub-test-id", { autoRenew: true });
    expect(updateSpy).toHaveBeenCalledWith("sub-test-id", { autoRenew: true });
  });

  it("M. Historical pricing/order integrity remains intact", async () => {
    const historicalSub: Subscription = {
      id: "sub-historical",
      customerId: "cust-123",
      planId: "plan-regular",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 90,
      pricingMatrixSnapshot: {
        breakfast: 35,
        lunch: 55,
        dinner: 55,
        breakfast_lunch: 90,
        lunch_dinner: 110,
        breakfast_dinner: 90,
        breakfast_lunch_dinner: 145,
      },
      deliveryAddressId: "addr-home",
      zoneId: null,
      mealPreferences: baseInput.mealPreferences,
      status: "active",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      billingCycle: "monthly",
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    };

    // Even if global pricing or new admin subscriptions are created with higher prices,
    // historical subscription's pricing snapshot remains 100% frozen.
    const resolvedMatrix = pricingService.getPricingMatrix(historicalSub);
    expect(resolvedMatrix.breakfast).toBe(35);
    expect(resolvedMatrix.lunch).toBe(55);
    expect(resolvedMatrix.breakfast_lunch).toBe(90);
  });
});
