import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Subscription } from "@/shared/types";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
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
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auth } from "@/shared/lib/firebase";

describe("Phase D.3 — removeTodayMeal Comprehensive Verification Suite", () => {
  const TODAY = "2026-08-01"; // Saturday

  // Cutoff test timestamps in IST (UTC+05:30)
  const TIME_BREAKFAST_BEFORE = new Date("2026-08-01T04:59:00+05:30");
  const TIME_BREAKFAST_EXACT = new Date("2026-08-01T05:00:00+05:30");
  const TIME_BREAKFAST_AFTER = new Date("2026-08-01T05:01:00+05:30");

  const TIME_LUNCH_BEFORE = new Date("2026-08-01T10:29:00+05:30");
  const TIME_LUNCH_EXACT = new Date("2026-08-01T10:30:00+05:30");
  const TIME_LUNCH_AFTER = new Date("2026-08-01T10:31:00+05:30");

  const TIME_DINNER_BEFORE = new Date("2026-08-01T15:59:00+05:30");
  const TIME_DINNER_EXACT = new Date("2026-08-01T16:00:00+05:30");
  const TIME_DINNER_AFTER = new Date("2026-08-01T16:01:00+05:30");

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
    pricingMatrixSnapshot: {
      breakfast: 60,
      lunch: 85,
      dinner: 85,
    } as any,
    deliveryAddressId: "addr-1",
    billingCycle: "monthly",
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  } as unknown as Subscription;

  const breakfastOrder: Order = {
    id: "ord_sub-1_2026-08-01_breakfast",
    subscriptionId: "sub-1",
    customerId: "cust-1",
    date: TODAY,
    mealType: "breakfast",
    status: "scheduled",
    price: 60,
    currency: "INR",
  } as Order;

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

  const dinnerOrder: Order = {
    id: "ord_sub-1_2026-08-01_dinner",
    subscriptionId: "sub-1",
    customerId: "cust-1",
    date: TODAY,
    mealType: "dinner",
    status: "scheduled",
    price: 85,
    currency: "INR",
  } as Order;

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryOrders.clear();
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

    inMemoryOrders.set(breakfastOrder.id, { ...breakfastOrder });
    inMemoryOrders.set(lunchOrder.id, { ...lunchOrder });
    inMemoryOrders.set(dinnerOrder.id, { ...dinnerOrder });
  });

  // A. breakfast removal before cutoff
  it("A. breakfast removal before cutoff succeeds and cancels order", async () => {
    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.cancellationAmount).toBe(60);
    expect(result.status).toBe("cancelled");
    expect(inMemoryOrders.get(breakfastOrder.id)?.status).toBe("cancelled");
  });

  // B. lunch removal before cutoff
  it("B. lunch removal before cutoff succeeds and cancels order", async () => {
    const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.cancellationAmount).toBe(85);
    expect(result.status).toBe("cancelled");
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("cancelled");
  });

  // C. dinner removal before cutoff
  it("C. dinner removal before cutoff succeeds and cancels order", async () => {
    const result = await orderService.removeTodayMeal("sub-1", "dinner", TIME_DINNER_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.cancellationAmount).toBe(85);
    expect(result.status).toBe("cancelled");
    expect(inMemoryOrders.get(dinnerOrder.id)?.status).toBe("cancelled");
  });

  // D. exact breakfast cutoff
  it("D. exact breakfast cutoff (05:00 IST) is strictly rejected", async () => {
    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for breakfast/);
    expect(inMemoryOrders.get(breakfastOrder.id)?.status).toBe("scheduled");
  });

  // E. exact lunch cutoff
  it("E. exact lunch cutoff (10:30 IST) is strictly rejected", async () => {
    await expect(
      orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("scheduled");
  });

  // F. exact dinner cutoff
  it("F. exact dinner cutoff (16:00 IST) is strictly rejected", async () => {
    await expect(
      orderService.removeTodayMeal("sub-1", "dinner", TIME_DINNER_EXACT),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
    expect(inMemoryOrders.get(dinnerOrder.id)?.status).toBe("scheduled");
  });

  // G. after cutoff
  it("G. after cutoff is rejected for all meal types", async () => {
    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for breakfast/);

    await expect(
      orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for lunch/);

    await expect(
      orderService.removeTodayMeal("sub-1", "dinner", TIME_DINNER_AFTER),
    ).rejects.toThrow(/Cancellation window has closed for dinner/);
  });

  // H. subscription not started
  it("H. subscription not started is rejected", async () => {
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce({
      ...baseSubscription,
      startDate: "2026-09-01",
    });

    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/hasn't started yet/);
  });

  // I. subscription expired
  it("I. subscription expired is rejected", async () => {
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce({
      ...baseSubscription,
      endDate: "2026-07-01",
    });

    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/has already ended/);
  });

  // J. invalid/ineligible meal
  it("J. meal not in subscription meal preferences is rejected", async () => {
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce({
      ...baseSubscription,
      mealPreferences: [{ mealType: "lunch", selectedOptionId: null }],
    });

    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/not part of subscription/);
  });

  // K. paused/skipped meal according to existing behavior
  it("K. paused or already skipped meal behaves idempotently", async () => {
    // When order is already skipped/cancelled
    inMemoryOrders.set(breakfastOrder.id, {
      ...breakfastOrder,
      status: "skipped",
    });

    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.status).toBe("skipped");
    expect(inMemoryAuditLogs.length).toBe(0);
  });

  // L. missing order
  it("L. missing order throws descriptive error", async () => {
    inMemoryOrders.delete(breakfastOrder.id);

    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/Order not found for breakfast/);
  });

  // M. already-cancelled order
  it("M. already-cancelled order is an idempotent no-op without duplicate effects", async () => {
    inMemoryOrders.set(breakfastOrder.id, {
      ...breakfastOrder,
      status: "cancelled",
    });

    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.status).toBe("cancelled");
    expect(inMemoryAuditLogs.length).toBe(0);
  });

  // N. active order
  it("N. active order transitions to cancelled status", async () => {
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("scheduled");
    const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(inMemoryOrders.get(lunchOrder.id)?.status).toBe("cancelled");
  });

  // O. owner allowed
  it("O. authenticated customer owning subscription is allowed", async () => {
    (auth as any).currentUser = { uid: "cust-1", email: "cust1@example.com" };
    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
  });

  // P. non-owner denied
  it("P. non-owner customer is denied with Unauthorized", async () => {
    (auth as any).currentUser = { uid: "cust-2", email: "cust2@example.com" };
    await expect(
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ).rejects.toThrow(/Unauthorized/);
  });

  // Q. admin behavior
  it("Q. authorized admin can remove meal for customer subscription", async () => {
    (auth as any).currentUser = { uid: "admin-1", email: "admin@example.com" };
    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(true);
  });

  // R. standard cancellation price
  it("R. standard cancellation price matches pricing matrix (₹60 breakfast)", async () => {
    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.cancellationAmount).toBe(60);
  });

  // S. negotiated cancellation price
  it("S. negotiated cancellation price matches negotiated override (₹75 breakfast)", async () => {
    vi.mocked(subscriptionRepository.getById).mockResolvedValueOnce({
      ...baseSubscription,
      negotiatedPricing: {
        breakfast: 75,
        lunch: 95,
        dinner: 95,
      } as any,
    });

    const result = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(result.cancellationAmount).toBe(75);
  });

  // T. repeated cancellation idempotency
  it("T. repeated cancellation calls produce no duplicate effects", async () => {
    const res1 = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(res1.cancelled).toBe(true);
    expect(inMemoryAuditLogs.length).toBe(1);

    const res2 = await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);
    expect(res2.cancelled).toBe(false);
    expect(res2.success).toBe(true);
    // Audit log count must remain 1 — no duplicate financial/audit adjustment
    expect(inMemoryAuditLogs.length).toBe(1);
  });

  // U. concurrent cancellation
  it("U. concurrent cancellation requests execute safely without double mutations", async () => {
    const [res1, res2] = await Promise.all([
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
      orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const cancelledCount = [res1.cancelled, res2.cancelled].filter(Boolean).length;
    // Exactly one operation performs the transition, the other is an idempotent no-op
    expect(cancelledCount).toBe(1);
    expect(inMemoryAuditLogs.length).toBe(1);
    expect(inMemoryOrders.get(breakfastOrder.id)?.status).toBe("cancelled");
  });

  // V. actual Firestore persisted state
  it("V. persisted Firestore state verifies order, audit logs, skip subcollection, and unaffected meals", async () => {
    await orderService.removeTodayMeal("sub-1", "breakfast", TIME_BREAKFAST_BEFORE);

    // 1. Target order updated to cancelled
    const persistedBreakfast = inMemoryOrders.get(breakfastOrder.id);
    expect(persistedBreakfast).toBeDefined();
    expect(persistedBreakfast?.status).toBe("cancelled");
    expect(persistedBreakfast?.subscriptionId).toBe("sub-1");
    expect(persistedBreakfast?.customerId).toBe("cust-1");
    expect(persistedBreakfast?.mealType).toBe("breakfast");
    expect(persistedBreakfast?.date).toBe(TODAY);

    // 2. Unaffected meals remain scheduled
    const persistedLunch = inMemoryOrders.get(lunchOrder.id);
    const persistedDinner = inMemoryOrders.get(dinnerOrder.id);
    expect(persistedLunch?.status).toBe("scheduled");
    expect(persistedDinner?.status).toBe("scheduled");

    // 3. Skip record in subscription subcollection
    const skipRecord = inMemorySkips.get("sub-1_2026-08-01");
    expect(skipRecord).toBeDefined();
    expect(skipRecord.mealTypes).toContain("breakfast");

    // 4. Audit log entry recorded with accurate details
    expect(inMemoryAuditLogs.length).toBe(1);
    const audit = inMemoryAuditLogs[0];
    expect(audit.action).toBe("meal_cancelled");
    expect(audit.entityId).toBe(breakfastOrder.id);
    expect(audit.details.mealType).toBe("breakfast");
    expect(audit.details.cancellationAmount).toBe(60);
  });
});
