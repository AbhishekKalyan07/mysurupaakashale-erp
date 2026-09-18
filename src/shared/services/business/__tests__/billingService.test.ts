import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { orderRepository } from "@/shared/services/firestore/orderRepository";

vi.mock("@/shared/lib/firebase", () => ({
  functions: {},

  db: {},
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    runTransaction: vi.fn(async (_db, cb) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn(),
        update: vi.fn(),
      };
      await cb(txn);
      return txn;
    }),
    doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP"),
  };
});

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    list: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    logFailure: vi.fn().mockResolvedValue("mock-fq-id"),
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
    getByCustomerId: vi.fn().mockResolvedValue([]),
  },
}));

import { billingService } from "../billingService";

describe("billingService.processDailyBilling - Pricing Matrix Snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses pricingMatrixSnapshot when present on subscription", async () => {
    const mockSub = {
      id: "sub1",
      customerId: "cust1",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      pricingMatrixSnapshot: {
        breakfast: 50,
        lunch: 70,
        dinner: 70,
        breakfast_lunch: 110,
        lunch_dinner: 110,
        breakfast_dinner: 110,
        breakfast_lunch_dinner: 160,
      },
    };

    const mockOrders = [
      {
        id: "ord1",
        subscriptionId: "sub1",
        status: "delivered",
        date: "2026-07-15",
        mealType: "lunch",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");

    // Check what was set in the transaction
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses snapshot price 70 instead of regular live matrix price 85
    expect(setPayload.totalAmount).toBe(70);
  });

  it("falls back to live static PRICING_MATRIX when pricingMatrixSnapshot is undefined", async () => {
    const mockSub = {
      id: "sub2",
      customerId: "cust2",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
    };

    const mockOrders = [
      {
        id: "ord2",
        subscriptionId: "sub2",
        status: "delivered",
        date: "2026-07-15",
        mealType: "lunch",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses live price 85
    expect(setPayload.totalAmount).toBe(85);
  });

  it("auto-renews subscription when autoRenew is true", async () => {
    const mockSub = {
      id: "sub3",
      customerId: "cust3",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    };

    const mockOrders = [
      {
        id: "ord3",
        subscriptionId: "sub3",
        status: "delivered",
        date: "2026-07-15",
        mealType: "dinner",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;

    // Should update the subscription
    expect(mockTxn.update).toHaveBeenCalled();
    const updatePayload = mockTxn.update.mock.calls[0][1] as any;
    expect(updatePayload.status).toBe("active");
    expect(updatePayload.startDate).toBe("2026-08-01");
    expect(updatePayload.endDate).toBe("2026-08-31");
  });

  it("expires subscription when autoRenew is false", async () => {
    const mockSub = {
      id: "sub-no-renew",
      customerId: "cust3",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: false,
      billingCycle: "monthly",
    };

    const mockOrders = [
      {
        id: "ord3",
        subscriptionId: "sub-no-renew",
        status: "delivered",
        date: "2026-07-15",
        mealType: "dinner",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;

    expect(mockTxn.update).toHaveBeenCalled();
    const updatePayload = mockTxn.update.mock.calls[0][1] as any;
    expect(updatePayload.status).toBe("expired");
  });

  it("auto-renews subscription when autoRenew is missing (legacy)", async () => {
    const mockSub = {
      id: "sub-legacy-renew",
      customerId: "cust3",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      // NO autoRenew field
      billingCycle: "monthly",
    };

    const mockOrders = [
      {
        id: "ord3",
        subscriptionId: "sub-legacy-renew",
        status: "delivered",
        date: "2026-07-15",
        mealType: "dinner",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;

    expect(mockTxn.update).toHaveBeenCalled();
    const updatePayload = mockTxn.update.mock.calls[0][1] as any;
    expect(updatePayload.status).toBe("active");
    expect(updatePayload.startDate).toBeDefined();
    expect(updatePayload.endDate).toBeDefined();
  });

  it("legacy customer - full bundle", async () => {
    const mockSub = {
      id: "sub4",
      customerId: "cust4",
      planTier: "basic",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      pricePerDaySnapshot: 150,
      mealPreferences: [
        { mealType: "breakfast" },
        { mealType: "lunch" },
        { mealType: "dinner" },
      ],
    };

    const mockOrders = [
      {
        id: "ord4_1",
        subscriptionId: "sub4",
        status: "delivered",
        date: "2026-07-15",
        mealType: "breakfast",
      },
      {
        id: "ord4_2",
        subscriptionId: "sub4",
        status: "delivered",
        date: "2026-07-15",
        mealType: "lunch",
      },
      {
        id: "ord4_3",
        subscriptionId: "sub4",
        status: "delivered",
        date: "2026-07-15",
        mealType: "dinner",
      },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses pricePerDaySnapshot 150 instead of LIVE_PRICING_MATRIX.basic.breakfast_lunch_dinner 159
    expect(setPayload.totalAmount).toBe(150);
  });

  it("legacy customer - cancelled meal", async () => {
    const mockSub = {
      id: "sub5",
      customerId: "cust5",
      planTier: "basic",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      pricePerDaySnapshot: 150,
      mealPreferences: [
        { mealType: "breakfast" },
        { mealType: "lunch" },
        { mealType: "dinner" },
      ],
    };

    const mockOrders = [
      {
        id: "ord5_1",
        subscriptionId: "sub5",
        status: "delivered",
        date: "2026-07-15",
        mealType: "breakfast",
      },
      {
        id: "ord5_2",
        subscriptionId: "sub5",
        status: "delivered",
        date: "2026-07-15",
        mealType: "lunch",
      },
      // Dinner cancelled
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(
      mockOrders as any,
    );

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses LIVE_PRICING_MATRIX.basic.breakfast_lunch 115 because a meal was cancelled
    expect(setPayload.totalAmount).toBe(115);
  });

  it("fetches orders via getBySubscriptionId when available", async () => {
    const mockSub = {
      id: "sub-by-id",
      customerId: "cust-sub",
      planTier: "basic",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      pricingMatrixSnapshot: {
        breakfast: 60,
      },
    };

    const mockOrders = [
      {
        id: "ord-sub-1",
        subscriptionId: "sub-by-id",
        status: "delivered",
        date: "2026-07-10",
        mealType: "breakfast",
      },
    ];

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(
      mockOrders as any,
    );
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([]);

    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, "2026-08-01");
    expect(orderRepository.getBySubscriptionId).toHaveBeenCalledWith("sub-by-id");
    // Should NOT have needed to call getCustomerOrdersInRange
    expect(orderRepository.getCustomerOrdersInRange).not.toHaveBeenCalled();

    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    expect(setPayload.totalAmount).toBe(60);
  });

  it("quarantines failures to failureQueueRepository without halting processing", async () => {
    const { failureQueueRepository } = await import(
      "@/shared/services/firestore/failureQueueRepository"
    );
    vi.mocked(failureQueueRepository.logFailure).mockClear();

    const badSub = {
      id: "bad-sub",
      customerId: "cust-bad",
      planTier: "basic",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    };

    vi.mocked(subscriptionRepository.list).mockResolvedValue([badSub as any]);
    vi.mocked(orderRepository.getBySubscriptionId).mockRejectedValue(
      new Error("Firestore query failed"),
    );
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockRejectedValue(
      new Error("Firestore query failed"),
    );

    const res = await billingService.processDailyBilling("2026-08-01");

    expect(res.errors).toBe(1);
    expect(res.quarantined).toBe(1);
    expect(res.success).toBe(true); // Quarantined errors do not fail the overall batch
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust-bad",
      "bad-sub",
      "billing",
      "2026-08-01",
      expect.stringContaining("Firestore query failed"),
      expect.anything(),
    );
  });

  it("recovers and bills recently expired subscriptions that were unbilled", async () => {
    const expiredSub = {
      id: "expired-sub-1",
      customerId: "cust-exp",
      planTier: "basic",
      status: "expired",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      pricingMatrixSnapshot: {
        lunch: 65,
      },
    };

    vi.mocked(subscriptionRepository.list).mockResolvedValue([expiredSub as any]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue([
      {
        id: "ord-exp-1",
        subscriptionId: "expired-sub-1",
        status: "delivered",
        date: "2026-07-15",
        mealType: "lunch",
      } as any,
    ]);

    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);

    const res = await billingService.processDailyBilling("2026-08-01");

    expect(res.processed).toBe(1);
    expect(res.errors).toBe(0);
    expect(res.success).toBe(true);
  });

  it("bills mid-cycle cancellations up to today rather than original endDate", async () => {
    const cancelledSub = {
      id: "cancel-sub-1",
      customerId: "cust-cancel",
      planTier: "basic",
      status: "cancelled",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      cancellationDate: "2026-07-15",
      quantity: 1,
      pricingMatrixSnapshot: {
        lunch: 65,
      },
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue([
      {
        id: "ord-c-1",
        subscriptionId: "cancel-sub-1",
        status: "delivered",
        date: "2026-07-10",
        mealType: "lunch",
      } as any,
    ]);

    const { doc, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);

    await billingService.processSubscriptionEnd(
      cancelledSub as any,
      "2026-07-15",
      "cancelled",
    );

    // Verify doc ref was constructed with inv_cancel-sub-1_2026-07-15
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      "invoices",
      "inv_cancel-sub-1_2026-07-15",
    );
  });

  it("handles auto-renew safely when endDate is undefined or missing", async () => {
    const subNoEnd = {
      id: "sub-no-end",
      customerId: "cust-1",
      planTier: "basic",
      status: "active",
      startDate: "2026-07-01",
      // endDate is undefined
      billingCycle: "monthly",
      autoRenew: true,
      quantity: 1,
      pricingMatrixSnapshot: { lunch: 65 },
    };

    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue([]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([]);
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);

    // Should not throw TypeError: Cannot read properties of undefined (reading 'split')
    await expect(
      billingService.processSubscriptionEnd(subNoEnd as any, "2026-08-01"),
    ).resolves.not.toThrow();
  });
});

