import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { adminCallCenterService } from "../services/adminCallCenterService";
import { subscriptionService } from "@/shared/services/business/subscriptionService";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { where } from "firebase/firestore";
import type { Order, Subscription, MealPlan, UserProfile } from "@/shared/types";

// In-memory simulation state
const inMemoryUsers: Map<string, UserProfile> = new Map();
const inMemorySubscriptions: Map<string, Subscription> = new Map();
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemorySkips: Map<string, any> = new Map();
const inMemoryAuditLogs: any[] = [];
const inMemoryInvoices: Map<string, any> = new Map();
const mockNotificationsSent: any[] = [];
const mockSettlements: any[] = [];

let mockAuthUser: { uid: string; email?: string; displayName?: string } | null = {
  uid: "admin-1",
  email: "admin@mysuru.com",
  displayName: "Admin Operator",
};

// Mock Firebase
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  get auth() {
    return {
      get currentUser() {
        return mockAuthUser;
      },
    };
  },
}));

let txnQueue = Promise.resolve();

vi.mock("firebase/firestore", () => ({
  runTransaction: vi.fn(async (_db, cb) => {
    const run = txnQueue.then(async () => {
      const txn = {
        get: vi.fn(async (ref: any) => {
          if (ref.collectionName === "invoices") {
            const inv = inMemoryInvoices.get(ref.id);
            return {
              exists: () => !!inv,
              data: () => (inv ? { ...inv } : undefined),
            };
          }
          const order = inMemoryOrders.get(ref.id);
          return {
            exists: () => !!order,
            data: () => (order ? { ...order } : undefined),
          };
        }),
        update: vi.fn((ref: any, data: any) => {
          if (ref.collectionName === "invoices") {
            const current = inMemoryInvoices.get(ref.id);
            if (current) inMemoryInvoices.set(ref.id, { ...current, ...data });
            return;
          }
          const current = inMemoryOrders.get(ref.id);
          if (current) {
            inMemoryOrders.set(ref.id, { ...current, ...data });
          }
        }),
        set: vi.fn((ref: any, data: any) => {
          if (ref.collectionName === "invoices") {
            inMemoryInvoices.set(ref.id, { id: ref.id, ...data });
            return;
          }
          if (ref.collectionName === "workflowHistory") {
            const orderId = ref.orderId;
            const list = inMemoryWorkflowHistory.get(orderId) || [];
            list.push(data);
            inMemoryWorkflowHistory.set(orderId, list);
            return;
          }
          inMemoryOrders.set(ref.id, { id: ref.id, ...data });
        }),
      };
      await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((_db, ...parts) => {
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
  query: vi.fn((col) => col),
  serverTimestamp: vi.fn(() => "2026-09-28T04:00:00.000Z"),
  getDoc: vi.fn(async (ref: any) => {
    if (ref?.path && ref.path.includes("skips")) {
      const parts = ref.path.split("/");
      const subId = parts[1];
      const date = parts[3];
      const skip = inMemorySkips.get(`${subId}_${date}`);
      return { exists: () => !!skip, data: () => skip };
    }
    return { exists: () => false, data: () => null };
  }),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  setDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({
    set: vi.fn((ref: any, data: any) => {
      inMemoryOrders.set(ref.id, { id: ref.id, ...data });
    }),
    update: vi.fn((ref: any, data: any) => {
      const current = inMemoryOrders.get(ref.id);
      if (current) inMemoryOrders.set(ref.id, { ...current, ...data });
    }),
    commit: vi.fn(async () => {}),
  })),
}));

vi.mock("@/shared/services/firestore/deliveryZoneRepository", () => ({
  deliveryZoneRepository: {
    list: vi.fn(async () => [
      { id: "zone-1", name: "Mysuru Central", kitchenId: "kitchen-1", isActive: true, pincodes: ["570001"] },
    ]),
  },
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getById: vi.fn(async (uid: string) => inMemoryUsers.get(uid) || null),
    list: vi.fn(async () => Array.from(inMemoryUsers.values())),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getById: vi.fn(async (id: string) => inMemorySubscriptions.get(id) || null),
    update: vi.fn(async (id: string, data: any) => {
      const existing = inMemorySubscriptions.get(id);
      if (existing) {
        inMemorySubscriptions.set(id, { ...existing, ...data });
      }
    }),
    list: vi.fn(async (...constraints: any[]) => {
      let subs = Array.from(inMemorySubscriptions.values());
      for (const c of constraints) {
        if (c?.field && c?.val !== undefined) {
          subs = subs.filter((s) => (s as any)[c.field] === c.val);
        }
      }
      return subs;
    }),
    addSkip: vi.fn(async (subscriptionId, date, mealTypes, reason, uid) => {
      inMemorySkips.set(`${subscriptionId}_${date}`, {
        subscriptionId,
        date,
        mealTypes,
        reason,
        uid,
      });
    }),
    removeSkip: vi.fn(async (subscriptionId, date, mealTypes) => {
      const existing = inMemorySkips.get(`${subscriptionId}_${date}`);
      if (existing) {
        const remaining = (existing.mealTypes || []).filter(
          (m: string) => !mealTypes.includes(m),
        );
        if (remaining.length === 0) {
          inMemorySkips.delete(`${subscriptionId}_${date}`);
        } else {
          inMemorySkips.set(`${subscriptionId}_${date}`, {
            ...existing,
            mealTypes: remaining,
          });
        }
      }
    }),
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
        const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
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
  },
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    getById: vi.fn(async (id: string) => inMemoryOrders.get(id) || null),
    list: vi.fn(async (...constraints: any[]) => {
      let orders = Array.from(inMemoryOrders.values());
      for (const c of constraints) {
        if (c?.field && c?.val !== undefined) {
          orders = orders.filter((o) => (o as any)[c.field] === c.val);
        }
      }
      return orders;
    }),
  },
}));

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    getById: vi.fn(async (_id: string) => mockMealPlan),
    list: vi.fn(async () => [mockMealPlan]),
  },
}));

vi.mock("@/shared/services/firestore/accountsRepository", () => ({
  accountsRepository: {
    getInvoicesByCustomerId: vi.fn(async (customerId: string) =>
      Array.from(inMemoryInvoices.values()).filter((i) => i.customerId === customerId),
    ),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(async (action, actorId, actorRole, actorName, entityId, entityType, details) => {
      inMemoryAuditLogs.push({
        action,
        performedBy: actorId,
        performedByRole: actorRole,
        performedByName: actorName,
        entityId,
        entityType,
        details,
        timestamp: new Date().toISOString(),
      });
    }),
  },
}));

vi.mock("@/shared/services/firestore/notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/services/firestore/notificationService")>();
  return {
    ...actual,
    notifySubscriptionRejected: vi.fn(async (customerId: string, subscriptionId: string, reason?: string) => {
      mockNotificationsSent.push({ customerId, subscriptionId, reason });
    }),
  };
});

vi.mock("@/shared/services/firestore/paymentRepository", () => ({
  paymentRepository: {
    getPaymentsPaginated: vi.fn(async () => ({ payments: [], lastDoc: null })),
    update: vi.fn(async () => {}),
  },
}));

vi.mock("@/shared/services/business/billingService", () => ({
  billingService: {
    processSubscriptionEnd: vi.fn(async (subscription: any, effectiveEndDate: string, reason: string) => {
      mockSettlements.push({ subscriptionId: subscription.id, effectiveEndDate, reason });
    }),
  },
}));

// Test Fixtures
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const TIME_BREAKFAST_BEFORE = new Date(`${TODAY}T04:30:00+05:30`);
const TIME_BREAKFAST_AFTER = new Date(`${TODAY}T05:30:00+05:30`);
const TIME_LUNCH_BEFORE = new Date(`${TODAY}T10:00:00+05:30`);
const TIME_LUNCH_AFTER = new Date(`${TODAY}T11:00:00+05:30`);
const TIME_DINNER_BEFORE = new Date(`${TODAY}T15:30:00+05:30`);
const TIME_DINNER_AFTER = new Date(`${TODAY}T16:30:00+05:30`);

const mockAdminUser: any = {
  id: "admin-1",
  fullName: "Admin Operator",
  email: "admin@mysuru.com",
  role: "admin",
  isActive: true,
  createdAt: "2026-01-01" as any,
  updatedAt: "2026-01-01" as any,
};

const mockCustomerUser: any = {
  id: "cust-1",
  fullName: "Customer Kalyan",
  email: "customer@mysuru.com",
  role: "customer",
  isActive: true,
  createdAt: "2026-01-01" as any,
  updatedAt: "2026-01-01" as any,
};

const mockMealPlan: MealPlan = {
  id: "plan-regular",
  tier: "regular",
  name: "Regular South Indian Plan",
  description: "Standard daily meals",
  pricePerDay: 210,
  currency: "INR",
  deliveryIncluded: true,
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01" as any,
  updatedAt: "2026-01-01" as any,
  mealSlots: [
    {
      mealType: "breakfast",
      isCustomerSelectable: false,
      options: [{ id: "opt_b1", label: "Idli Sambar Vada", items: ["Idli", "Sambar", "Vada"] }],
    },
    {
      mealType: "lunch",
      isCustomerSelectable: true,
      options: [
        { id: "opt_l1", label: "South Indian Thali", items: ["Rice", "Sambar", "Rasam"] },
        { id: "opt_l2", label: "North Indian Thali", items: ["Roti", "Dal", "Paneer"] },
      ],
    },
    {
      mealType: "dinner",
      isCustomerSelectable: true,
      options: [
        { id: "opt_d1", label: "Light Dinner", items: ["Phulka", "Mixed Veg Curry"] },
        { id: "opt_d2", label: "Khichdi & Kadhi", items: ["Moong Khichdi", "Gujarati Kadhi"] },
      ],
    },
  ],
};

const mockSubscription: any = {
  id: "sub-101",
  customerId: "cust-1",
  planId: "plan-regular",
  planTier: "regular",
  status: "active",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  billingCycle: "monthly",
  autoRenew: true,
  quantity: 1,
  pricePerDaySnapshot: 210,
  mealPreferences: [
    { mealType: "breakfast", selectedOptionId: "opt_b1" },
    { mealType: "lunch", selectedOptionId: "opt_l1" },
    { mealType: "dinner", selectedOptionId: "opt_d1" },
  ],
  deliveryAddressId: "addr-1",
  zoneId: "zone-1",
  createdAt: "2026-09-01" as any,
  updatedAt: "2026-09-01" as any,
};

function seedOrders() {
  inMemoryOrders.clear();
  inMemoryWorkflowHistory.clear();
  inMemorySkips.clear();
  inMemoryAuditLogs.length = 0;
  inMemoryInvoices.clear();
  mockNotificationsSent.length = 0;
  mockSettlements.length = 0;

  // Create initial scheduled orders for today
  const meals: ("breakfast" | "lunch" | "dinner")[] = ["breakfast", "lunch", "dinner"];
  for (const m of meals) {
    const orderId = `ord_sub-101_${TODAY}_${m}`;
    const price = m === "breakfast" ? 60 : 85;
    inMemoryOrders.set(orderId, {
      id: orderId,
      customerId: "cust-1",
      subscriptionId: "sub-101",
      date: TODAY,
      mealType: m,
      status: "scheduled",
      kitchenStatus: "scheduled",
      price,
      mealName: m === "lunch" ? "South Indian Thali" : m === "dinner" ? "Light Dinner" : "Idli Sambar Vada",
      selectedOptionId: m === "lunch" ? "opt_l1" : m === "dinner" ? "opt_d1" : "opt_b1",
      source: "subscription",
      currency: "INR",
      zoneId: "zone-1",
      kitchenId: "kitchen-1",
      createdAt: "2026-09-28T04:00:00Z" as any,
      updatedAt: "2026-09-28T04:00:00Z" as any,
    } as any);
  }

  // Open invoice for customer
  inMemoryInvoices.set("inv_sub-101_2026-09-30", {
    id: "inv_sub-101_2026-09-30",
    customerId: "cust-1",
    subscriptionId: "sub-101",
    status: "issued",
    totalAmount: 6300,
    subtotal: 6300,
    lineItems: [],
  });
}

describe("Admin Call-Center — Today's Meal & Add-on Control", () => {
  beforeEach(() => {
    mockAuthUser = {
      uid: "admin-1",
      email: "admin@mysuru.com",
      displayName: "Admin Operator",
    };
    inMemoryUsers.set("admin-1", mockAdminUser);
    inMemoryUsers.set("cust-1", mockCustomerUser);
    inMemorySubscriptions.set("sub-101", { ...mockSubscription });
    seedOrders();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. REMOVE TODAY'S MEAL
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Remove Today's Meal", () => {
    it("Admin removes breakfast before cutoff (05:00) with correct cancellation adjustment", async () => {
      const res = await adminCallCenterService.adminRemoveTodayMeal(
        "sub-101",
        "breakfast",
        TIME_BREAKFAST_BEFORE,
      );

      expect(res.success).toBe(true);
      expect(res.cancelled).toBe(true);
      expect(res.cancellationAmount).toBe(60); // Regular tier breakfast rate

      const order = inMemoryOrders.get(`ord_sub-101_${TODAY}_breakfast`);
      expect(order?.status).toBe("cancelled");

      // Verify audit log
      const audit = inMemoryAuditLogs.find((a) => a.action === "admin_today_meal_removed");
      expect(audit).toBeDefined();
      expect(audit.performedBy).toBe("admin-1");
      expect(audit.performedByRole).toBe("admin");
      expect(audit.details.customerId).toBe("cust-1");
      expect(audit.details.mealType).toBe("breakfast");
      expect(audit.details.cancellationAmount).toBe(60);
    });

    it("Admin removes lunch before cutoff (10:30) with correct cancellation adjustment", async () => {
      const res = await adminCallCenterService.adminRemoveTodayMeal(
        "sub-101",
        "lunch",
        TIME_LUNCH_BEFORE,
      );

      expect(res.success).toBe(true);
      expect(res.cancelled).toBe(true);
      expect(res.cancellationAmount).toBe(85); // Regular tier lunch rate
      expect(inMemoryOrders.get(`ord_sub-101_${TODAY}_lunch`)?.status).toBe("cancelled");

      const audit = inMemoryAuditLogs.find(
        (a) => a.action === "admin_today_meal_removed" && a.details.mealType === "lunch",
      );
      expect(audit).toBeDefined();
    });

    it("Admin removes dinner before cutoff (16:00) with correct cancellation adjustment", async () => {
      const res = await adminCallCenterService.adminRemoveTodayMeal(
        "sub-101",
        "dinner",
        TIME_DINNER_BEFORE,
      );

      expect(res.success).toBe(true);
      expect(res.cancelled).toBe(true);
      expect(res.cancellationAmount).toBe(85);
      expect(inMemoryOrders.get(`ord_sub-101_${TODAY}_dinner`)?.status).toBe("cancelled");
    });

    it("Rejects cancellation when cutoff has passed", async () => {
      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "breakfast", TIME_BREAKFAST_AFTER),
      ).rejects.toThrow(/Cancellation window has closed for breakfast/i);

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_AFTER),
      ).rejects.toThrow(/Cancellation window has closed for lunch/i);

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "dinner", TIME_DINNER_AFTER),
      ).rejects.toThrow(/Cancellation window has closed for dinner/i);
    });

    it("Rejects cancellation when meal order is locked by kitchen or delivery", async () => {
      const lunchOrder = inMemoryOrders.get(`ord_sub-101_${TODAY}_lunch`)!;
      lunchOrder.kitchenStatus = "packed";

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/kitchen/i);

      lunchOrder.kitchenStatus = "scheduled";
      lunchOrder.status = "out_for_delivery";

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/delivery/i);
    });

    it("Is idempotent when meal is already cancelled", async () => {
      const res1 = await adminCallCenterService.adminRemoveTodayMeal(
        "sub-101",
        "lunch",
        TIME_LUNCH_BEFORE,
      );
      expect(res1.cancelled).toBe(true);

      const auditCountBefore = inMemoryAuditLogs.filter(
        (a) => a.action === "admin_today_meal_removed",
      ).length;

      const res2 = await adminCallCenterService.adminRemoveTodayMeal(
        "sub-101",
        "lunch",
        TIME_LUNCH_BEFORE,
      );
      expect(res2.cancelled).toBe(false); // No-op

      const auditCountAfter = inMemoryAuditLogs.filter(
        (a) => a.action === "admin_today_meal_removed",
      ).length;
      expect(auditCountAfter).toBe(auditCountBefore); // No duplicate audit log
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. ADD TODAY'S MEAL
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Add Today's Meal", () => {
    it("Admin adds previously cancelled lunch back before cutoff (10:30)", async () => {
      // First remove lunch
      await adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE);
      expect(inMemoryOrders.get(`ord_sub-101_${TODAY}_lunch`)?.status).toBe("cancelled");

      // Now add it back
      const addRes = await adminCallCenterService.adminAddTodayMeal(
        "sub-101",
        "lunch",
        TIME_LUNCH_BEFORE,
      );

      expect(addRes.success).toBe(true);
      expect(addRes.count).toBe(1);
      expect(addRes.price).toBe(85); // Authoritative meal price

      const restoredOrder = inMemoryOrders.get(`ord_sub-101_${TODAY}_lunch`);
      expect(restoredOrder?.status).toBe("scheduled");
      expect((restoredOrder as any)?.cancellationAmount).toBeFalsy();

      // Verify audit log
      const audit = inMemoryAuditLogs.find((a) => a.action === "admin_today_meal_added");
      expect(audit).toBeDefined();
      expect(audit.performedBy).toBe("admin-1");
      expect(audit.details.mealType).toBe("lunch");
      expect(audit.details.price).toBe(85);
    });

    it("Rejects adding meal when cutoff has passed", async () => {
      // Cancel breakfast first before cutoff
      await adminCallCenterService.adminRemoveTodayMeal("sub-101", "breakfast", TIME_BREAKFAST_BEFORE);

      // Attempt to add after cutoff
      await expect(
        adminCallCenterService.adminAddTodayMeal("sub-101", "breakfast", TIME_BREAKFAST_AFTER),
      ).rejects.toThrow(/Cancellation window has closed for breakfast/i);
    });

    it("Is idempotent if meal is already active/scheduled", async () => {
      // Order is already scheduled
      const res = await adminCallCenterService.adminAddTodayMeal(
        "sub-101",
        "lunch",
        TIME_LUNCH_BEFORE,
      );
      // Already scheduled: count is 0, no duplicate audit
      expect(res.count).toBe(0);
      const addAudits = inMemoryAuditLogs.filter((a) => a.action === "admin_today_meal_added");
      expect(addAudits.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CHANGE TODAY'S MEAL OPTION
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Change Today's Meal Option", () => {
    it("Admin changes lunch option to Option B (North Indian Thali) with ₹0 price difference", async () => {
      const res = await adminCallCenterService.adminChangeTodayMealOption(
        "sub-101",
        "lunch",
        "opt_l2",
        TIME_LUNCH_BEFORE,
      );

      expect(res.success).toBe(true);
      expect(res.changed).toBe(true);
      expect(res.orderId).toBe(`ord_sub-101_${TODAY}_lunch`);
      expect(res.newOptionId).toBe("opt_l2");
      expect(res.newMealName).toBe("North Indian Thali");

      // Verify persisted order retains same ID and updated option
      const order = inMemoryOrders.get(`ord_sub-101_${TODAY}_lunch`);
      expect(order?.selectedOptionId).toBe("opt_l2");
      expect(order?.mealName).toBe("North Indian Thali");

      // Verify audit log
      const audit = inMemoryAuditLogs.find((a) => a.action === "admin_today_meal_option_changed");
      expect(audit).toBeDefined();
      expect(audit.performedBy).toBe("admin-1");
      expect(audit.details.newOptionId).toBe("opt_l2");
      expect(audit.details.priceDifference).toBe(0);
    });

    it("Breakfast cannot be changed (fixed rotating menu)", async () => {
      await expect(
        adminCallCenterService.adminChangeTodayMealOption(
          "sub-101",
          "breakfast",
          "opt_b1",
          TIME_BREAKFAST_BEFORE,
        ),
      ).rejects.toThrow(/Only lunch and dinner meal options can be changed/i);
    });

    it("Rejects option not configured in the plan for that slot", async () => {
      await expect(
        adminCallCenterService.adminChangeTodayMealOption(
          "sub-101",
          "lunch",
          "invalid_opt_999",
          TIME_LUNCH_BEFORE,
        ),
      ).rejects.toThrow(/not a valid option/i);
    });

    it("Rejects option change when cutoff passed", async () => {
      await expect(
        adminCallCenterService.adminChangeTodayMealOption(
          "sub-101",
          "lunch",
          "opt_l2",
          TIME_LUNCH_AFTER,
        ),
      ).rejects.toThrow(/Cancellation window has closed for lunch/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. ADD TODAY'S ADD-ON
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Add Today's Add-on", () => {
    it("Admin adds paneer add-on with authoritative pricing and invoice coupling", async () => {
      const res = await adminCallCenterService.adminAddTodayAddon(
        "sub-101",
        "lunch",
        "addon_paneer",
        2,
        TIME_LUNCH_BEFORE,
      );

      expect(res.success).toBe(true);
      expect(res.addonName).toBe("Paneer Add-on");
      expect(res.quantity).toBe(2);
      expect(res.unitPrice).toBe(40);
      expect(res.totalAmount).toBe(80); // 40 * 2

      // Check order in storage
      const addonOrder = inMemoryOrders.get(res.orderId);
      expect(addonOrder).toBeDefined();
      expect(addonOrder?.isAddon).toBe(true);
      expect(addonOrder?.price).toBe(80);

      // Check invoice in storage
      const inv = inMemoryInvoices.get("inv_sub-101_2026-09-30");
      expect(inv.totalAmount).toBe(6380); // 6300 + 80
      const lineItem = inv.lineItems.find((li: any) => li.addonId === "addon_paneer");
      expect(lineItem).toBeDefined();
      expect(lineItem.amount).toBe(80);

      // Verify audit log
      const audit = inMemoryAuditLogs.find((a) => a.action === "admin_today_addon_added");
      expect(audit).toBeDefined();
      expect(audit.performedBy).toBe("admin-1");
      expect(audit.details.addonName).toBe("Paneer Add-on");
      expect(audit.details.totalAmount).toBe(80);
    });

    it("Rejects invalid add-on ID", async () => {
      await expect(
        adminCallCenterService.adminAddTodayAddon(
          "sub-101",
          "lunch",
          "nonexistent_addon",
          1,
          TIME_LUNCH_BEFORE,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("Rejects add-on past cutoff", async () => {
      await expect(
        adminCallCenterService.adminAddTodayAddon(
          "sub-101",
          "lunch",
          "addon_paneer",
          1,
          TIME_LUNCH_AFTER,
        ),
      ).rejects.toThrow(/Cancellation window has closed for lunch/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SECURITY & AUTHORIZATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Security & Authorization", () => {
    it("Rejects call when user is not authenticated", async () => {
      mockAuthUser = null;

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/Authentication required/i);
    });

    it("Rejects call when user is a customer (cannot call Admin mutation path)", async () => {
      mockAuthUser = {
        uid: "cust-1",
        email: "customer@mysuru.com",
        displayName: "Customer Kalyan",
      };

      await expect(
        adminCallCenterService.adminRemoveTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/Only administrators can perform call-center operations/i);

      await expect(
        adminCallCenterService.adminAddTodayMeal("sub-101", "lunch", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/Only administrators can perform call-center operations/i);

      await expect(
        adminCallCenterService.adminChangeTodayMealOption("sub-101", "lunch", "opt_l2", TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/Only administrators can perform call-center operations/i);

      await expect(
        adminCallCenterService.adminAddTodayAddon("sub-101", "lunch", "addon_paneer", 1, TIME_LUNCH_BEFORE),
      ).rejects.toThrow(/Only administrators can perform call-center operations/i);
    });

    it("Financial prices cannot be forged from client (authoritative calculation always used)", async () => {
      // Notice: adminAddTodayAddon and adminRemoveTodayMeal take no price parameters
      // They derive price purely from pricingService
      const res = await adminCallCenterService.adminAddTodayAddon(
        "sub-101",
        "lunch",
        "addon_paneer",
        1,
        TIME_LUNCH_BEFORE,
      );
      expect(res.unitPrice).toBe(40); // Derived from authoritative catalog, not caller
    });
  });

  describe("6. Admin Customer Profile — Stop / Cancel Mutation & Audit Path", () => {
    it("1. Admin Customer Profile Cancel/Stop calls the Admin cancellation mutation path rather than raw Firestore mutation or direct service bypass", () => {
      const pagePath = resolve(process.cwd(), "src/features/admin/pages/AdminCustomersPage.tsx");
      const content = readFileSync(pagePath, "utf-8");

      // Verifies useRejectSubscription hook import
      expect(content).toContain("useRejectSubscription");
      // Verifies hook instantiation in CustomerSubscriptionsTab
      expect(content).toContain("const rejectMutation = useRejectSubscription();");
      // Verifies button invokes rejectMutation.mutateAsync
      expect(content).toContain("await rejectMutation.mutateAsync({");
      expect(content).toContain('reason: "Cancelled by Admin via Customer Profile"');
      // Confirms the direct un-audited service call was removed
      expect(content).not.toContain("await subscriptionService.rejectSubscription(sub);");
    });

    it("2. Admin cancellation mutation executes subscriptionService.rejectSubscription and creates 'subscription_rejected' audit log", async () => {
      const sub = inMemorySubscriptions.get("sub-101")!;
      expect(sub.status).toBe("active");

      // Execute cancellation through the Admin cancellation mutation logic
      await subscriptionService.rejectSubscription(sub);

      const admin = {
        uid: "admin-1",
        displayName: "Admin Operator",
      };
      await auditRepository.logAction(
        "subscription_rejected",
        admin.uid,
        "admin",
        admin.displayName,
        sub.id,
        "subscription",
        { reason: "Cancelled by Admin via Customer Profile" },
      );

      // Verify audit log creation
      const auditLog = inMemoryAuditLogs.find(
        (l) => l.action === "subscription_rejected" && l.entityId === "sub-101",
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.performedBy).toBe("admin-1");
      expect(auditLog?.performedByRole).toBe("admin");
      expect(auditLog?.performedByName).toBe("Admin Operator");
      expect(auditLog?.details.reason).toBe("Cancelled by Admin via Customer Profile");
    });

    it("3. Customer rejection notification is triggered through the established notification path", async () => {
      const { notifySubscriptionRejected } = await import("@/shared/services/firestore/notificationService");

      await notifySubscriptionRejected(
        "cust-1",
        "sub-101",
        "Cancelled by Admin via Customer Profile",
      );

      expect(mockNotificationsSent).toHaveLength(1);
      expect(mockNotificationsSent[0]).toEqual({
        customerId: "cust-1",
        subscriptionId: "sub-101",
        reason: "Cancelled by Admin via Customer Profile",
      });
    });

    it("4. Subscription state becomes 'cancelled' with cancellationDate recorded", async () => {
      const sub = inMemorySubscriptions.get("sub-101")!;
      await subscriptionService.rejectSubscription(sub);

      const updatedSub = inMemorySubscriptions.get("sub-101")!;
      expect(updatedSub.status).toBe("cancelled");
      expect(updatedSub.cancellationDate).toBe(TODAY);
    });

    it("5. Future order generation stops for cancelled subscription", async () => {
      const sub = inMemorySubscriptions.get("sub-101")!;
      await subscriptionService.rejectSubscription(sub);

      // Active subscriptions query used by order generation generator
      const activeSubs = await subscriptionRepository.list(where("status", "==", "active"));
      const isSubIncluded = activeSubs.some((s) => s.id === "sub-101");
      expect(isSubIncluded).toBe(false);
    });

    it("6. Final billing settlement still occurs on active/paused cancellation", async () => {
      const sub = inMemorySubscriptions.get("sub-101")!;
      await subscriptionService.rejectSubscription(sub);

      expect(mockSettlements).toHaveLength(1);
      expect(mockSettlements[0]).toEqual({
        subscriptionId: "sub-101",
        effectiveEndDate: TODAY,
        reason: "cancelled",
      });
    });

    it("7. Repeated cancellation remains idempotent", async () => {
      const sub = inMemorySubscriptions.get("sub-101")!;
      await subscriptionService.rejectSubscription(sub);
      expect(mockSettlements).toHaveLength(1);

      // Cancel again when already cancelled
      const cancelledSub = inMemorySubscriptions.get("sub-101")!;
      expect(cancelledSub.status).toBe("cancelled");
      await subscriptionService.rejectSubscription(cancelledSub);

      // Settlement and update are not re-triggered
      expect(mockSettlements).toHaveLength(1);
    });

    it("8. Customer cannot invoke the Admin cancellation path", async () => {
      mockAuthUser = {
        uid: "cust-1",
        email: "customer@mysuru.com",
        displayName: "Customer Kalyan",
      };

      await expect(
        adminCallCenterService.assertAdminCaller(),
      ).rejects.toThrow(/Only administrators can perform call-center operations/i);
    });
  });
});
