import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "../billingService";
import type { Subscription, Order } from "@/shared/types";

let mockFirestoreDocs: Record<string, any> = {};

vi.mock("@/shared/lib/firebase", () => ({
  functions: {},
  db: {},
  auth: { currentUser: { uid: "mock-uid" } },
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    runTransaction: vi.fn(async (_db, cb) => {
      const txn = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          const path = ref.path || `${ref.collectionName}/${ref.id}`;
          const data = mockFirestoreDocs[path] || mockFirestoreDocs[ref.id];
          return {
            exists: () => !!data,
            data: () => data,
          };
        }),
        set: vi.fn((ref: any, data: any) => {
          const path = ref.path || `${ref.collectionName}/${ref.id}`;
          mockFirestoreDocs[path] = data;
          mockFirestoreDocs[ref.id] = data;
        }),
        update: vi.fn((ref: any, data: any) => {
          const path = ref.path || `${ref.collectionName}/${ref.id}`;
          const existing = mockFirestoreDocs[path] || mockFirestoreDocs[ref.id] || {};
          const updated = { ...existing, ...data };
          mockFirestoreDocs[path] = updated;
          mockFirestoreDocs[ref.id] = updated;
        }),
      };
      await cb(txn);
      return txn;
    }),
    doc: vi.fn((_db, collectionName, id) => ({
      collectionName,
      id,
      path: `${collectionName}/${id}`,
    })),
    getDoc: vi.fn().mockImplementation(async (ref: any) => {
      const path = ref.path || `${ref.collectionName}/${ref.id}`;
      const data = mockFirestoreDocs[path] || mockFirestoreDocs[ref.id];
      return {
        exists: () => !!data,
        data: () => data,
      };
    }),
    serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP"),
  };
});

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    list: vi.fn(),
    getCustomerOrdersInRange: vi.fn(),
    getBySubscriptionId: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/paymentRepository", () => ({
  paymentRepository: {
    getByCustomerId: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue("mock-audit-id"),
  },
}));

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    logFailure: vi.fn().mockResolvedValue("mock-fq-id"),
  },
}));

vi.mock("@/shared/services/firestore/settingsRepository", () => ({
  settingsRepository: {
    getBusinessSettings: vi.fn().mockResolvedValue({
      financials: { invoicePrefix: "INV" },
    }),
  },
}));

describe("Phase 6H: Final Billing Boundary Verification", () => {
  const customerId = "cust_p6h_1";
  const subscriptionId = "sub_p6h_1";

  const baseSubscription: Subscription = {
    id: subscriptionId,
    customerId,
    planId: "plan_standard",
    planTier: "regular",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    billingCycle: "monthly",
    autoRenew: true,
    quantity: 1,
    pricePerDaySnapshot: 100,
    depositAmount: 0,
    deliveryAddressId: "addr_1",
    zoneId: "zone_1",
    latestPaymentId: null,
    mealPreferences: [],
    pricingMatrixSnapshot: { lunch: 100 } as any,
    createdAt: "MOCK_TIMESTAMP" as any,
    updatedAt: "MOCK_TIMESTAMP" as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreDocs = {};
  });

  // ---------------------------------------------------------------------------
  // Condition 1: Initial billing when no lastBilledDate exists
  // ---------------------------------------------------------------------------
  it("Condition 6: Initial billing when no lastBilledDate exists starts strictly at subscription.startDate", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const subWithoutLastBilled: Subscription = {
      ...baseSubscription,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      lastBilledDate: undefined,
    };

    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_init_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(subWithoutLastBilled, "2026-10-01", "expired");

    const invoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`];
    expect(invoice).toBeDefined();
    expect(invoice.billingPeriodStart).toBe("2026-09-01");
    expect(invoice.billingPeriodEnd).toBe("2026-09-30");

    const updatedSub = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(updatedSub.lastBilledDate).toBe("2026-09-30");
    expect(updatedSub.lastInvoiceId).toBe(`inv_${subscriptionId}_2026-09-30`);
    expect(updatedSub.startDate).toBe("2026-10-01");
    expect(updatedSub.endDate).toBe("2026-10-31");
  });

  // ---------------------------------------------------------------------------
  // Condition 2: Billing performed LATER than expected cycle-end date
  // ---------------------------------------------------------------------------
  it("Condition 3: Billing performed 5 days late strictly preserves cycle boundaries and excludes subsequent meals", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    // Subscription cycle ended on 2026-09-30, but billing cron runs on 2026-10-05 (5 days late)
    const lateSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      lastBilledDate: undefined,
    };

    // Orders include both September meals and meals delivered in early October
    const allOrders: Order[] = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `ord_sep_${i + 1}`,
        subscriptionId,
        customerId,
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order)),
      {
        id: "ord_oct_01",
        subscriptionId,
        customerId,
        date: "2026-10-01",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
      {
        id: "ord_oct_03",
        subscriptionId,
        customerId,
        date: "2026-10-03",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(allOrders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    // Execution date is 2026-10-05
    await billingService.processSubscriptionEnd(lateSub, "2026-10-05", "expired");

    // Invoice must be keyed by effectiveEndDate (2026-09-30), NOT processing date (2026-10-05)
    const invoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`];
    expect(invoice).toBeDefined();
    expect(invoice.billingPeriodStart).toBe("2026-09-01");
    expect(invoice.billingPeriodEnd).toBe("2026-09-30");

    // Must bill ONLY the 30 September meals (₹3,000), strictly excluding October meals!
    expect(invoice.totalAmount).toBe(3000);
    expect(invoice.lineItems.length).toBe(1);
    expect(invoice.lineItems[0].description).toBe("REGULAR Plan (monthly)");

    // Subscription lastBilledDate must be 2026-09-30, and next period must start 2026-10-01 (not 2026-10-06!)
    const updatedSub = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(updatedSub.lastBilledDate).toBe("2026-09-30");
    expect(updatedSub.startDate).toBe("2026-10-01");
    expect(updatedSub.endDate).toBe("2026-10-31");
  });

  // ---------------------------------------------------------------------------
  // Condition 3: Delayed or retried billing after interruption
  // ---------------------------------------------------------------------------
  it("Condition 4: Retrying invoice generation for same cycle does not alter invoice and remains idempotent", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const sub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
      lastInvoiceId: `inv_${subscriptionId}_2026-09-30`,
    };

    const orders: Order[] = Array.from({ length: 31 }, (_, i) => ({
      id: `ord_oct_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    // Run 1: Normal processing for October cycle
    await billingService.processSubscriptionEnd(sub, "2026-11-01", "expired");
    const inv1 = { ...mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`] };
    const subAfterRun1 = { ...mockFirestoreDocs[`subscriptions/${subscriptionId}`] };

    expect(inv1.billingPeriodStart).toBe("2026-10-01");
    expect(inv1.billingPeriodEnd).toBe("2026-10-31");
    expect(subAfterRun1.lastBilledDate).toBe("2026-10-31");
    expect(subAfterRun1.startDate).toBe("2026-11-01");
    expect(subAfterRun1.endDate).toBe("2026-11-30");

    // Run 2: Retry with original `sub` object (simulating retry of interrupted job)
    await billingService.processSubscriptionEnd(sub, "2026-11-01", "expired");

    // Invoice remains identical and unchanged
    const inv2 = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv2.totalAmount).toBe(inv1.totalAmount);
    expect(inv2.billingPeriodStart).toBe(inv1.billingPeriodStart);
    expect(inv2.billingPeriodEnd).toBe(inv1.billingPeriodEnd);

    // Subscription metadata is safe and reflects October settlement
    const subAfterRun2 = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(subAfterRun2.lastBilledDate).toBe("2026-10-31");
    expect(subAfterRun2.startDate).toBe("2026-11-01");
    expect(subAfterRun2.endDate).toBe("2026-11-30");

    // Run 3: Calling with sub that has lastInvoiceId already set to this invoice skips idempotently
    const subWithLastInvoice: Subscription = {
      ...sub,
      lastInvoiceId: `inv_${subscriptionId}_2026-10-31`,
      lastBilledDate: "2026-10-31",
    };
    const skipped = await billingService.processSubscriptionEnd(subWithLastInvoice, "2026-11-01", "expired");
    expect(skipped).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Condition 4: Previous invoice generated but subscription metadata not updated
  // ---------------------------------------------------------------------------
  it("Condition 5: When prior invoice exists but subscription metadata was uncommitted, heals metadata atomically without duplicate invoice", async () => {
    // Pre-seed September invoice in Firestore
    mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`] = {
      id: `inv_${subscriptionId}_2026-09-30`,
      invoiceNumber: "INV-CUST-000001",
      customerId,
      subscriptionId,
      lineItems: [],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 3000,
      collectedAmount: 3000,
      status: "paid",
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
    };

    // Subscription state was NOT updated (lastInvoiceId and lastBilledDate are undefined)
    const uncommittedSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      lastBilledDate: undefined,
      lastInvoiceId: undefined,
      autoRenew: true,
    };

    // Re-run billing for the ended period
    const result = await billingService.processSubscriptionEnd(uncommittedSub, "2026-10-01", "expired");
    expect(result).toBe(true);

    // Metadata is healed atomically
    const healedSub = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(healedSub.lastBilledDate).toBe("2026-09-30");
    expect(healedSub.lastInvoiceId).toBe(`inv_${subscriptionId}_2026-09-30`);
    expect(healedSub.startDate).toBe("2026-10-01");
    expect(healedSub.endDate).toBe("2026-10-31");
    expect(healedSub.status).toBe("active");

    // Existing invoice is completely untouched
    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`];
    expect(inv.totalAmount).toBe(3000);
  });

  // ---------------------------------------------------------------------------
  // Condition 5: Date and UTC arithmetic continuity
  // ---------------------------------------------------------------------------
  it("Condition 7: Consecutive months handle leap year and month-end UTC boundaries without drift", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    // February in leap year 2028 (29 days)
    const febSub: Subscription = {
      ...baseSubscription,
      startDate: "2028-02-01",
      endDate: "2028-02-29",
      lastBilledDate: "2028-01-31",
    };

    const febOrders: Order[] = Array.from({ length: 29 }, (_, i) => ({
      id: `ord_feb_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2028-02-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(febOrders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(febSub, "2028-03-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2028-02-29`];
    expect(inv.billingPeriodStart).toBe("2028-02-01");
    expect(inv.billingPeriodEnd).toBe("2028-02-29");

    const updatedSub = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(updatedSub.lastBilledDate).toBe("2028-02-29");
    expect(updatedSub.startDate).toBe("2028-03-01");
    expect(updatedSub.endDate).toBe("2028-03-31");
  });
});
