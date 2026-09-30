import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "@/shared/services/business/billingService";
import { orderRepository } from "@/shared/services/firestore/orderRepository";

vi.mock("@/shared/lib/firebase", () => ({ db: {} }));

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

describe("Targeted Resolution: Renewal Billing Period & Amount Calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("August cycle (2026-08-01 to 2026-08-31) = 31 days @ ₹60 = ₹1,860", async () => {
    const augustSub = {
      id: "sub-august",
      customerId: "cust-1",
      planTier: "standard",
      status: "active",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      billingCycle: "monthly",
      quantity: 1,
      autoRenew: true,
      pricingMatrixSnapshot: { lunch: 60 },
    } as any;

    // 31 delivered orders for all 31 days of August
    const augustOrders = [];
    for (let day = 1; day <= 31; day++) {
      const dayStr = String(day).padStart(2, "0");
      augustOrders.push({
        id: `ord-aug-${dayStr}`,
        subscriptionId: "sub-august",
        date: `2026-08-${dayStr}`,
        mealType: "lunch",
        status: "delivered",
        price: 60,
        isAddon: false,
      });
    }

    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(augustOrders as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(augustSub, "2026-09-01");

    const txn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn.set).toHaveBeenCalled();
    const invoicePayload = txn.set.mock.calls[0][1];

    // August billing period: 31 days
    expect(invoicePayload.billingPeriodStart).toBe("2026-08-01");
    expect(invoicePayload.billingPeriodEnd).toBe("2026-08-31");
    expect(invoicePayload.subtotal).toBe(1860); // 31 * 60 = 1860
    expect(invoicePayload.totalAmount).toBe(1860);

    // Renewal advances to September 1 - September 30
    expect(txn.update).toHaveBeenCalled();
    const subUpdate = txn.update.mock.calls[0][1];
    expect(subUpdate.startDate).toBe("2026-09-01");
    expect(subUpdate.endDate).toBe("2026-09-30");
  });

  it("September cycle (2026-09-01 to 2026-09-30) = 30 days @ ₹60 = ₹1,800 (NOT ₹1,860)", async () => {
    const septemberSub = {
      id: "sub-september",
      customerId: "cust-1",
      planTier: "standard",
      status: "active",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      billingCycle: "monthly",
      quantity: 1,
      autoRenew: true,
      pricingMatrixSnapshot: { lunch: 60 },
    } as any;

    // 30 delivered orders for all 30 days of September
    const septemberOrders = [];
    for (let day = 1; day <= 30; day++) {
      const dayStr = String(day).padStart(2, "0");
      septemberOrders.push({
        id: `ord-sep-${dayStr}`,
        subscriptionId: "sub-september",
        date: `2026-09-${dayStr}`,
        mealType: "lunch",
        status: "delivered",
        price: 60,
        isAddon: false,
      });
    }

    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(septemberOrders as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(septemberSub, "2026-10-01");

    const txn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn.set).toHaveBeenCalled();
    const invoicePayload = txn.set.mock.calls[0][1];

    // September billing period: 30 days
    expect(invoicePayload.billingPeriodStart).toBe("2026-09-01");
    expect(invoicePayload.billingPeriodEnd).toBe("2026-09-30");
    // Proof: Exactly 30 * 60 = 1800, NOT 1860
    expect(invoicePayload.subtotal).toBe(1800);
    expect(invoicePayload.totalAmount).toBe(1800);

    // Renewal advances to October 1 - October 31
    expect(txn.update).toHaveBeenCalled();
    const subUpdate = txn.update.mock.calls[0][1];
    expect(subUpdate.startDate).toBe("2026-10-01");
    expect(subUpdate.endDate).toBe("2026-10-31");
  });
});
