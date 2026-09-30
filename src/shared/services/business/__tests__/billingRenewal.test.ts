import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDoc } from "firebase/firestore";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { orderRepository } from "@/shared/services/firestore/orderRepository";
import { paymentRepository } from "@/shared/services/firestore/paymentRepository";

// Mock Firebase Firestore utils
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
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

import { billingService } from "../billingService";

describe("billingService renewal scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-renews with a new unpaid invoice (status=issued)", async () => {
    const sub = {
      id: "sub-unpaid-new",
      customerId: "custA",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    } as any;
    const orders = [{
      id: "ord1",
      subscriptionId: sub.id,
      status: "delivered",
      date: "2026-07-15",
      mealType: "lunch",
    }];
    vi.mocked(subscriptionRepository.list).mockResolvedValue([sub]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(orders as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    const txn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn.set).toHaveBeenCalled();
    const invoicePayload = txn.set.mock.calls[0][1] as any;
    expect(invoicePayload.status).toBe("issued");
    expect(txn.update).toHaveBeenCalled();
    const subUpdate = txn.update.mock.calls[0][1] as any;
    expect(subUpdate.status).toBe("active");
    expect(subUpdate.startDate).toBe("2026-08-01");
    expect(subUpdate.endDate).toBe("2026-08-31");
  });

  it("reuses an existing unpaid invoice without creating a new one", async () => {
    const sub = {
      id: "sub-unpaid-existing",
      customerId: "custB",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    } as any;
    const existingInvoiceSnap = {
      exists: () => true,
      data: () => ({ status: "issued" }),
    } as any;
    vi.mocked(getDoc).mockResolvedValueOnce(existingInvoiceSnap);
    vi.mocked(subscriptionRepository.list).mockResolvedValue([sub]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([] as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    const txn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn.set).not.toHaveBeenCalled();
    expect(txn.update).toHaveBeenCalled();
    const subUpdate = txn.update.mock.calls[0][1] as any;
    expect(subUpdate.status).toBe("active");
    expect(subUpdate.startDate).toBe("2026-08-01");
    expect(subUpdate.endDate).toBe("2026-08-31");
  });

  it("reuses an existing paid invoice and still renews", async () => {
    const sub = {
      id: "sub-paid-existing",
      customerId: "custC",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    } as any;
    const existingInvoiceSnap = {
      exists: () => true,
      data: () => ({ status: "paid" }),
    } as any;
    vi.mocked(getDoc).mockResolvedValueOnce(existingInvoiceSnap);
    vi.mocked(subscriptionRepository.list).mockResolvedValue([sub]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([] as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    const txn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn.set).not.toHaveBeenCalled();
    expect(txn.update).toHaveBeenCalled();
    const subUpdate = txn.update.mock.calls[0][1] as any;
    expect(subUpdate.status).toBe("active");
  });

  it("duplicate renewal execution is idempotent", async () => {
    const sub = {
      id: "sub-idempotent",
      customerId: "custD",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    } as any;
    // First run – no existing invoice
    vi.mocked(subscriptionRepository.list).mockResolvedValue([sub]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([] as any);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    const txn1 = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn1.set).toHaveBeenCalled();
    expect(txn1.update).toHaveBeenCalled();
    // Simulate invoice exists and subscription has lastInvoiceId set
    const existingInvoiceSnap = {
      exists: () => true,
      data: () => ({ status: "issued" }),
    } as any;
    vi.mocked(getDoc).mockResolvedValueOnce(existingInvoiceSnap);
    (sub as any).lastInvoiceId = `inv_${sub.id}_2026-07-31`;
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    // Since renewal is idempotent, runTransaction should not be invoked again
    expect(vi.mocked(runTransaction)).not.toHaveBeenCalled();
  });

  it("payment after renewal does not trigger a second renewal", async () => {
    const sub = {
      id: "sub-payment-later",
      customerId: "custE",
      planTier: "regular",
      status: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      quantity: 1,
      autoRenew: true,
      billingCycle: "monthly",
    } as any;
    // First run – creates unpaid invoice
    vi.mocked(subscriptionRepository.list).mockResolvedValue([sub]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue([] as any);
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);
    const { runTransaction } = await import("firebase/firestore");
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    const txn1 = await vi.mocked(runTransaction).mock.results[0].value;
    expect(txn1.set).toHaveBeenCalled();
    expect(txn1.update).toHaveBeenCalled();
    // Simulate later verified payment
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      { subscriptionId: sub.id, status: "verified", purpose: "usage", amount: 85 },
    ] as any);
    const paidInvoiceSnap = {
      exists: () => true,
      data: () => ({ status: "paid" }),
    } as any;
    vi.mocked(getDoc).mockResolvedValueOnce(paidInvoiceSnap);
    (sub as any).lastInvoiceId = `inv_${sub.id}_2026-07-31`;
    vi.mocked(runTransaction).mockClear();
    await billingService.processSubscriptionEnd(sub, "2026-08-01");
    // Since payment after renewal should not trigger a second renewal, runTransaction should not be invoked again
    expect(vi.mocked(runTransaction)).not.toHaveBeenCalled();
  });
});
