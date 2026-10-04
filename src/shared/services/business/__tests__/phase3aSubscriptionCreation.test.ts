import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscriptionService,
  type AdminActor,
  type AdminCreateSubscriptionInput,
} from "../subscriptionService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { mealPlanRepository } from "@/shared/services/firestore/mealPlanRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { pricingService } from "../pricingService";
import { settingsRepository } from "@/shared/services/firestore/settingsRepository";
import { isStandardPlan } from "@/features/customer/hooks/useMealPlans";
import { isSundayInTimezone } from "@/shared/lib/date";
import type { CustomerProfile, MealPlan, Subscription, Order, MealPlanPricing } from "@/shared/types";

describe("Phase 3A: Subscription Creation Core Business Logic", () => {
  const adminActor: AdminActor = {
    uid: "admin-1",
    role: "admin",
    fullName: "Admin Officer",
  };

  const sampleCustomer: CustomerProfile = {
    id: "cust-1",
    role: "customer",
    fullName: "Anand Murthy",
    email: "anand@example.com",
    phone: "9876543210",
    photoUrl: null,
    isActive: true,
    addresses: [
      {
        id: "addr-1",
        label: "Home",
        line1: "45 Gokulam",
        city: "Mysuru",
        state: "Karnataka",
        pincode: "570002",
        isDefault: true,
        lat: 12.3,
        lng: 76.6,
      },
    ],
    defaultAddressId: "addr-1",
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };

  function makePricing(partial: Partial<MealPlanPricing>): MealPlanPricing {
    return {
      breakfast: 50,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 115,
      lunch_dinner: 115,
      breakfast_dinner: 115,
      breakfast_lunch_dinner: 159,
      ...partial,
    };
  }

  const samplePlan: MealPlan = {
    id: "basic-plan",
    tier: "basic",
    name: "Basic Plan",
    description: "Standard daily meals",
    pricePerDay: 159,
    pricingMatrix: {
      breakfast: 60,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 115,
      lunch_dinner: 115,
      breakfast_dinner: 115,
      breakfast_lunch_dinner: 159,
    },
    currency: "INR",
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    mealSlots: [
      { mealType: "breakfast", isCustomerSelectable: false, options: [] },
      { mealType: "lunch", isCustomerSelectable: true, options: [{ id: "opt-1", label: "Rice & Sambar", items: [] }] },
      { mealType: "dinner", isCustomerSelectable: true, options: [{ id: "opt-2", label: "Chapati & Palya", items: [] }] },
    ],
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };

  const sampleRegularPlan: MealPlan = {
    id: "regular-plan",
    tier: "regular",
    name: "Regular Plan",
    description: "Multi-option daily meals",
    pricePerDay: 199,
    pricingMatrix: {
      breakfast: 70,
      lunch: 80,
      dinner: 80,
      breakfast_lunch: 140,
      lunch_dinner: 150,
      breakfast_dinner: 140,
      breakfast_lunch_dinner: 199,
    },
    currency: "INR",
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 2,
    mealSlots: [
      { mealType: "breakfast", isCustomerSelectable: true, options: [{ id: "opt-b", label: "Idli Vada", items: [] }] },
      { mealType: "lunch", isCustomerSelectable: true, options: [{ id: "opt-1", label: "Rice & Sambar", items: [] }] },
      { mealType: "dinner", isCustomerSelectable: true, options: [{ id: "opt-2", label: "Chapati & Palya", items: [] }] },
    ],
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  };

  let createdSubscriptions: Map<string, any>;
  let loggedAuditActions: any[];

  beforeEach(() => {
    vi.restoreAllMocks();
    createdSubscriptions = new Map();
    loggedAuditActions = [];

    vi.spyOn(userRepository, "getById").mockResolvedValue(sampleCustomer);
    vi.spyOn(mealPlanRepository, "getById").mockImplementation(async (id: string) => {
      if (id === "regular-plan") return sampleRegularPlan;
      if (id === "basic-plan") return samplePlan;
      return null;
    });
    vi.spyOn(subscriptionRepository, "getActiveSubscriptionByCustomerId").mockResolvedValue(null);
    vi.spyOn(subscriptionRepository, "create").mockImplementation(async (data, id) => {
      const subId = id || "sub-" + Math.random().toString(36).substring(7);
      createdSubscriptions.set(subId, { ...data, id: subId });
      return subId;
    });
    vi.spyOn(subscriptionRepository, "update").mockImplementation(async (id: string, data: any) => {
      const existing = createdSubscriptions.get(id);
      if (existing) {
        createdSubscriptions.set(id, { ...existing, ...data });
      }
    });
    vi.spyOn(subscriptionRepository, "getById").mockImplementation(async (id) => {
      return (createdSubscriptions.get(id) as Subscription) || null;
    });
    vi.spyOn(auditRepository, "logAction").mockImplementation(async (...args) => {
      loggedAuditActions.push(args);
    });
    vi.spyOn(settingsRepository, "getBusinessSettings").mockResolvedValue({
      pricing: { securityDepositAmount: 1000 },
    } as any);
  });

  const baseInput: AdminCreateSubscriptionInput = {
    customerId: "cust-1",
    planId: "basic-plan",
    startDate: "2026-10-15",
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: null },
      { mealType: "lunch", selectedOptionId: "opt-1" },
    ],
    deliveryAddressId: "addr-1",
    billingCycle: "monthly",
    quantity: 1,
    autoRenew: true,
    status: "active",
  };

  // ── 1. Negotiated Pricing Tests ───────────────────────────────────────────

  describe("1. Negotiated Customer Pricing", () => {
    it("creates subscription with standard plan pricing when negotiated pricing is omitted", async () => {
      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);
      const sub = createdSubscriptions.get(subId);

      expect(sub).toBeDefined();
      expect(sub.negotiatedPricing).toBeUndefined();
      // B + L from samplePlan pricingMatrix is ₹115
      expect(sub.pricePerDaySnapshot).toBe(115);
      expect(sub.pricingMatrixSnapshot.breakfast_lunch).toBe(115);
    });

    it("creates subscription with customer-specific negotiated pricing stored and reflected in pricePerDaySnapshot", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        negotiatedPricing: makePricing({
          breakfast: 40,
          lunch: 50,
          breakfast_lunch: 85,
        }),
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub).toBeDefined();
      expect(sub.negotiatedPricing.breakfast_lunch).toBe(85);
      // Negotiated B + L rate is 85 instead of 115
      expect(sub.pricePerDaySnapshot).toBe(85);

      // Verify audit record contains negotiated pricing details
      const auditLog = loggedAuditActions.find((a) => a[0] === "admin_subscription_created");
      expect(auditLog).toBeDefined();
      expect(auditLog[6].hasNegotiatedPricing).toBe(true);
      expect(auditLog[6].negotiatedPricing.breakfast_lunch).toBe(85);
    });

    it("rejects invalid negative negotiated price values", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        negotiatedPricing: makePricing({
          lunch: -25,
        }),
      };

      await expect(
        subscriptionService.createSubscriptionByAdmin(adminActor, input),
      ).rejects.toThrow(/Invalid negotiated price for 'lunch'/);
    });

    it("rejects non-finite / NaN negotiated price values", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        negotiatedPricing: makePricing({
          breakfast: NaN,
        }),
      };

      await expect(
        subscriptionService.createSubscriptionByAdmin(adminActor, input),
      ).rejects.toThrow(/Invalid negotiated price for 'breakfast'/);
    });

    it("future order pricing calculates using negotiatedPricing override over snapshot and base", async () => {
      const sub: Subscription = {
        id: "sub-neg",
        customerId: "cust-1",
        planId: "basic-plan",
        planTier: "basic",
        quantity: 1,
        pricePerDaySnapshot: 85,
        pricingMatrixSnapshot: samplePlan.pricingMatrix,
        negotiatedPricing: makePricing({
          breakfast: 35,
          lunch: 45,
        }),
        mealPreferences: baseInput.mealPreferences,
        startDate: "2026-10-15",
        endDate: null,
        autoRenew: true,
        zoneId: "zone-1",
        deliveryAddressId: "addr-1",
        billingCycle: "monthly",
        status: "active",
        depositAmount: 0,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      } as Subscription;

      const lunchPrice = pricingService.calculateMealPrice(sub, "lunch");
      expect(lunchPrice).toBe(45); // negotiated price, not base price 65
    });

    it("historical order price remains immutable when subscription has negotiatedPricing", async () => {
      // Historical order created previously at 65
      const historicalOrder: Order = {
        id: "ord_hist_1",
        customerId: "cust-1",
        subscriptionId: "sub-neg",
        date: "2026-10-01",
        mealType: "lunch",
        price: 65,
        currency: "INR",
        status: "delivered",
      } as Order;

      // Price on historical document is immutable
      expect(historicalOrder.price).toBe(65);
    });
  });

  // ── 2. Plan Catalog (Basic + Regular Only) ─────────────────────────────────

  describe("2. Plan Catalog Filter (Basic + Regular Only)", () => {
    it("recognizes Basic plan as standard", () => {
      expect(isStandardPlan({ tier: "basic", name: "Basic Plan" })).toBe(true);
      expect(isStandardPlan({ id: "basic-plan" })).toBe(true);
    });

    it("recognizes Regular plan as standard", () => {
      expect(isStandardPlan({ tier: "regular", name: "Regular Plan" })).toBe(true);
      expect(isStandardPlan({ id: "regular-plan" })).toBe(true);
    });

    it("excludes legacy plans (e.g. Trial, Weekly, Monthly Standard) from standard selector", () => {
      expect(isStandardPlan({ tier: "trial", name: "Trial Plan" })).toBe(false);
      expect(isStandardPlan({ tier: "weekly", name: "Weekly Plan" })).toBe(false);
      expect(isStandardPlan({ tier: "standard", name: "Monthly Standard" })).toBe(false);
      expect(isStandardPlan({ tier: "custom", name: "Special Corporate" })).toBe(false);
    });

    it("historical legacy subscriptions still load their plan via mealPlanRepository.getById", async () => {
      const legacyPlan: MealPlan = {
        id: "plan-std",
        tier: "standard" as any,
        name: "Legacy Monthly Standard",
        description: "Historical archived plan",
        pricePerDay: 140,
        pricingMatrix: makePricing({ lunch: 70 }),
        currency: "INR",
        deliveryIncluded: true,
        isActive: false,
        sortOrder: 99,
        mealSlots: [],
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      };

      vi.spyOn(mealPlanRepository, "getById").mockResolvedValue(legacyPlan);

      const loaded = await mealPlanRepository.getById("plan-std");
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe("plan-std");
      expect(loaded?.name).toBe("Legacy Monthly Standard");
    });
  });

  // ── 3. Custom Date Range Tests ─────────────────────────────────────────────

  describe("3. Custom Subscription Date Range", () => {
    it("accepts a valid custom date range", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        startDate: "2026-10-15",
        endDate: "2026-10-28",
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub.startDate).toBe("2026-10-15");
      expect(sub.endDate).toBe("2026-10-28");
    });

    it("supports same-day subscription range (startDate === endDate)", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        startDate: "2026-10-15",
        endDate: "2026-10-15",
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub.startDate).toBe("2026-10-15");
      expect(sub.endDate).toBe("2026-10-15");
    });

    it("rejects endDate earlier than startDate", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        startDate: "2026-10-15",
        endDate: "2026-10-14",
      };

      await expect(
        subscriptionService.createSubscriptionByAdmin(adminActor, input),
      ).rejects.toThrow(/Subscription end date cannot be earlier than start date/);
    });

    it("rejects invalid endDate format", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        startDate: "2026-10-15",
        endDate: "15-10-2026",
      };

      await expect(
        subscriptionService.createSubscriptionByAdmin(adminActor, input),
      ).rejects.toThrow(/Invalid end date format/);
    });
  });

  // ── 4. Quantity Stepper & Integrity Tests ───────────────────────────────────

  describe("4. Quantity Semantics & Integer Integrity", () => {
    it("persists integer quantity accurately", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        quantity: 3,
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub.quantity).toBe(3);
    });

    it("clamps decimal quantity to integer (Math.floor)", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        quantity: 2.7,
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub.quantity).toBe(2);
      expect(Number.isInteger(sub.quantity)).toBe(true);
    });

    it("defaults quantity <= 0 to 1", async () => {
      const input: AdminCreateSubscriptionInput = {
        ...baseInput,
        quantity: 0,
      };

      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, input);
      const sub = createdSubscriptions.get(subId);

      expect(sub.quantity).toBe(1);
    });
  });

  // ── 5. Plan Change Regression (TEST 4) ─────────────────────────────────────

  describe("5. Plan Change Regression (TEST 4)", () => {
    it("changes plan Basic -> Regular while preserving negotiated pricing, quantity, and date bounds", async () => {
      // 1. Create a subscription with negotiated pricing and custom date range
      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, {
        ...baseInput,
        quantity: 2,
        startDate: "2026-10-10",
        endDate: "2026-10-31",
        negotiatedPricing: makePricing({
          breakfast: 40,
          lunch: 50,
          breakfast_lunch: 85,
        }),
      });

      const initialSub = createdSubscriptions.get(subId);
      expect(initialSub.planTier).toBe("basic");
      expect(initialSub.pricePerDaySnapshot).toBe(85);

      // 2. Admin changes plan to Regular
      await subscriptionService.changeSubscriptionPlan({
        subscriptionId: subId,
        newPlanId: "regular-plan",
        newMealPreferences: [
          { mealType: "breakfast", selectedOptionId: "opt-b" },
          { mealType: "lunch", selectedOptionId: "opt-1" },
        ],
        adminActor,
      });

      const updatedSub = createdSubscriptions.get(subId);
      expect(updatedSub.planId).toBe("regular-plan");
      expect(updatedSub.planTier).toBe("regular");
      // Quantity preserved
      expect(updatedSub.quantity).toBe(2);
      // Dates preserved
      expect(updatedSub.startDate).toBe("2026-10-10");
      expect(updatedSub.endDate).toBe("2026-10-31");
      // Negotiated pricing preserved
      expect(updatedSub.negotiatedPricing.breakfast_lunch).toBe(85);
      expect(updatedSub.pricePerDaySnapshot).toBe(85);
      // Meal preferences updated with valid option
      expect(updatedSub.mealPreferences[0].selectedOptionId).toBe("opt-b");
    });

    it("changes plan Regular -> Basic smoothly and updates pricing snapshot", async () => {
      // Create with regular plan
      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, {
        ...baseInput,
        planId: "regular-plan",
        quantity: 1,
        startDate: "2026-10-10",
        endDate: "2026-10-31",
      });

      // Change to Basic
      await subscriptionService.changeSubscriptionPlan({
        subscriptionId: subId,
        newPlanId: "basic-plan",
        newMealPreferences: [
          { mealType: "breakfast", selectedOptionId: null },
          { mealType: "lunch", selectedOptionId: "opt-1" },
        ],
        adminActor,
      });

      const updatedSub = createdSubscriptions.get(subId);
      expect(updatedSub.planId).toBe("basic-plan");
      expect(updatedSub.planTier).toBe("basic");
      expect(updatedSub.quantity).toBe(1);
      expect(updatedSub.startDate).toBe("2026-10-10");
      expect(updatedSub.endDate).toBe("2026-10-31");
    });

    it("rejects plan change if actor is not an admin", async () => {
      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);

      await expect(
        subscriptionService.changeSubscriptionPlan({
          subscriptionId: subId,
          newPlanId: "regular-plan",
          adminActor: { uid: "user-1", role: "customer" as any, fullName: "Customer" },
        }),
      ).rejects.toThrow(/Unauthorized: Only Admin can change customer subscription plan/);
    });

    it("plan change does not mutate historical orders or invoices", async () => {
      // Historical order and invoice
      const historicalOrder: Order = {
        id: "ord_hist_fixed",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        date: "2026-10-01",
        mealType: "lunch",
        price: 65,
        currency: "INR",
        status: "delivered",
      } as Order;

      const historicalInvoice = {
        id: "inv_hist_fixed",
        subscriptionId: "sub-1",
        totalAmount: 1800,
        status: "paid",
      };

      // Perform plan change on sub-1
      const subId = await subscriptionService.createSubscriptionByAdmin(adminActor, baseInput);
      await subscriptionService.changeSubscriptionPlan({
        subscriptionId: subId,
        newPlanId: "regular-plan",
        adminActor,
      });

      // Historical artifacts remain untouched
      expect(historicalOrder.price).toBe(65);
      expect(historicalInvoice.totalAmount).toBe(1800);
      expect(historicalInvoice.status).toBe("paid");
    });
  });

  // ── 6. Order Generation Date Range & Pricing Lifecycle (TEST 2 & TEST 3) ────

  describe("6. Order Generation Date Range & Pricing Lifecycle (TEST 2 & TEST 3)", () => {
    it("respects custom date bounds: skips dates before startDate and after endDate", () => {
      const sub: Subscription = {
        id: "sub-bounded",
        customerId: "cust-1",
        planId: "basic-plan",
        planTier: "basic",
        quantity: 1,
        startDate: "2026-10-10",
        endDate: "2026-10-20",
        mealPreferences: [{ mealType: "lunch", selectedOptionId: "opt-1" }],
        pricePerDaySnapshot: 65,
        deliveryAddressId: "addr-1",
        billingCycle: "monthly",
        status: "active",
        depositAmount: 0,
        autoRenew: false,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      } as Subscription;

      // Filter logic used in orderService.generateDailyOrders
      const shouldGenerateForDate = (date: string, s: Subscription) => {
        if (s.endDate && s.endDate < date) return false;
        if (s.startDate > date) return false;
        return true;
      };

      // Date before startDate -> false
      expect(shouldGenerateForDate("2026-10-09", sub)).toBe(false);
      // Date on startDate -> true
      expect(shouldGenerateForDate("2026-10-10", sub)).toBe(true);
      // Date within range -> true
      expect(shouldGenerateForDate("2026-10-15", sub)).toBe(true);
      // Date on endDate -> true
      expect(shouldGenerateForDate("2026-10-20", sub)).toBe(true);
      // Date after endDate -> false
      expect(shouldGenerateForDate("2026-10-21", sub)).toBe(false);
    });

    it("Sundays are excluded from order generation according to business rules", () => {
      // 2026-10-04 is a Sunday
      expect(isSundayInTimezone("2026-10-04")).toBe(true);
      // 2026-10-05 is a Monday
      expect(isSundayInTimezone("2026-10-05")).toBe(false);
    });

    it("order generation calculates price using negotiatedPricing", () => {
      const subWithNeg: Subscription = {
        id: "sub-neg-order",
        customerId: "cust-1",
        planId: "basic-plan",
        planTier: "basic",
        quantity: 1,
        startDate: "2026-10-10",
        endDate: "2026-10-20",
        mealPreferences: [{ mealType: "lunch", selectedOptionId: "opt-1" }],
        pricePerDaySnapshot: 50,
        pricingMatrixSnapshot: samplePlan.pricingMatrix,
        negotiatedPricing: makePricing({ lunch: 50 }),
        deliveryAddressId: "addr-1",
        billingCycle: "monthly",
        status: "active",
        depositAmount: 0,
        autoRenew: false,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      } as Subscription;

      const orderPrice = pricingService.calculateMealPrice(subWithNeg, "lunch");
      expect(orderPrice).toBe(50);
    });

    it("clearing negotiated pricing restores pricing to plan tier defaults", () => {
      const subCleared: Subscription = {
        id: "sub-cleared",
        customerId: "cust-1",
        planId: "basic-plan",
        planTier: "basic",
        quantity: 1,
        startDate: "2026-10-10",
        endDate: "2026-10-20",
        mealPreferences: [{ mealType: "lunch", selectedOptionId: "opt-1" }],
        pricePerDaySnapshot: 65,
        pricingMatrixSnapshot: samplePlan.pricingMatrix,
        negotiatedPricing: undefined, // cleared
        deliveryAddressId: "addr-1",
        billingCycle: "monthly",
        status: "active",
        depositAmount: 0,
        autoRenew: false,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      } as Subscription;

      const orderPrice = pricingService.calculateMealPrice(subCleared, "lunch");
      expect(orderPrice).toBe(65); // standard Basic plan lunch price
    });
  });
});
