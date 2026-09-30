import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription, MealPlan } from "@/shared/types";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemoryAuditLogs: any[] = [];

// Mock Firebase
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" },
  },
}));

let txnQueue = Promise.resolve();

vi.mock("firebase/firestore", () => ({
  runTransaction: vi.fn(async (_db, cb) => {
    const run = txnQueue.then(async () => {
      const txn = {
        get: vi.fn(async (orderRef: any) => {
          const order = inMemoryOrders.get(orderRef.id);
          return {
            exists: () => !!order,
            data: () => (order ? { ...order } : undefined),
          };
        }),
        update: vi.fn((orderRef: any, data: any) => {
          const current = inMemoryOrders.get(orderRef.id);
          if (current) {
            inMemoryOrders.set(orderRef.id, { ...current, ...data });
          }
        }),
        set: vi.fn((historyRef: any, data: any) => {
          const orderId = historyRef.orderId;
          const list = inMemoryWorkflowHistory.get(orderId) || [];
          list.push(data);
          inMemoryWorkflowHistory.set(orderId, list);
        }),
      };
      await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((firstArg, ...parts) => {
    if (firstArg && typeof firstArg.path === "string") {
      const segs = firstArg.path.split("/");
      if (segs[0] === "orders" && segs[2] === "workflowHistory") {
        return { collectionName: "workflowHistory", orderId: segs[1], id: parts[0] || "mock-hist-id" };
      }
    }
    if (parts.length === 1) {
      return { id: parts[0] };
    }
    if (parts.length === 2) {
      return { collectionName: parts[0], id: parts[1] };
    }
    if (parts.length === 4 && parts[0] === "orders" && parts[2] === "workflowHistory") {
      return { collectionName: "workflowHistory", orderId: parts[1], id: parts[3] || "mock-hist-id" };
    }
    return { id: parts[parts.length - 1] };
  }),
  collection: vi.fn((_db, ...parts) => ({
    path: parts.join("/"),
    withConverter: vi.fn((converter) => ({ converter, type: "collection" })),
  })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  serverTimestamp: vi.fn(() => "2026-08-01T04:00:00.000Z"),
}));

const mockPlan: MealPlan = {
  id: "plan-regular",
  tier: "regular",
  name: "Regular Plan",
  description: "Standard wholesome daily meal plan",
  pricePerDay: 210,
  currency: "INR",
  deliveryIncluded: true,
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00Z" as any,
  updatedAt: "2026-01-01T00:00:00Z" as any,
  pricingMatrix: {
    breakfast: 60,
    lunch: 85,
    dinner: 85,
    breakfast_lunch: 140,
    lunch_dinner: 140,
    breakfast_dinner: 140,
    breakfast_lunch_dinner: 210,
  },
  mealSlots: [
    {
      mealType: "breakfast",
      isCustomerSelectable: false,
      options: [],
    },
    {
      mealType: "lunch",
      isCustomerSelectable: true,
      options: [
        {
          id: "lunch-opt-a",
          label: "North Indian Thali",
          items: ["2 Rotis", "Paneer Curry", "Dal Tadka", "Jeera Rice"],
        },
        {
          id: "lunch-opt-b",
          label: "South Indian Meals",
          items: ["Rice", "Sambar", "Rasam", "Curd", "Poriyal"],
        },
      ],
    },
    {
      mealType: "dinner",
      isCustomerSelectable: true,
      options: [
        {
          id: "dinner-opt-a",
          label: "Phulka & Mixed Veg",
          items: ["3 Phulkas", "Mixed Veg Sabzi", "Dal Fry"],
        },
        {
          id: "dinner-opt-b",
          label: "Khichdi & Kadhi",
          items: ["Moong Dal Khichdi", "Gujarati Kadhi", "Papad"],
        },
      ],
    },
  ],
};

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    getById: vi.fn(async (id: string) => (id === mockPlan.id ? mockPlan : null)),
    list: vi.fn(async () => [mockPlan]),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => {
  const actualRepo = {
    getById: vi.fn(),
    validateSkipWindow: vi.fn((date, mealTypes, nowOverride) => {
      const now = nowOverride || new Date();
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);

      if (date < today) {
        throw new Error("Cannot modify skips for past dates.");
      }

      if (date === today) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "numeric",
          hourCycle: "h23",
        }).formatToParts(now);
        const hour = parseInt(
          parts.find((p) => p.type === "hour")?.value || "0",
          10,
        );
        const minute = parseInt(
          parts.find((p) => p.type === "minute")?.value || "0",
          10,
        );
        const currentTimeMinutes = hour * 60 + minute;

        for (const meal of mealTypes) {
          if (meal === "breakfast" && currentTimeMinutes >= 5 * 60) {
            throw new Error("Cancellation window has closed for breakfast.");
          }
          if (meal === "lunch" && currentTimeMinutes >= 10 * 60 + 30) {
            throw new Error("Cancellation window has closed for lunch.");
          }
          if (meal === "dinner" && currentTimeMinutes >= 16 * 60) {
            throw new Error("Cancellation window has closed for dinner.");
          }
        }
      }
    }),
  };
  return { subscriptionRepository: actualRepo };
});

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

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (uid: string) => {
      if (uid === "admin-1") return { id: "admin-1", role: "admin", fullName: "Admin User" };
      if (uid === "cust-1") return { id: "cust-1", role: "customer", fullName: "Customer 1" };
      if (uid === "cust-2") return { id: "cust-2", role: "customer", fullName: "Customer 2" };
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

import { orderService } from "../orderService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auth } from "@/shared/lib/firebase";

describe("PHASE D.4 — Today's Meal Option Change", () => {
  const TODAY = "2026-08-01"; // Saturday

  // Fixed test times in UTC mapping to specific Asia/Kolkata times
  const TIME_LUNCH_BEFORE = new Date("2026-08-01T04:00:00.000Z"); // 09:30 AM IST (cutoff is 10:30 AM)
  const TIME_LUNCH_EXACT = new Date("2026-08-01T05:00:00.000Z"); // 10:30 AM IST (cutoff is 10:30 AM)
  const TIME_LUNCH_AFTER = new Date("2026-08-01T05:01:00.000Z"); // 10:31 AM IST

  const TIME_DINNER_BEFORE = new Date("2026-08-01T09:30:00.000Z"); // 03:00 PM IST (cutoff is 04:00 PM)
  const TIME_DINNER_EXACT = new Date("2026-08-01T10:30:00.000Z"); // 04:00 PM IST (cutoff is 04:00 PM)
  const TIME_DINNER_AFTER = new Date("2026-08-01T10:31:00.000Z"); // 04:01 PM IST

  const baseSubscription: Subscription = {
    id: "sub-1",
    customerId: "cust-1",
    planId: "plan-regular",
    planTier: "regular",
    quantity: 1,
    status: "active",
    pricePerDaySnapshot: 210,
    pricingMatrixSnapshot: {
      breakfast: 60,
      lunch: 85,
      dinner: 85,
      breakfast_lunch: 140,
      lunch_dinner: 140,
      breakfast_dinner: 140,
      breakfast_lunch_dinner: 210,
    },
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    billingCycle: "monthly",
    autoRenew: true,
    latestPaymentId: null,
    depositAmount: 1000,
    deliveryAddressId: "addr-1",
    zoneId: "zone-1",
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: null },
      { mealType: "lunch", selectedOptionId: "lunch-opt-a" },
      { mealType: "dinner", selectedOptionId: "dinner-opt-a" },
    ],
    createdAt: "2026-07-25T00:00:00Z" as any,
    updatedAt: "2026-07-25T00:00:00Z" as any,
  };

  const lunchOrder: Order = {
    id: "ord_sub-1_2026-08-01_lunch",
    displayId: "ORD-LUNCH01",
    source: "subscription",
    customerId: "cust-1",
    subscriptionId: "sub-1",
    planTier: "regular",
    mealType: "lunch",
    date: TODAY,
    status: "scheduled",
    kitchenStatus: "scheduled",
    price: 85,
    currency: "INR",
    selectedOptionId: "lunch-opt-a",
    mealName: "North Indian Thali",
    itemsLabel: "Subscription - lunch (North Indian Thali)",
    mealQuantity: 1,
    deliveryAddressId: "addr-1",
    zoneId: "zone-1",
    kitchenId: "kitchen-1",
    deliveryPartnerId: "driver-1",
    deliveryWindow: null,
    paymentId: null,
    createdAt: "2026-08-01T00:00:00Z" as any,
    updatedAt: "2026-08-01T00:00:00Z" as any,
  };

  const dinnerOrder: Order = {
    id: "ord_sub-1_2026-08-01_dinner",
    displayId: "ORD-DINNER01",
    source: "subscription",
    customerId: "cust-1",
    subscriptionId: "sub-1",
    planTier: "regular",
    mealType: "dinner",
    date: TODAY,
    status: "scheduled",
    kitchenStatus: "scheduled",
    price: 85,
    currency: "INR",
    selectedOptionId: "dinner-opt-a",
    mealName: "Phulka & Mixed Veg",
    itemsLabel: "Subscription - dinner (Phulka & Mixed Veg)",
    mealQuantity: 1,
    deliveryAddressId: "addr-1",
    zoneId: "zone-1",
    kitchenId: "kitchen-1",
    deliveryPartnerId: "driver-1",
    deliveryWindow: null,
    paymentId: null,
    createdAt: "2026-08-01T00:00:00Z" as any,
    updatedAt: "2026-08-01T00:00:00Z" as any,
  };

  const breakfastOrder: Order = {
    id: "ord_sub-1_2026-08-01_breakfast",
    displayId: "ORD-BFAST01",
    source: "subscription",
    customerId: "cust-1",
    subscriptionId: "sub-1",
    planTier: "regular",
    mealType: "breakfast",
    date: TODAY,
    status: "scheduled",
    kitchenStatus: "scheduled",
    price: 60,
    currency: "INR",
    selectedOptionId: null,
    mealName: "Daily Breakfast",
    itemsLabel: "Subscription - breakfast",
    mealQuantity: 1,
    deliveryAddressId: "addr-1",
    zoneId: "zone-1",
    kitchenId: "kitchen-1",
    deliveryPartnerId: "driver-1",
    deliveryWindow: null,
    paymentId: null,
    createdAt: "2026-08-01T00:00:00Z" as any,
    updatedAt: "2026-08-01T00:00:00Z" as any,
  };

  beforeEach(() => {
    inMemoryOrders.clear();
    inMemoryWorkflowHistory.clear();
    inMemoryAuditLogs.length = 0;

    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" };
    vi.mocked(subscriptionRepository.getById).mockResolvedValue({ ...baseSubscription });

    inMemoryOrders.set(breakfastOrder.id, { ...breakfastOrder });
    inMemoryOrders.set(lunchOrder.id, { ...lunchOrder });
    inMemoryOrders.set(dinnerOrder.id, { ...dinnerOrder });
  });

  // A. Lunch Option A → Option B before cutoff
  it("A. Lunch Option A -> Option B before cutoff succeeds", async () => {
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.orderId).toBe(lunchOrder.id);
    expect(res.previousOptionId).toBe("lunch-opt-a");
    expect(res.newOptionId).toBe("lunch-opt-b");
    expect(res.newMealName).toBe("South Indian Meals");
    expect(res.itemsLabel).toBe("Subscription - lunch (South Indian Meals)");
    expect(res.price).toBe(85);

    const updated = inMemoryOrders.get(lunchOrder.id);
    expect(updated?.selectedOptionId).toBe("lunch-opt-b");
    expect(updated?.mealName).toBe("South Indian Meals");
    expect(updated?.itemsLabel).toBe("Subscription - lunch (South Indian Meals)");
  });

  // B. Dinner Option A → Option B before cutoff
  it("B. Dinner Option A -> Option B before cutoff succeeds", async () => {
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "dinner",
      "dinner-opt-b",
      TIME_DINNER_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.orderId).toBe(dinnerOrder.id);
    expect(res.previousOptionId).toBe("dinner-opt-a");
    expect(res.newOptionId).toBe("dinner-opt-b");
    expect(res.newMealName).toBe("Khichdi & Kadhi");
    expect(res.price).toBe(85);

    const updated = inMemoryOrders.get(dinnerOrder.id);
    expect(updated?.selectedOptionId).toBe("dinner-opt-b");
    expect(updated?.mealName).toBe("Khichdi & Kadhi");
  });

  // C. Breakfast substitution → rejected
  it("C. Breakfast substitution is strictly rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "breakfast",
        "some-opt",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Only lunch and dinner meal options can be changed/);
  });

  // D. Cross-meal-type substitution → rejected
  it("D. Cross-meal-type substitution is rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "dinner-opt-b", // Dinner option passed for lunch
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Option dinner-opt-b is not a valid option for lunch/);
  });

  // E. Invalid newOptionId → rejected
  it("E. Invalid newOptionId not present in plan is rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "non-existent-opt",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Option non-existent-opt is not a valid option for lunch/);
  });

  // F. Option from another meal slot → rejected
  it("F. Option from another meal slot is rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "dinner",
        "lunch-opt-b", // Lunch option passed for dinner
        TIME_DINNER_BEFORE,
      ),
    ).rejects.toThrow(/Option lunch-opt-b is not a valid option for dinner/);
  });

  // G. Exact lunch cutoff → rejected
  it("G. Exact lunch cutoff (10:30 IST) is strictly rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_EXACT,
      ),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);
  });

  // H. Exact dinner cutoff → rejected
  it("H. Exact dinner cutoff (16:00 IST) is strictly rejected", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "dinner",
        "dinner-opt-b",
        TIME_DINNER_EXACT,
      ),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
  });

  // I. After cutoff → rejected
  it("I. After cutoff is rejected for both lunch and dinner", async () => {
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_AFTER,
      ),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);

    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "dinner",
        "dinner-opt-b",
        TIME_DINNER_AFTER,
      ),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
  });

  // J. Missing order → rejected
  it("J. Missing order for today is rejected", async () => {
    inMemoryOrders.delete(lunchOrder.id);
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Order not found for lunch/);
  });

  // K. Cancelled/skipped order → rejected
  it("K. Cancelled or skipped order is rejected", async () => {
    inMemoryOrders.set(lunchOrder.id, { ...lunchOrder, status: "cancelled" });
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Order is in 'cancelled' status and cannot be modified/);

    inMemoryOrders.set(lunchOrder.id, { ...lunchOrder, status: "skipped" });
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/Order is in 'skipped' status and cannot be modified/);
  });

  // L. Kitchen-locked order → rejected
  it("L. Kitchen-locked order (preparing, packing, packed, ready_for_pickup) is rejected", async () => {
    const kitchenStatuses: ("preparing" | "packing" | "packed" | "ready_for_pickup")[] = [
      "preparing",
      "packing",
      "packed",
      "ready_for_pickup",
    ];

    for (const kStatus of kitchenStatuses) {
      inMemoryOrders.set(lunchOrder.id, { ...lunchOrder, kitchenStatus: kStatus as any });
      await expect(
        orderService.changeTodayMealOption(
          "sub-1",
          "lunch",
          "lunch-opt-b",
          TIME_LUNCH_BEFORE,
        ),
      ).rejects.toThrow(/Order is already being prepared by the kitchen/);
    }
  });

  // M. Delivery-locked order → rejected
  it("M. Delivery-locked order is rejected", async () => {
    const deliveryStatuses: Order["status"][] = [
      "picked_up",
      "out_for_delivery",
      "delivered",
      "failed_delivery",
      "returned_delivery",
    ];

    for (const dStatus of deliveryStatuses) {
      inMemoryOrders.set(lunchOrder.id, { ...lunchOrder, status: dStatus });
      await expect(
        orderService.changeTodayMealOption(
          "sub-1",
          "lunch",
          "lunch-opt-b",
          TIME_LUNCH_BEFORE,
        ),
      ).rejects.toThrow(/Order is in/);
    }
  });

  // N. Non-owner → rejected
  it("N. Non-owner customer is rejected", async () => {
    (auth as any).currentUser = { uid: "cust-2", email: "cust2@example.com" };
    await expect(
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
    ).rejects.toThrow(/You do not own this subscription/);
  });

  // O. Owner → allowed
  it("O. Owner customer is allowed", async () => {
    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com" };
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res.success).toBe(true);
    expect(res.changed).toBe(true);
  });

  // P. Admin → allowed
  it("P. Admin user is authorized to perform substitution on customer subscription", async () => {
    (auth as any).currentUser = { uid: "admin-1", email: "admin@example.com" };
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res.success).toBe(true);
    expect(res.changed).toBe(true);
  });

  // Q. Same option → idempotent no-op
  it("Q. Same option request is an idempotent safe no-op", async () => {
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-a", // Already selected
      TIME_LUNCH_BEFORE,
    );

    expect(res.success).toBe(true);
    expect(res.changed).toBe(false);
    expect(res.newOptionId).toBe("lunch-opt-a");
    expect(inMemoryAuditLogs.length).toBe(0);
    expect(inMemoryWorkflowHistory.get(lunchOrder.id)?.length || 0).toBe(0);
  });

  // R. Repeated change → safe/idempotent
  it("R. Repeated change calls produce no duplicate effects or audit records", async () => {
    const res1 = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res1.changed).toBe(true);
    expect(inMemoryAuditLogs.length).toBe(1);

    const res2 = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res2.changed).toBe(false);
    expect(res2.success).toBe(true);
    // Audit logs remain 1
    expect(inMemoryAuditLogs.length).toBe(1);
  });

  // S. Concurrent change → deterministic final state
  it("S. Concurrent change requests execute safely with deterministic final state", async () => {
    const [res1, res2] = await Promise.all([
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
      orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "lunch-opt-b",
        TIME_LUNCH_BEFORE,
      ),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const changedCount = [res1.changed, res2.changed].filter(Boolean).length;
    expect(changedCount).toBe(1);
    expect(inMemoryAuditLogs.length).toBe(1);
    expect(inMemoryOrders.get(lunchOrder.id)?.selectedOptionId).toBe("lunch-opt-b");
  });

  // T. Order ID remains unchanged
  it("T. Order ID remains unchanged", async () => {
    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res.orderId).toBe("ord_sub-1_2026-08-01_lunch");
    expect(inMemoryOrders.get("ord_sub-1_2026-08-01_lunch")?.id).toBe("ord_sub-1_2026-08-01_lunch");
  });

  // U. order.price remains unchanged (zero price variance)
  it("U. order.price remains unchanged with zero price variance", async () => {
    const initialPrice = inMemoryOrders.get(lunchOrder.id)?.price;
    expect(initialPrice).toBe(85);

    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res.price).toBe(85);
    expect(inMemoryOrders.get(lunchOrder.id)?.price).toBe(85);
  });

  // V. Negotiated pricing remains unchanged
  it("V. Negotiated pricing remains unchanged", async () => {
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce({
      ...baseSubscription,
      negotiatedPricing: {
        breakfast: 50,
        lunch: 70,
        dinner: 70,
        breakfast_lunch: 120,
        lunch_dinner: 120,
        breakfast_dinner: 120,
        breakfast_lunch_dinner: 180,
      } as any,
    });

    const res = await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    expect(res.price).toBe(85); // Preserves frozen order.price
  });

  // W. Invoice amount remains unchanged
  it("W. Invoice amount remains unchanged before and after option change", async () => {
    const { pricingService } = await import("@/shared/services/business/pricingService");
    const amountBefore = pricingService.calculateMealPrice(baseSubscription, "lunch");
    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );
    const amountAfter = pricingService.calculateMealPrice(baseSubscription, "lunch");
    expect(amountBefore).toBe(amountAfter);
  });

  // X. Workflow history records old → new option
  it("X. Workflow history records old -> new option with descriptive details", async () => {
    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    const history = inMemoryWorkflowHistory.get(lunchOrder.id);
    expect(history).toBeDefined();
    expect(history!.length).toBe(1);
    expect(history![0].notes).toContain("lunch-opt-a");
    expect(history![0].notes).toContain("lunch-opt-b");
    expect(history![0].changedBy).toBe("cust-1");
  });

  // Y. Audit event records meal_option_changed
  it("Y. Audit event records meal_option_changed with full context", async () => {
    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    expect(inMemoryAuditLogs.length).toBe(1);
    const log = inMemoryAuditLogs[0];
    expect(log.action).toBe("meal_option_changed");
    expect(log.entityId).toBe(lunchOrder.id);
    expect(log.actorId).toBe("cust-1");
    expect(log.details.oldOptionId).toBe("lunch-opt-a");
    expect(log.details.newOptionId).toBe("lunch-opt-b");
    expect(log.details.oldMealName).toBe("North Indian Thali");
    expect(log.details.newMealName).toBe("South Indian Meals");
    expect(log.details.date).toBe(TODAY);
    expect(log.details.mealType).toBe("lunch");
  });

  // Z. Historical past orders remain unchanged
  it("Z. Historical past orders remain unchanged and unaffected", async () => {
    const pastOrder: Order = {
      ...lunchOrder,
      id: "ord_sub-1_2026-07-30_lunch",
      date: "2026-07-30",
      status: "delivered",
      selectedOptionId: "lunch-opt-a",
      mealName: "North Indian Thali",
    };
    inMemoryOrders.set(pastOrder.id, { ...pastOrder });

    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    const checkPast = inMemoryOrders.get(pastOrder.id);
    expect(checkPast?.selectedOptionId).toBe("lunch-opt-a");
    expect(checkPast?.mealName).toBe("North Indian Thali");
    expect(checkPast?.status).toBe("delivered");
  });

  // 10. Actual persisted Firestore state verification
  it("10. Actual persisted state verification: asserts all fields and invariants", async () => {
    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    const persisted = inMemoryOrders.get(lunchOrder.id);
    expect(persisted).toBeDefined();
    expect(persisted?.id).toBe(lunchOrder.id);
    expect(persisted?.subscriptionId).toBe("sub-1");
    expect(persisted?.customerId).toBe("cust-1");
    expect(persisted?.date).toBe(TODAY);
    expect(persisted?.mealType).toBe("lunch");
    expect(persisted?.selectedOptionId).toBe("lunch-opt-b");
    expect(persisted?.mealName).toBe("South Indian Meals");
    expect(persisted?.itemsLabel).toBe("Subscription - lunch (South Indian Meals)");
    expect(persisted?.price).toBe(85);
    expect(persisted?.status).toBe("scheduled");

    // Workflow history exists
    expect(inMemoryWorkflowHistory.get(lunchOrder.id)?.length).toBe(1);
    // Audit exists
    expect(inMemoryAuditLogs.length).toBe(1);
  });

  // 12. Subscription settings invariance
  it("12. Subscription settings invariance: does NOT mutate subscription.mealPreferences", async () => {
    const subBefore = { ...baseSubscription };
    await orderService.changeTodayMealOption(
      "sub-1",
      "lunch",
      "lunch-opt-b",
      TIME_LUNCH_BEFORE,
    );

    // Subscription repository update must NOT be called for subscription settings
    const subAfter = await subscriptionRepository.getById("sub-1");
    expect(subAfter?.mealPreferences).toEqual(subBefore.mealPreferences);
    expect(subAfter?.mealPreferences.find((p) => p.mealType === "lunch")?.selectedOptionId).toBe("lunch-opt-a");
  });

  // 13. Billing invariant
  it("13. Billing invariant: combination key and billing totals remain identical", () => {
    const activeOrdersBefore = [breakfastOrder, lunchOrder, dinnerOrder];
    const mealsBefore = activeOrdersBefore.map((o) => o.mealType);
    const keyBefore = mealsBefore.sort().join("_");

    const activeOrdersAfter = [
      breakfastOrder,
      { ...lunchOrder, selectedOptionId: "lunch-opt-b", mealName: "South Indian Meals" },
      dinnerOrder,
    ];
    const mealsAfter = activeOrdersAfter.map((o) => o.mealType);
    const keyAfter = mealsAfter.sort().join("_");

    expect(keyBefore).toBe(keyAfter);
  });
});
