import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription, Invoice } from "@/shared/types";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemoryInvoices: Map<string, Invoice> = new Map();
const inMemoryWorkflowHistory: Map<string, any[]> = new Map();
const inMemorySkips: Map<string, any> = new Map();
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
        get: vi.fn(async (docRef: any) => {
          if (docRef.collectionName === "orders" || docRef.path?.startsWith("orders/")) {
            const order = inMemoryOrders.get(docRef.id);
            return {
              exists: () => !order ? false : true,
              data: () => (order ? { ...order } : undefined),
            };
          }
          if (docRef.collectionName === "invoices" || docRef.path?.startsWith("invoices/")) {
            const invoice = inMemoryInvoices.get(docRef.id);
            return {
              exists: () => !invoice ? false : true,
              data: () => (invoice ? { ...invoice } : undefined),
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
          } else if (docRef.collectionName === "invoices" || docRef.path?.startsWith("invoices/")) {
            const current = inMemoryInvoices.get(docRef.id);
            if (current) {
              inMemoryInvoices.set(docRef.id, { ...current, ...data });
            }
          }
        }),
        set: vi.fn((docRef: any, data: any) => {
          if (docRef.collectionName === "workflowHistory") {
            const orderId = docRef.orderId;
            const list = inMemoryWorkflowHistory.get(orderId) || [];
            list.push(data);
            inMemoryWorkflowHistory.set(orderId, list);
          }
        }),
      };
      await cb(txn);
    });
    txnQueue = run.catch(() => {});
    return run;
  }),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 2) {
      return { collectionName: parts[0], id: parts[1], path: `${parts[0]}/${parts[1]}` };
    }
    if (parts.length === 4 && parts[0] === "orders" && parts[2] === "workflowHistory") {
      return { collectionName: "workflowHistory", orderId: parts[1], id: parts[3] || "mock-hist-id", path: `orders/${parts[1]}/workflowHistory/${parts[3] || "mock-hist-id"}` };
    }
    return { id: parts[parts.length - 1], path: parts.join("/") };
  }),
  collection: vi.fn((_db, ...parts) => ({
    path: parts.join("/"),
    withConverter: vi.fn((converter) => ({ converter, type: "collection" })),
  })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((...args) => ({ args })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => "2026-08-01T04:00:00.000Z"),
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => {
  const actualRepo = {
    getById: vi.fn(),
    addSkip: vi.fn(async (subscriptionId, date, mealTypes, reason, uid) => {
      inMemorySkips.set(`${subscriptionId}_${date}`, {
        subscriptionId,
        date,
        mealTypes,
        reason,
        uid,
      });
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
import { pricingService } from "../pricingService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auth } from "@/shared/lib/firebase";

describe("Phase D.5 — Today's Meal Cancellation Pricing & Separation Suite", () => {
  const TODAY = "2026-08-01"; // Saturday
  const TIME_LUNCH_BEFORE = new Date("2026-08-01T10:20:00+05:30");

  const baseSubscription: Subscription = {
    id: "sub-1",
    customerId: "cust-1",
    planId: "plan-1",
    planTier: "regular",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    quantity: 1,
    mealPreferences: [
      { mealType: "breakfast", selectedOptionId: null },
      { mealType: "lunch", selectedOptionId: null },
      { mealType: "dinner", selectedOptionId: null },
    ],
    deliveryAddressId: "addr-1",
    billingCycle: "monthly",
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  } as unknown as Subscription;

  const lunchOrder: Order = {
    id: "ord_sub-1_2026-08-01_lunch",
    subscriptionId: "sub-1",
    customerId: "cust-1",
    date: TODAY,
    mealType: "lunch",
    status: "scheduled",
    price: 85,
    currency: "INR",
  } as Order;

  const lunchAddonOrder: Order = {
    id: "ord_sub-1_2026-08-01_lunch_addon_addon_paneer",
    subscriptionId: "sub-1",
    customerId: "cust-1",
    date: TODAY,
    mealType: "lunch",
    isAddon: true,
    addonId: "addon_paneer",
    addonName: "Paneer Add-on",
    addonQuantity: 1,
    addonUnitPrice: 40,
    status: "scheduled",
    price: 40,
    currency: "INR",
  } as Order;

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryOrders.clear();
    inMemoryInvoices.clear();
    inMemoryWorkflowHistory.clear();
    inMemorySkips.clear();
    inMemoryAuditLogs.length = 0;
    txnQueue = Promise.resolve();

    (auth as any).currentUser = {
      uid: "cust-1",
      email: "cust1@example.com",
      displayName: "Customer 1",
    };

    vi.mocked(subscriptionRepository.getById).mockResolvedValue({ ...baseSubscription });
    inMemoryOrders.set(lunchOrder.id, { ...lunchOrder });
    inMemoryOrders.set(lunchAddonOrder.id, { ...lunchAddonOrder });
  });

  // 1. Authoritative cancellation calculation matches PricingService
  it("authoritative calculation: UI amount matches PricingService.calculateCancellationAmount", () => {
    const sub = { ...baseSubscription };
    const amount = pricingService.calculateCancellationAmount(sub, ["lunch"]);
    expect(amount).toBe(85); // regular lunch fallback is 85
  });

  // 2. Cancellation respecting snapshot pricing
  it("calculates cancellation using pricingMatrixSnapshot over fallback matrix", async () => {
    const subWithSnapshot = {
      ...baseSubscription,
      pricingMatrixSnapshot: {
        breakfast: 65,
        lunch: 90,
        dinner: 90,
      } as any,
    };
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce(subWithSnapshot);

    const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(result.cancellationAmount).toBe(90);
  });

  // 3. Cancellation respecting negotiated pricing precedence
  it("calculates cancellation using negotiatedPricing over snapshot and fallback", async () => {
    const subWithNegotiated = {
      ...baseSubscription,
      pricingMatrixSnapshot: {
        lunch: 90,
      } as any,
      negotiatedPricing: {
        lunch: 105,
      } as any,
    };
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce(subWithNegotiated);

    const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    // Negotiated pricing is 105
    expect(result.cancellationAmount).toBe(105);
  });

  // 4. Add-on remains separate from cancellation
  it("cancelling today's lunch subscription meal does NOT cancel or subtract the lunch add-on", async () => {
    // Both standard lunch order and lunch add-on order exist
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("scheduled");
    expect(inMemoryOrders.get(lunchAddonOrder.id)?.status).toBe("scheduled");

    const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.orderId).toBe(lunchOrder.id);
    expect(result.cancellationAmount).toBe(85);

    // Standard lunch order transitions to cancelled
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("cancelled");

    // CRITICAL: Lunch add-on order remains intact and scheduled!
    const persistedAddon = inMemoryOrders.get(lunchAddonOrder.id);
    expect(persistedAddon).toBeDefined();
    expect(persistedAddon?.status).toBe("scheduled");
    expect(persistedAddon?.price).toBe(40);
    expect(persistedAddon?.addonUnitPrice).toBe(40);
  });

  // 5. Repeated cancellation idempotency
  it("repeated cancellation is a safe idempotent no-op without duplicate financial effects", async () => {
    const res1 = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(res1.cancelled).toBe(true);
    expect(inMemoryAuditLogs.length).toBe(1);

    const res2 = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(res2.cancelled).toBe(false);
    expect(res2.success).toBe(true);
    // Audit log count must remain 1
    expect(inMemoryAuditLogs.length).toBe(1);
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("cancelled");
  });

  // 6. Canonical precedence matrix assertions
  describe("Canonical 3-Tier Precedence: negotiatedPricing -> pricingMatrixSnapshot -> fallback", () => {
    it("Tier 1: negotiatedPricing wins over pricingMatrixSnapshot and fallback", () => {
      const sub: Subscription = {
        ...baseSubscription,
        pricingMatrixSnapshot: { breakfast: 70, lunch: 95, dinner: 95 },
        negotiatedPricing: { breakfast: 75, lunch: 110 },
      } as any;
      // For breakfast: negotiated (75) wins over snapshot (70) and fallback (60)
      expect(pricingService.calculateCancellationAmount(sub, ["breakfast"])).toBe(75);
      // For lunch: negotiated (110) wins over snapshot (95) and fallback (85)
      expect(pricingService.calculateCancellationAmount(sub, ["lunch"])).toBe(110);
      // For dinner: negotiated not set -> snapshot (95) wins over fallback (85)
      expect(pricingService.calculateCancellationAmount(sub, ["dinner"])).toBe(95);
    });

    it("Tier 2: pricingMatrixSnapshot is used when negotiatedPricing is absent", () => {
      const sub: Subscription = {
        ...baseSubscription,
        pricingMatrixSnapshot: { breakfast: 68, lunch: 92, dinner: 92 },
      } as any;
      expect(pricingService.calculateCancellationAmount(sub, ["breakfast"])).toBe(68);
      expect(pricingService.calculateCancellationAmount(sub, ["lunch"])).toBe(92);
      expect(pricingService.calculateCancellationAmount(sub, ["dinner"])).toBe(92);
    });

    it("Tier 3: fallback is used when neither negotiatedPricing nor pricingMatrixSnapshot exists", () => {
      const sub: Subscription = {
        ...baseSubscription,
        planTier: "regular",
      } as any;
      // Regular fallback: breakfast=60, lunch=85, dinner=85
      expect(pricingService.calculateCancellationAmount(sub, ["breakfast"])).toBe(60);
      expect(pricingService.calculateCancellationAmount(sub, ["lunch"])).toBe(85);
      expect(pricingService.calculateCancellationAmount(sub, ["dinner"])).toBe(85);
    });

    it("Add-on pricing does not affect subscription meal cancellation amount", () => {
      const sub: Subscription = {
        ...baseSubscription,
        pricingMatrixSnapshot: { lunch: 85 },
      } as any;
      const cancelAmount = pricingService.calculateCancellationAmount(sub, ["lunch"]);
      const addonPrice = pricingService.calculateAddonPrice("addon_paneer", 2);

      // Subscription cancellation amount is exactly 85
      expect(cancelAmount).toBe(85);
      // Addon total is 80 (40 * 2)
      expect(addonPrice.total).toBe(80);
      // Cancellation amount is strictly independent of add-on price
      expect(cancelAmount).not.toBe(cancelAmount + addonPrice.total);
    });
  });
});
