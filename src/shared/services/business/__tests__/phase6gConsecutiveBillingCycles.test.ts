import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "../billingService";
import type { Subscription, Order, ManualPayment } from "@/shared/types";
import {
  getInvoiceRemainingDue,
  getInvoiceRemainingToRefund,
} from "@/shared/types";

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

describe("Phase 6G — Consecutive Billing Cycles & Payment Allocation Verification", () => {
  const customerId = "cust_p6g_1";
  const subscriptionId = "sub_p6g_1";

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
  // 1. Core Consecutive Monthly Cycles
  // ---------------------------------------------------------------------------
  it("Core Scenario: ₹1,000 advance with September date and no invoiceId is credited only in September and never in October", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    // September orders: 30 days @ ₹100 = ₹3,000
    const septOrders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_sep_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    // October orders: 31 days @ ₹100 = ₹3,100
    const octOrders: Order[] = Array.from({ length: 31 }, (_, i) => ({
      id: `ord_oct_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValueOnce(septOrders);

    // ₹1,000 advance payment made in September with no invoiceId and no billingMonth
    const septAdvancePayment: ManualPayment = {
      id: "pay_sept_adv_1000",
      subscriptionId,
      customerId,
      customerName: "P6G Customer",
      amount: 1000,
      currency: "INR",
      paymentMethod: "upi",
      referenceNumber: "UPI-SEP-1000",
      paymentDate: "2026-09-15",
      status: "verified",
      purpose: "usage",
      verifiedBy: "admin_uid",
      verificationDate: "MOCK_TIMESTAMP" as any,
      verificationNotes: "Approved",
      screenshotUrl: null,
      billingMonth: "",
      invoiceId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
      updatedAt: "MOCK_TIMESTAMP" as any,
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([septAdvancePayment]);

    // Settle September cycle on 2026-10-01
    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-01", "expired");

    const septInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`];
    expect(septInvoice).toBeDefined();
    expect(septInvoice.totalAmount).toBe(3000);
    expect(septInvoice.paidAmount).toBe(1000);
    expect(septInvoice.collectedAmount).toBe(1000);
    expect(getInvoiceRemainingDue(septInvoice)).toBe(2000);
    expect(getInvoiceRemainingToRefund(septInvoice)).toBe(0);
    expect(septInvoice.status).toBe("issued");

    // Verify auto-renew updated the subscription in Firestore with next cycle bounds
    const updatedSub = mockFirestoreDocs[`subscriptions/${subscriptionId}`];
    expect(updatedSub).toBeDefined();
    expect(updatedSub.startDate).toBe("2026-10-01");
    expect(updatedSub.endDate).toBe("2026-10-31");
    expect(updatedSub.lastBilledDate).toBe("2026-09-30");

    // Now settle October cycle on 2026-11-01
    const octoberSub: Subscription = {
      ...baseSubscription,
      startDate: updatedSub.startDate,
      endDate: updatedSub.endDate,
      lastBilledDate: updatedSub.lastBilledDate,
      lastInvoiceId: updatedSub.lastInvoiceId,
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValueOnce(octOrders);
    // Payment repository still returns septAdvancePayment (historical receipt unchanged)
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([septAdvancePayment]);

    await billingService.processSubscriptionEnd(octoberSub, "2026-11-01", "expired");

    const octInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(octInvoice).toBeDefined();
    expect(octInvoice.totalAmount).toBe(3100);
    // September payment is strictly NOT applied to October!
    expect(octInvoice.paidAmount).toBe(0);
    expect(octInvoice.collectedAmount).toBe(0);
    expect(getInvoiceRemainingDue(octInvoice)).toBe(3100);
    expect(getInvoiceRemainingToRefund(octInvoice)).toBe(0);
    expect(octInvoice.status).toBe("issued");
  });

  // ---------------------------------------------------------------------------
  // 2. Weekly Consecutive Cycles
  // ---------------------------------------------------------------------------
  it("Weekly Cycles: Advance payment in Week 1 is applied only to Week 1 and never to Week 2", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const weeklySubWeek1: Subscription = {
      ...baseSubscription,
      billingCycle: "weekly",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    };

    const week1Orders: Order[] = Array.from({ length: 6 }, (_, i) => ({
      id: `ord_w1_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-09-0${i + 1}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const week2Orders: Order[] = Array.from({ length: 6 }, (_, i) => ({
      id: `ord_w2_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-09-${String(i + 8).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const week1Payment: ManualPayment = {
      id: "pay_w1_adv",
      subscriptionId,
      customerId,
      customerName: "Weekly Customer",
      amount: 600,
      currency: "INR",
      paymentMethod: "cash",
      referenceNumber: "CASH-W1",
      paymentDate: "2026-09-03",
      status: "verified",
      purpose: "usage",
      verifiedBy: "admin_uid",
      verificationDate: "MOCK_TIMESTAMP" as any,
      verificationNotes: "Approved",
      screenshotUrl: null,
      billingMonth: "",
      invoiceId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
      updatedAt: "MOCK_TIMESTAMP" as any,
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValueOnce(week1Orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([week1Payment]);

    await billingService.processSubscriptionEnd(weeklySubWeek1, "2026-09-08", "expired");

    const w1Invoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-07`];
    expect(w1Invoice).toBeDefined();
    expect(w1Invoice.totalAmount).toBe(600);
    expect(w1Invoice.paidAmount).toBe(600);
    expect(w1Invoice.collectedAmount).toBe(600);
    expect(w1Invoice.status).toBe("paid");

    const weeklySubWeek2: Subscription = {
      ...weeklySubWeek1,
      startDate: "2026-09-08",
      endDate: "2026-09-14",
      lastBilledDate: "2026-09-07",
      lastInvoiceId: `inv_${subscriptionId}_2026-09-07`,
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValueOnce(week2Orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([week1Payment]);

    await billingService.processSubscriptionEnd(weeklySubWeek2, "2026-09-15", "expired");

    const w2Invoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-14`];
    expect(w2Invoice).toBeDefined();
    expect(w2Invoice.totalAmount).toBe(600);
    // Week 1 cash advance is strictly NOT reused for Week 2!
    expect(w2Invoice.paidAmount).toBe(0);
    expect(w2Invoice.collectedAmount).toBe(0);
    expect(getInvoiceRemainingDue(w2Invoice)).toBe(600);
    expect(w2Invoice.status).toBe("issued");
  });

  // ---------------------------------------------------------------------------
  // 3. Tests 1 to 10: Date Boundaries, Attribution Metadata, Retries & Renewals
  // ---------------------------------------------------------------------------

  // Test 1: Payment inside current cycle
  it("Test 1: Payment inside current cycle is attributed and applied", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_t1_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_inside_oct",
        subscriptionId,
        customerId,
        amount: 1500,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-10-15",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(1500);
    expect(inv.collectedAmount).toBe(1500);
    expect(getInvoiceRemainingDue(inv)).toBe(1500);
  });

  // Test 2: Payment in previous cycle
  it("Test 2: Payment in previous cycle is excluded from current cycle", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = [
      {
        id: "ord_t2_1",
        subscriptionId,
        customerId,
        date: "2026-10-05",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_prev_sept",
        subscriptionId,
        customerId,
        amount: 100,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-09-20",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(0);
    expect(inv.collectedAmount).toBe(0);
    expect(getInvoiceRemainingDue(inv)).toBe(100);
  });

  // Test 3: Payment in future cycle
  it("Test 3: Payment in future cycle is excluded from current cycle", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = [
      {
        id: "ord_t3_1",
        subscriptionId,
        customerId,
        date: "2026-10-05",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_future_nov",
        subscriptionId,
        customerId,
        amount: 100,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-11-05",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(0);
    expect(inv.collectedAmount).toBe(0);
  });

  // Test 4: Payment with explicit invoiceId for another invoice
  it("Test 4: Payment linked to another invoice is excluded even if date or month matches", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = [
      {
        id: "ord_t4_1",
        subscriptionId,
        customerId,
        date: "2026-10-05",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_other_inv",
        subscriptionId,
        customerId,
        amount: 100,
        status: "verified",
        purpose: "usage",
        invoiceId: "inv_different_cycle_999",
        billingMonth: "2026-10",
        paymentDate: "2026-10-10",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(0);
    expect(inv.collectedAmount).toBe(0);
  });

  // Test 5: Payment with matching billingMonth
  it("Test 5: Payment with explicit billingMonth matches that cycle even if paid prior to cycle start", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ord_t5_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-0${i + 1}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    // Customer paid on Sept 28 with billingMonth = "2026-10"
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_oct_early_advance",
        subscriptionId,
        customerId,
        amount: 500,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-09-28",
        billingMonth: "2026-10",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(500);
    expect(inv.collectedAmount).toBe(500);
    expect(inv.status).toBe("paid");
  });

  // Test 6: Payment with missing or unusable date attribution
  it("Test 6: Payment with missing date and missing cycle metadata is excluded without guessing", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = [
      {
        id: "ord_t6_1",
        subscriptionId,
        customerId,
        date: "2026-10-05",
        mealType: "lunch",
        status: "delivered",
        price: 200,
      } as Order,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_unattributed_junk",
        subscriptionId,
        customerId,
        amount: 200,
        status: "verified",
        purpose: "usage",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(inv.paidAmount).toBe(0);
    expect(inv.collectedAmount).toBe(0);
  });

  // Test 7: Payments on exact cycle boundaries
  it("Test 7: Payments on exact cycle boundaries are handled precisely (inclusive bounds)", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_t7_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      // Exact start boundary (2026-10-01) -> INCLUDED
      {
        id: "pay_exact_start",
        subscriptionId,
        customerId,
        amount: 1000,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-10-01",
      } as any,
      // Exact end boundary (2026-10-31) -> INCLUDED
      {
        id: "pay_exact_end",
        subscriptionId,
        customerId,
        amount: 1000,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-10-31",
      } as any,
      // Prior cycle end boundary (2026-09-30) -> EXCLUDED
      {
        id: "pay_prior_boundary",
        subscriptionId,
        customerId,
        amount: 500,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-09-30",
      } as any,
      // Next cycle start boundary (2026-11-01) -> EXCLUDED
      {
        id: "pay_next_boundary",
        subscriptionId,
        customerId,
        amount: 500,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-11-01",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    // Exact start (1000) + exact end (1000) = 2000. Prior (500) and Next (500) excluded!
    expect(inv.paidAmount).toBe(2000);
    expect(inv.collectedAmount).toBe(2000);
    expect(getInvoiceRemainingDue(inv)).toBe(1000);
  });

  // Test 8: Payment returned more than once by query / retry
  it("Test 8: Duplicate payment entries in query result are de-duplicated by ID", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_t8_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const duplicatePayment = {
      id: "pay_duplicate_id_1",
      subscriptionId,
      customerId,
      amount: 1000,
      status: "verified",
      purpose: "usage",
      paymentDate: "2026-10-15",
    } as any;

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    // Simulating duplicated query result
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      duplicatePayment,
      duplicatePayment,
      duplicatePayment,
    ]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const inv = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    // Must be 1000, NOT 3000!
    expect(inv.paidAmount).toBe(1000);
    expect(inv.collectedAmount).toBe(1000);
  });

  // Test 9: Two consecutive invoice-generation attempts for the same billing cycle
  it("Test 9: Two consecutive invoice-generation attempts for the same billing cycle are idempotent", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
    };

    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_t9_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_t9",
        subscriptionId,
        customerId,
        amount: 1500,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-10-15",
      } as any,
    ]);

    // First execution
    const firstResult = await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");
    expect(firstResult).toBe(true);

    const invAfterFirst = { ...mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`] };
    expect(invAfterFirst.paidAmount).toBe(1500);

    // Second execution (retry)
    const secondResult = await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");
    expect(secondResult).toBe(true);

    const invAfterSecond = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(invAfterSecond.paidAmount).toBe(1500);
    expect(invAfterSecond.totalAmount).toBe(invAfterFirst.totalAmount);
    expect(invAfterSecond.collectedAmount).toBe(invAfterFirst.collectedAmount);
  });

  // Test 10: Subscription renewal where previous invoice has already been generated
  it("Test 10: Subscription renewal safely processes when previous invoice is already generated", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    // Pre-populate September invoice
    mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`] = {
      id: `inv_${subscriptionId}_2026-09-30`,
      invoiceNumber: "INV-CUST-000001",
      customerId,
      subscriptionId,
      lineItems: [],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 3000,
      collectedAmount: 3000,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
      dueDate: "2026-09-30",
      paidAt: null,
      paymentId: "pay_sept_settled",
      createdAt: "MOCK_TIMESTAMP" as any,
    };

    const octoberOrders: Order[] = Array.from({ length: 31 }, (_, i) => ({
      id: `ord_oct_t10_${i + 1}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const octoberPayment: ManualPayment = {
      id: "pay_oct_t10",
      subscriptionId,
      customerId,
      customerName: "P6G Customer",
      amount: 3100,
      currency: "INR",
      paymentMethod: "upi",
      referenceNumber: "UPI-OCT-3100",
      paymentDate: "2026-10-05",
      status: "verified",
      purpose: "usage",
      verifiedBy: "admin_uid",
      verificationDate: "MOCK_TIMESTAMP" as any,
      verificationNotes: "Approved",
      screenshotUrl: null,
      billingMonth: "2026-10",
      invoiceId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
      updatedAt: "MOCK_TIMESTAMP" as any,
    };

    const octSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      lastBilledDate: "2026-09-30",
      lastInvoiceId: `inv_${subscriptionId}_2026-09-30`,
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(octoberOrders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([octoberPayment]);

    await billingService.processSubscriptionEnd(octSub, "2026-11-01", "expired");

    const octInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(octInvoice).toBeDefined();
    expect(octInvoice.totalAmount).toBe(3100);
    expect(octInvoice.paidAmount).toBe(3100);
    expect(octInvoice.collectedAmount).toBe(3100);
    expect(octInvoice.status).toBe("paid");

    // Verify September invoice was never modified or reopened
    const septInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-09-30`];
    expect(septInvoice.totalAmount).toBe(3000);
    expect(septInvoice.paidAmount).toBe(3000);
    expect(septInvoice.status).toBe("paid");
  });

  // ---------------------------------------------------------------------------
  // 4. Subscription with Original Start Date Preserved Scenario
  // ---------------------------------------------------------------------------
  it("Subscription entity preserving lifetime startDate uses lastBilledDate to isolate current cycle bounds", async () => {
    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");

    // Subscription entity where startDate remains original signup date ("2026-09-01"),
    // but lastBilledDate indicates September was settled on 2026-09-30.
    const subWithLifetimeStart: Subscription = {
      ...baseSubscription,
      startDate: "2026-09-01", // Lifetime signup start date
      endDate: "2026-10-31",   // October cycle end
      lastBilledDate: "2026-09-30",
      lastInvoiceId: `inv_${subscriptionId}_2026-09-30`,
    };

    // Orders in database include both September orders and October orders
    const allOrders: Order[] = [
      {
        id: "ord_sept_old",
        subscriptionId,
        customerId,
        date: "2026-09-15",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
      {
        id: "ord_oct_new_1",
        subscriptionId,
        customerId,
        date: "2026-10-05",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
      {
        id: "ord_oct_new_2",
        subscriptionId,
        customerId,
        date: "2026-10-12",
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order,
    ];

    // Payments in database include September advance and October payment
    const allPayments: ManualPayment[] = [
      {
        id: "pay_sept_old",
        subscriptionId,
        customerId,
        amount: 100,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-09-10",
      } as any,
      {
        id: "pay_oct_new",
        subscriptionId,
        customerId,
        amount: 200,
        status: "verified",
        purpose: "usage",
        paymentDate: "2026-10-08",
      } as any,
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(allOrders);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue(allPayments);

    await billingService.processSubscriptionEnd(subWithLifetimeStart, "2026-11-01", "expired");

    const octInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-31`];
    expect(octInvoice).toBeDefined();

    // Only October orders (2 @ ₹100 = ₹200) are billed. September order is excluded!
    expect(octInvoice.totalAmount).toBe(200);

    // Only October payment (₹200) is applied. September payment is excluded!
    expect(octInvoice.paidAmount).toBe(200);
    expect(octInvoice.collectedAmount).toBe(200);
    expect(getInvoiceRemainingDue(octInvoice)).toBe(0);
    expect(octInvoice.status).toBe("paid");

    // Billing period start must be 2026-10-01 (day after lastBilledDate), NOT 2026-09-01!
    expect(octInvoice.billingPeriodStart).toBe("2026-10-01");
    expect(octInvoice.billingPeriodEnd).toBe("2026-10-31");
  });
});
