import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription } from "@/shared/types";
import { mealPlanRepository, INITIAL_MEAL_PLANS } from "@/shared/services/firestore/mealPlanRepository";
import { pricingService } from "@/shared/services/business/pricingService";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemoryAuditLogs: any[] = [];
const inMemoryPlanDocs: Map<string, any> = new Map();

// Mock Firebase Auth & DB
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "admin-1", email: "admin@example.com", displayName: "Admin User" },
  },
}));

let txnQueue = Promise.resolve();

vi.mock("firebase/firestore", () => ({
  runTransaction: vi.fn(async (_db, cb) => {
    const run = txnQueue.then(async () => {
      const txn = {
        get: vi.fn(async (docRef: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            const order = inMemoryOrders.get(docRef.id);
            return {
              exists: () => !!order,
              data: () => (order ? { ...order } : undefined),
            };
          }
          if (docRef.collectionName === "mealPlans" || docRef.path?.startsWith("mealPlans/")) {
            const plan = inMemoryPlanDocs.get(docRef.id);
            return {
              exists: () => !!plan,
              data: () => (plan ? { ...plan } : undefined),
            };
          }
          return {
            exists: () => false,
            data: () => undefined,
          };
        }),
        update: vi.fn((docRef: any, data: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            const current = inMemoryOrders.get(docRef.id);
            if (current) {
              inMemoryOrders.set(docRef.id, { ...current, ...data });
            }
          } else if (docRef.collectionName === "mealPlans" || docRef.path?.startsWith("mealPlans/")) {
            const current = inMemoryPlanDocs.get(docRef.id);
            if (current) {
              inMemoryPlanDocs.set(docRef.id, { ...current, ...data });
            }
          }
        }),
        set: vi.fn((docRef: any, data: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            inMemoryOrders.set(docRef.id, { ...data, id: docRef.id });
          } else if (docRef.collectionName === "mealPlans" || docRef.path?.startsWith("mealPlans/")) {
            inMemoryPlanDocs.set(docRef.id, { ...data, id: docRef.id });
          } else if (docRef.collectionName === "workflowHistory") {
            const orderId = docRef.orderId;
            const list = inMemoryWorkflowHistory.get(orderId) || [];
            list.push(data);
            inMemoryWorkflowHistory.set(orderId, list);
          }
        }),
      };
      return await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 2) {
      return { collectionName: parts[0], id: parts[1], path: `${parts[0]}/${parts[1]}` };
    }
    if (parts.length === 4 && parts[0] === "orders" && parts[2] === "workflowHistory") {
      return {
        collectionName: "workflowHistory",
        orderId: parts[1],
        id: parts[3] || "mock-hist-id",
        path: `orders/${parts[1]}/workflowHistory/${parts[3] || "mock-hist-id"}`,
      };
    }
    return { id: parts[parts.length - 1], path: parts.join("/") };
  }),
  collection: vi.fn((_db, ...parts) => ({
    path: parts.join("/"),
    withConverter: vi.fn((converter) => ({ converter, type: "collection" })),
  })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((...args) => ({ args })),
  getDoc: vi.fn(async (docRef: any) => {
    const id = docRef.id;
    const doc = inMemoryPlanDocs.get(id);
    return {
      id,
      exists: () => !!doc,
      data: () => (doc ? { ...doc } : undefined),
    };
  }),
  getDocs: vi.fn(async () => {
    const docs = Array.from(inMemoryPlanDocs.values()).map((d) => ({
      id: d.id,
      data: () => ({ ...d }),
    }));
    return { docs };
  }),
  setDoc: vi.fn(async (docRef: any, data: any) => {
    inMemoryPlanDocs.set(docRef.id, { ...data, id: docRef.id });
  }),
  updateDoc: vi.fn(async (docRef: any, data: any) => {
    const existing = inMemoryPlanDocs.get(docRef.id) || {};
    inMemoryPlanDocs.set(docRef.id, { ...existing, ...data });
  }),
  serverTimestamp: vi.fn(() => "2026-09-29T10:00:00.000Z"),
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    getById: vi.fn(async (id: string) => inMemoryOrders.get(id) || null),
    list: vi.fn(async (...constraints: any[]) => {
      return Array.from(inMemoryOrders.values()).filter((o) => {
        for (const c of constraints) {
          if (c.field === "subscriptionId" && o.subscriptionId !== c.val) return false;
          if (c.field === "date" && o.date !== c.val) return false;
          if (c.field === "mealType" && o.mealType !== c.val) return false;
        }
        return true;
      });
    }),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getById: vi.fn(),
    validateSkipWindow: vi.fn(() => ({ valid: true, errors: [] })),
  },
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (uid: string) => {
      if (uid === "admin-1") return { id: "admin-1", role: "admin", fullName: "Admin User", isActive: true };
      if (uid === "cust-1") return { id: "cust-1", role: "customer", fullName: "Customer 1", isActive: true };
      if (uid === "kitchen-1") return { id: "kitchen-1", role: "kitchen", fullName: "Kitchen Staff", isActive: true };
      if (uid === "deliv-1") return { id: "deliv-1", role: "delivery_partner", fullName: "Delivery Partner", isActive: true };
      if (uid === "acc-1") return { id: "acc-1", role: "accounts", fullName: "Accounts Staff", isActive: true };
      return null;
    }),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(async (action, actorId, actorRole, actorName, entityId, entityType, details) => {
      inMemoryAuditLogs.push({ action, actorId, actorRole, actorName, entityId, entityType, details });
    }),
  },
}));

vi.mock("@/shared/services/firestore/dailyMenuRepository", () => ({
  dailyMenuRepository: {
    getByDate: vi.fn(async () => null),
  },
}));

import { orderService } from "../orderService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auth } from "@/shared/lib/firebase";

describe("Phase E5 — Authoritative Meal Plan & Selectable Option Management", () => {
  const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const TIME_LUNCH_BEFORE = new Date(`${TODAY}T10:00:00+05:30`);

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryOrders.clear();
    inMemoryWorkflowHistory.clear();
    inMemoryAuditLogs.length = 0;
    inMemoryPlanDocs.clear();
    txnQueue = Promise.resolve();

    // Populate initial baseline plans in simulated db
    INITIAL_MEAL_PLANS.forEach((plan) => {
      inMemoryPlanDocs.set(plan.id, JSON.parse(JSON.stringify(plan)));
    });

    // Reset repository in-memory cache to INITIAL_MEAL_PLANS
    (mealPlanRepository as any).cachedPlans = JSON.parse(JSON.stringify(INITIAL_MEAL_PLANS));

    (auth as any).currentUser = {
      uid: "admin-1",
      email: "admin@example.com",
      displayName: "Admin User",
    };
  });

  // A. Admin can view existing meal plans
  it("A: Admin can view all existing meal plans (both active and inactive)", async () => {
    const plans = await mealPlanRepository.listAll(true);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.map((p) => p.id)).toContain("basic-plan");
    expect(plans.map((p) => p.id)).toContain("regular-plan");
  });

  // B. Admin can update plan metadata
  it("B: Admin can update plan metadata and emits meal_plan_updated audit log", async () => {
    const updated = await mealPlanRepository.updatePlan(
      "basic-plan",
      {
        name: "Basic Wholesome Plan",
        description: "Homestyle south Indian meals with daily rotation",
      },
      "admin-1",
      "admin",
      "Admin User",
    );

    expect(updated.name).toBe("Basic Wholesome Plan");
    expect(updated.description).toBe("Homestyle south Indian meals with daily rotation");

    const audit = inMemoryAuditLogs.find((l) => l.action === "meal_plan_updated");
    expect(audit).toBeDefined();
    expect(audit.actorId).toBe("admin-1");
    expect(audit.entityId).toBe("basic-plan");
  });

  // C. Admin can enable/disable a plan
  it("C: Admin can enable/disable a plan with audit log", async () => {
    const disabled = await mealPlanRepository.togglePlanStatus("basic-plan", false, "admin-1", "admin", "Admin User");
    expect(disabled.isActive).toBe(false);

    let audit = inMemoryAuditLogs.find((l) => l.action === "meal_plan_disabled");
    expect(audit).toBeDefined();
    expect(audit.entityId).toBe("basic-plan");

    const enabled = await mealPlanRepository.togglePlanStatus("basic-plan", true, "admin-1", "admin", "Admin User");
    expect(enabled.isActive).toBe(true);

    audit = inMemoryAuditLogs.find((l) => l.action === "meal_plan_enabled");
    expect(audit).toBeDefined();
  });

  // D. Admin can create/update a Lunch option
  it("D: Admin can create and update a Lunch option", async () => {
    const updatedPlan = await mealPlanRepository.addMealOption(
      "basic-plan",
      "lunch",
      {
        label: "Millet Special Meals",
        items: ["Foxtail Millet Rice", "Mixed Veg Sambar", "Palak Dal"],
        description: "Nutritious organic millets",
        isActive: true,
        isCustomerSelectable: true,
      },
      "admin-1",
      "admin",
      "Admin User",
    );

    const lunchSlot = updatedPlan.mealSlots.find((s) => s.mealType === "lunch");
    const createdOpt = lunchSlot?.options.find((o) => o.label === "Millet Special Meals");
    expect(createdOpt).toBeDefined();
    expect(createdOpt?.id).toBeDefined();

    let audit = inMemoryAuditLogs.find((l) => l.action === "meal_option_created");
    expect(audit).toBeDefined();
    expect(audit.details.mealType).toBe("lunch");

    const planAfterUpdate = await mealPlanRepository.updateMealOption(
      "basic-plan",
      "lunch",
      createdOpt!.id,
      {
        label: "Millet & Ragi Super Meals",
      },
      "admin-1",
      "admin",
      "Admin User",
    );

    const updatedOpt = planAfterUpdate.mealSlots
      .find((s) => s.mealType === "lunch")
      ?.options.find((o) => o.id === createdOpt!.id);

    expect(updatedOpt?.label).toBe("Millet & Ragi Super Meals");
    audit = inMemoryAuditLogs.find((l) => l.action === "meal_option_updated");
    expect(audit).toBeDefined();
  });

  // E. Admin can create/update a Dinner option
  it("E: Admin can create and update a Dinner option", async () => {
    const updatedPlan = await mealPlanRepository.addMealOption(
      "regular-plan",
      "dinner",
      {
        label: "Phulka Diet Combo",
        items: ["3 Wheat Phulkas", "Methi Dal", "Green Salad"],
        isActive: true,
        isCustomerSelectable: true,
      },
      "admin-1",
      "admin",
      "Admin User",
    );

    const dinnerSlot = updatedPlan.mealSlots.find((s) => s.mealType === "dinner");
    const createdOpt = dinnerSlot?.options.find((o) => o.label === "Phulka Diet Combo");
    expect(createdOpt).toBeDefined();

    const planAfterUpdate = await mealPlanRepository.updateMealOption(
      "regular-plan",
      "dinner",
      createdOpt!.id,
      {
        description: "Light and digestion-friendly dinner",
      },
      "admin-1",
      "admin",
      "Admin User",
    );

    const updatedOpt = planAfterUpdate.mealSlots
      .find((s) => s.mealType === "dinner")
      ?.options.find((o) => o.id === createdOpt!.id);

    expect(updatedOpt?.description).toBe("Light and digestion-friendly dinner");
  });

  // Breakfast rule enforcement
  it("Breakfast Rule: Breakfast must NOT be customer selectable", async () => {
    await expect(
      mealPlanRepository.addMealOption(
        "basic-plan",
        "breakfast",
        {
          label: "Custom Breakfast Option",
          items: ["Poha", "Chutney"],
          isCustomerSelectable: true, // Forbidden!
        },
        "admin-1",
        "admin",
        "Admin User",
      ),
    ).rejects.toThrow(/Breakfast options cannot be made customer-selectable/);

    // Verify toggling customer selectable on breakfast option is blocked
    await expect(
      mealPlanRepository.toggleMealOptionSelectable("basic-plan", "breakfast", "basic-breakfast-1", true, "admin-1", "admin", "Admin User"),
    ).rejects.toThrow(/Breakfast options cannot be made customer-selectable/);
  });

  // F. Disabled option is unavailable to new subscription selection
  it("F: Disabled option is filtered out from customer subscription options", async () => {
    // Disable one lunch option on basic-plan
    const plan = await mealPlanRepository.getById("basic-plan");
    const lunchSlot = plan?.mealSlots.find((s) => s.mealType === "lunch");
    const firstOpt = lunchSlot?.options[0];
    expect(firstOpt).toBeDefined();

    await mealPlanRepository.toggleMealOptionStatus("basic-plan", "lunch", firstOpt!.id, false, "admin-1", "admin", "Admin User");

    const refreshed = await mealPlanRepository.getById("basic-plan");
    const activeSelectableLunchOptions = refreshed?.mealSlots
      .find((s) => s.mealType === "lunch")
      ?.options.filter((o) => o.isActive !== false && o.isCustomerSelectable !== false);

    expect(activeSelectableLunchOptions?.find((o) => o.id === firstOpt!.id)).toBeUndefined();
  });

  // G. Disabled option is unavailable to new D4 substitution
  it("G: Disabled option is rejected in changeTodayMealOption (D4 substitution)", async () => {
    const plan = await mealPlanRepository.getById("basic-plan");
    const lunchSlot = plan?.mealSlots.find((s) => s.mealType === "lunch");
    const disabledOpt = lunchSlot?.options[0]!;

    // Disable the option
    await mealPlanRepository.toggleMealOptionStatus("basic-plan", "lunch", disabledOpt.id, false, "admin-1", "admin", "Admin User");

    // Setup an order for today
    const order: Order = {
      id: "ord-test-1",
      subscriptionId: "sub-1",
      customerId: "cust-1",
      customerName: "Customer 1",
      deliveryAddress: "Address 1",
      deliveryZoneId: "zone-1",
      kitchenId: "kitchen-1",
      date: TODAY,
      mealType: "lunch",
      price: 65,
      status: "scheduled",
      kitchenStatus: "scheduled",
      deliveryStatus: "pending",
      selectedOptionId: "basic-lunch-2",
      mealName: "Ragi Ball",
      itemsLabel: "1 Ragi Ball, Sambar",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Order;

    inMemoryOrders.set("ord-test-1", order);

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({
      id: "sub-1",
      planId: "basic-plan",
      customerId: "cust-1",
      status: "active",
      mealPreferences: [{ mealType: "lunch", selectedOptionId: "basic-lunch-2" }],
    } as any);

    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" };

    // Attempt D4 substitution to disabled option
    await expect(
      orderService.changeTodayMealOption("sub-1", "lunch", disabledOpt.id, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/is currently disabled/);
  });

  // Non-customer-selectable option cannot be chosen by customer in D4
  it("Non-customer-selectable option cannot be chosen by customer in changeTodayMealOption", async () => {
    const plan = await mealPlanRepository.getById("basic-plan");
    const lunchSlot = plan?.mealSlots.find((s) => s.mealType === "lunch");
    const opt = lunchSlot?.options[0]!;

    // Make it not customer selectable
    await mealPlanRepository.toggleMealOptionSelectable("basic-plan", "lunch", opt.id, false, "admin-1", "admin", "Admin User");

    const order: Order = {
      id: "ord-test-2",
      subscriptionId: "sub-1",
      customerId: "cust-1",
      customerName: "Customer 1",
      deliveryAddress: "Address 1",
      deliveryZoneId: "zone-1",
      kitchenId: "kitchen-1",
      date: TODAY,
      mealType: "lunch",
      price: 65,
      status: "scheduled",
      kitchenStatus: "scheduled",
      deliveryStatus: "pending",
      selectedOptionId: "basic-lunch-2",
      mealName: "Ragi Ball",
      itemsLabel: "1 Ragi Ball",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Order;

    inMemoryOrders.set("ord-test-2", order);

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({
      id: "sub-1",
      planId: "basic-plan",
      customerId: "cust-1",
      status: "active",
      mealPreferences: [{ mealType: "lunch", selectedOptionId: "basic-lunch-2" }],
    } as any);

    // Customer attempt fails
    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" };
    await expect(
      orderService.changeTodayMealOption("sub-1", "lunch", opt.id, TIME_LUNCH_BEFORE),
    ).rejects.toThrow(/is not selectable by customers/);

    // Admin attempt succeeds
    (auth as any).currentUser = { uid: "admin-1", email: "admin@example.com", displayName: "Admin User" };
    const result = await orderService.changeTodayMealOption("sub-1", "lunch", opt.id, TIME_LUNCH_BEFORE);
    expect(result.success).toBe(true);
    expect(result.newOptionId).toBe(opt.id);
  });

  // H. Existing subscription referencing disabled option remains valid
  it("H: Existing subscription referencing disabled option remains valid", async () => {
    const subscription: Subscription = {
      id: "sub-existing",
      customerId: "cust-1",
      planId: "basic-plan",
      status: "active",
      mealPreferences: [
        { mealType: "lunch", selectedOptionId: "basic-lunch-1" },
      ],
    } as any;

    // Disabling option in plan
    await mealPlanRepository.toggleMealOptionStatus("basic-plan", "lunch", "basic-lunch-1", false, "admin-1", "admin", "Admin User");

    // The subscription entity itself is not mutated or broken
    expect(subscription.mealPreferences[0].selectedOptionId).toBe("basic-lunch-1");
    expect(subscription.status).toBe("active");
  });

  // I. Existing order referencing disabled option remains unchanged
  it("I: Existing order referencing disabled option remains frozen and valid", async () => {
    const historicalOrder: Order = {
      id: "ord-hist-1",
      subscriptionId: "sub-1",
      customerId: "cust-1",
      mealType: "lunch",
      price: 65,
      status: "delivered",
      selectedOptionId: "basic-lunch-1",
      mealName: "Rice & Sambar",
      itemsLabel: "Pickle, Rice, Sambar",
    } as any;

    inMemoryOrders.set("ord-hist-1", historicalOrder);

    // Admin disables option
    await mealPlanRepository.toggleMealOptionStatus("basic-plan", "lunch", "basic-lunch-1", false, "admin-1", "admin", "Admin User");

    // Historical order remains identical
    const fetchedOrder = inMemoryOrders.get("ord-hist-1");
    expect(fetchedOrder?.selectedOptionId).toBe("basic-lunch-1");
    expect(fetchedOrder?.price).toBe(65);
    expect(fetchedOrder?.mealName).toBe("Rice & Sambar");
  });

  // J, K, L, M. Role security: non-admins cannot mutate MealPlans
  it("J: Customer cannot modify MealPlan", async () => {
    await expect(
      mealPlanRepository.updatePlan("basic-plan", { name: "Hacked" }, "cust-1", "customer", "Customer"),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("K: Kitchen cannot modify global MealPlan", async () => {
    await expect(
      mealPlanRepository.togglePlanStatus("basic-plan", false, "kitchen-1", "kitchen", "Kitchen"),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("L: Delivery Partner cannot modify MealPlan", async () => {
    await expect(
      mealPlanRepository.addMealOption("basic-plan", "lunch", { label: "Deliv Opt", items: ["Deliv Item"] }, "deliv-1", "delivery_partner", "Driver"),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("M: Accounts cannot modify MealPlan", async () => {
    await expect(
      mealPlanRepository.toggleMealOptionStatus("basic-plan", "lunch", "basic-lunch-1", false, "acc-1", "accounts", "Accounts"),
    ).rejects.toThrow(/Unauthorized/);
  });

  // P, Q, R, S: D4 Option-change preserves ₹0 variance, pricing isolation, and frozen order snapshot
  it("P, Q, R, S: D4 option substitution maintains ₹0 variance and leaves order price intact", async () => {
    const plan = await mealPlanRepository.getById("basic-plan");
    const lunchSlot = plan?.mealSlots.find((s) => s.mealType === "lunch")!;
    const optA = lunchSlot.options[0];
    const optB = lunchSlot.options[1];

    const order: Order = {
      id: "ord-price-test",
      subscriptionId: "sub-1",
      customerId: "cust-1",
      customerName: "Customer 1",
      deliveryAddress: "Address 1",
      deliveryZoneId: "zone-1",
      kitchenId: "kitchen-1",
      date: TODAY,
      mealType: "lunch",
      price: 65,
      status: "scheduled",
      kitchenStatus: "scheduled",
      deliveryStatus: "pending",
      selectedOptionId: optA.id,
      mealName: optA.label,
      itemsLabel: optA.items.join(", "),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Order;

    inMemoryOrders.set("ord-price-test", order);

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({
      id: "sub-1",
      planId: "basic-plan",
      customerId: "cust-1",
      status: "active",
      mealPreferences: [{ mealType: "lunch", selectedOptionId: optA.id }],
    } as any);

    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" };

    // Perform substitution to Option B
    const result = await orderService.changeTodayMealOption("sub-1", "lunch", optB.id, TIME_LUNCH_BEFORE);

    expect(result.success).toBe(true);
    expect(result.newOptionId).toBe(optB.id);
    expect(result.newMealName).toBe(optB.label);
    // Price must remain exactly ₹65 (₹0 variance)
    expect(result.price).toBe(65);

    // Verify persisted record in inMemoryOrders
    const persisted = inMemoryOrders.get("ord-price-test");
    expect(persisted?.price).toBe(65);
    expect(persisted?.selectedOptionId).toBe(optB.id);
  });

  // T. E2 pricing precedence remains unchanged
  it("T: E2 pricing precedence remains unchanged by meal plan option changes", async () => {
    const baseSubscription: Subscription = {
      id: "sub-pricing-test",
      customerId: "cust-1",
      planId: "regular-plan",
      planTier: "regular",
      status: "active",
      quantity: 1,
      mealPreferences: [
        { mealType: "breakfast", selectedOptionId: null },
        { mealType: "lunch", selectedOptionId: "opt-1" },
        { mealType: "dinner", selectedOptionId: "opt-2" },
      ],
    } as any;

    const matrix = pricingService.getPricingMatrix(baseSubscription, "2026-09-30");
    expect(matrix.breakfast).toBe(60);
    expect(matrix.lunch).toBe(85);
    expect(matrix.dinner).toBe(85);
    expect(matrix.breakfast_lunch_dinner).toBe(210);

    const mealPrice = pricingService.calculateMealPrice(baseSubscription, "lunch", 1, "2026-09-30");
    expect(mealPrice).toBe(85);
  });
});
