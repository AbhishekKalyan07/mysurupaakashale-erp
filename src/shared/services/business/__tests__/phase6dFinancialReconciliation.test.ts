import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "../billingService";
import { paymentService } from "../paymentService";
import { accountsRepository } from "../../firestore/accountsRepository";
import {
  getInvoicePaidAmount,
  getInvoiceCollectedAmount,
  isInvoiceCollectedAmountKnown,
  getInvoiceRemainingDue,
  getInvoiceRemainingToRefund,
} from "@/shared/types/billing.types";
import type { Subscription, Order, Invoice } from "@/shared/types";

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
    create: vi.fn().mockResolvedValue("mock-payment-id"),
  },
}));

vi.mock("@/shared/services/firestore/notificationService", () => ({
  notifyPaymentSubmitted: vi.fn().mockResolvedValue(undefined),
  notifyPaymentVerified: vi.fn().mockResolvedValue(undefined),
  notifyPaymentReminder: vi.fn().mockResolvedValue(undefined),
  notifyInvoiceGenerated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue("mock-audit-id"),
  },
}));

describe("Phase 6E — Option A: Applied Payments and Refund Reconciliation", () => {
  const customerId = "cust_p6e_1";
  const subscriptionId = "sub_p6e_1";

  const baseSubscription: Subscription = {
    id: subscriptionId,
    customerId,
    planId: "plan_basic",
    planTier: "basic",
    status: "active",
    startDate: "2026-10-01",
    endDate: "2026-10-30",
    mealType: ["lunch"],
    deliveryAddress: {
      addressLine1: "123 Temple Road",
      city: "Mysuru",
      pincode: "570001",
    },
    paymentStatus: "paid",
    depositAmount: 1000,
    depositStatus: "paid",
    autoRenew: false,
    billingCycle: "monthly",
    quantity: 1,
    pricePerDaySnapshot: 100,
    mealPreferences: [{ mealType: "lunch", selectedOptionId: null }],
    pricingMatrixSnapshot: {
      breakfast: 60,
      lunch: 100,
      dinner: 100,
      breakfast_lunch: 160,
      lunch_dinner: 190,
      breakfast_dinner: 160,
      breakfast_lunch_dinner: 240,
    },
    createdAt: "MOCK_TIMESTAMP" as any,
    updatedAt: "MOCK_TIMESTAMP" as any,
  } as unknown as Subscription;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreDocs = {
      [`users/${customerId}`]: {
        uid: customerId,
        fullName: "Test Customer",
        creditBalance: 0,
      },
      [`subscriptions/${subscriptionId}`]: { ...baseSubscription },
    };
  });

  // Scenario 1: Unpaid invoice
  it("Scenario 1: Fully unpaid invoice has exact remainingDue = totalAmount, paidAmount = 0, remainingToRefund = 0", () => {
    const invoice: Invoice = {
      id: "inv_sc1",
      invoiceNumber: "INV-SC1",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 0,
      collectedAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
    };

    expect(getInvoicePaidAmount(invoice)).toBe(0);
    expect(getInvoiceCollectedAmount(invoice)).toBe(0);
    expect(getInvoiceRemainingDue(invoice)).toBe(3000);
    expect(getInvoiceRemainingToRefund(invoice)).toBe(0);
    expect(invoice.status).toBe("issued");
    expect(getInvoiceRemainingDue(invoice)).toBeGreaterThanOrEqual(0);
  });

  // Scenario 2: Partially paid invoice
  it("Scenario 2: Partially paid invoice preserves paidAmount, remainingDue = totalAmount - paidAmount, remainingToRefund = 0", async () => {
    const invoiceId = "inv_sc2";
    const invoiceDoc: Invoice = {
      id: invoiceId,
      invoiceNumber: "INV-SC2",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 0,
      collectedAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
    };
    mockFirestoreDocs[`invoices/${invoiceId}`] = invoiceDoc;

    const paymentId = "pay_sc2";
    mockFirestoreDocs[`payments/${paymentId}`] = {
      id: paymentId,
      customerId,
      subscriptionId,
      invoiceId,
      amount: 1000,
      status: "pending",
      purpose: "usage",
    };

    await paymentService.approvePayment(paymentId, "admin-1");

    const updated = mockFirestoreDocs[`invoices/${invoiceId}`];
    expect(updated.paidAmount).toBe(1000);
    expect(updated.collectedAmount).toBe(1000);
    expect(updated.status).toBe("issued"); // Not yet fully paid
    expect(getInvoicePaidAmount(updated)).toBe(1000);
    expect(getInvoiceCollectedAmount(updated)).toBe(1000);
    expect(getInvoiceRemainingDue(updated)).toBe(2000);
    expect(getInvoiceRemainingToRefund(updated)).toBe(0);
  });

  // Scenario 3: Exact payment
  it("Scenario 3: Exact payment settles invoice in full, remainingDue = 0, remainingToRefund = 0", async () => {
    const invoiceId = "inv_sc3";
    mockFirestoreDocs[`invoices/${invoiceId}`] = {
      id: invoiceId,
      invoiceNumber: "INV-SC3",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
    };

    const paymentId = "pay_sc3";
    mockFirestoreDocs[`payments/${paymentId}`] = {
      id: paymentId,
      customerId,
      subscriptionId,
      invoiceId,
      amount: 3000,
      status: "pending",
      purpose: "usage",
    };

    await paymentService.approvePayment(paymentId, "admin-1");

    const updated = mockFirestoreDocs[`invoices/${invoiceId}`];
    expect(updated.paidAmount).toBe(3000);
    expect(updated.collectedAmount).toBe(3000);
    expect(updated.status).toBe("paid");
    expect(updated.paidAt).toBeTruthy();
    expect(getInvoicePaidAmount(updated)).toBe(3000);
    expect(getInvoiceCollectedAmount(updated)).toBe(3000);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(0);
  });

  // Scenario 4: Overpayment against an unpaid invoice
  it("Scenario 4: Overpayment against unpaid invoice caps paidAmount at totalAmount, records collectedAmount, and tracks excess as remainingToRefund", async () => {
    const invoiceId = "inv_sc4";
    mockFirestoreDocs[`invoices/${invoiceId}`] = {
      id: invoiceId,
      invoiceNumber: "INV-SC4",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
    };

    const paymentId = "pay_sc4";
    mockFirestoreDocs[`payments/${paymentId}`] = {
      id: paymentId,
      customerId,
      subscriptionId,
      invoiceId,
      amount: 3500, // ₹500 overpayment
      status: "pending",
      purpose: "usage",
    };

    await paymentService.approvePayment(paymentId, "admin-1");

    const updated = mockFirestoreDocs[`invoices/${invoiceId}`];
    // Option A: paidAmount strictly capped at totalAmount
    expect(updated.paidAmount).toBe(3000);
    expect(updated.collectedAmount).toBe(3500);
    expect(getInvoicePaidAmount(updated)).toBe(3000);
    expect(getInvoiceCollectedAmount(updated)).toBe(3500);
    expect(updated.status).toBe("paid");
    expect(updated.remainingToRefund).toBe(500);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(500);

    // Customer wallet credit is NOT touched
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(0);
    const ledgerKeys = Object.keys(mockFirestoreDocs).filter((k) => k.includes("ledger"));
    expect(ledgerKeys.length).toBe(0);
  });

  // Scenario 5: Additional payment against an already-paid invoice
  it("Scenario 5: Additional payment against already-paid invoice preserves paidAmount capped at totalAmount, increments collectedAmount and updates remainingToRefund", async () => {
    const invoiceId = "inv_sc5";
    mockFirestoreDocs[`invoices/${invoiceId}`] = {
      id: invoiceId,
      invoiceNumber: "INV-SC5",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 3000,
      collectedAmount: 3000,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
      paymentId: "pay_sc5_initial",
    };

    const paymentId = "pay_sc5_extra";
    mockFirestoreDocs[`payments/${paymentId}`] = {
      id: paymentId,
      customerId,
      subscriptionId,
      invoiceId,
      amount: 600,
      status: "pending",
      purpose: "usage",
    };

    await paymentService.approvePayment(paymentId, "admin-1");

    const updated = mockFirestoreDocs[`invoices/${invoiceId}`];
    expect(updated.paidAmount).toBe(3000); // Capped at totalAmount
    expect(updated.collectedAmount).toBe(3600); // Cumulative cash
    expect(getInvoicePaidAmount(updated)).toBe(3000);
    expect(getInvoiceCollectedAmount(updated)).toBe(3600);
    expect(updated.remainingToRefund).toBe(600);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(600);

    // Customer wallet credit remains untouched
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(0);
  });

  // Scenario 6: Duplicate approval or gateway callback
  it("Scenario 6: Duplicate gateway callbacks / retries are rejected idempotently and do not count payment twice", async () => {
    const invoiceId = "inv_sc6";
    mockFirestoreDocs[`invoices/${invoiceId}`] = {
      id: invoiceId,
      invoiceNumber: "INV-SC6",
      customerId,
      subscriptionId,
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
    };

    const paymentId = "pay_sc6";
    mockFirestoreDocs[`payments/${paymentId}`] = {
      id: paymentId,
      customerId,
      subscriptionId,
      invoiceId,
      amount: 3000,
      status: "pending",
      purpose: "usage",
    };

    // First attempt succeeds
    await paymentService.approvePayment(paymentId, "admin-1");
    expect(mockFirestoreDocs[`invoices/${invoiceId}`].paidAmount).toBe(3000);
    expect(mockFirestoreDocs[`invoices/${invoiceId}`].collectedAmount).toBe(3000);

    // Second attempt (retry) fails safely because status is already verified
    await expect(paymentService.approvePayment(paymentId, "admin-1")).rejects.toThrow(
      "Only pending payments can be approved",
    );

    // Persisted values remain unchanged
    expect(mockFirestoreDocs[`invoices/${invoiceId}`].paidAmount).toBe(3000);
    expect(mockFirestoreDocs[`invoices/${invoiceId}`].collectedAmount).toBe(3000);
    expect(getInvoiceRemainingDue(mockFirestoreDocs[`invoices/${invoiceId}`])).toBe(0);
  });

  // Scenario 7: Offline overpayment
  it("Scenario 7: Offline payment exceeding amount due caps paidAmount at totalAmount, sets collectedAmount and calculates remainingToRefund", async () => {
    const invoiceId = "inv_sc7";
    mockFirestoreDocs[`invoices/${invoiceId}`] = {
      id: invoiceId,
      invoiceNumber: "INV-SC7",
      customerId,
      subscriptionId,
      subtotal: 2500,
      totalAmount: 2500,
      paidAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
    };

    const paymentId = await accountsRepository.recordOfflinePayment({
      invoiceId,
      amount: 3000, // ₹500 excess
      paymentMethod: "upi",
      referenceNumber: "UPI123456",
      paymentDate: "2026-10-25",
      adminUid: "admin-1",
      adminName: "Admin Staff",
    });

    expect(paymentId).toBeTruthy();

    const updated = mockFirestoreDocs[`invoices/${invoiceId}`];
    expect(updated.paidAmount).toBe(2500); // Option A: capped at totalAmount
    expect(updated.collectedAmount).toBe(3000); // Full cash collected
    expect(getInvoicePaidAmount(updated)).toBe(2500);
    expect(getInvoiceCollectedAmount(updated)).toBe(3000);
    expect(updated.status).toBe("paid");
    expect(updated.remainingToRefund).toBe(500);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(500);

    // User wallet credit is NOT touched
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(0);
  });

  // Scenario 8: Cancellation before invoice generation
  it("Scenario 8: Cancellation before invoice generation excludes undelivered meals upfront from totalAmount", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 5 ? "cancelled" : "delivered", // 5 cancelled, 25 delivered = ₹2,500
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const created = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(created.subtotal).toBe(2500);
    expect(created.totalAmount).toBe(2500);
    expect(created.paidAmount).toBe(0);
    expect(created.collectedAmount).toBe(0);
    expect(getInvoiceRemainingDue(created)).toBe(2500);
    expect(getInvoiceRemainingToRefund(created)).toBe(0);
  });

  // Scenario 9: Cancellation after invoice generation but before payment
  it("Scenario 9: Cancellation after invoice generation directly reduces totalAmount and remainingDue idempotently", async () => {
    const invoiceId = "inv_sc9";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-SC9",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 30, unitPrice: 100, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 0,
      collectedAmount: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
    };

    const cancelledOrder: Order = {
      id: "ord_cancel_sc9",
      subscriptionId,
      customerId,
      date: "2026-10-15",
      mealType: "lunch",
      status: "cancelled",
      price: 100,
      invoiceId,
    } as Order;

    const result = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(result.adjusted).toBe(true);
    expect(result.deductedAmount).toBe(100);

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.subtotal).toBe(2900);
    expect(updated.totalAmount).toBe(2900);
    expect(updated.paidAmount).toBe(0);
    expect(getInvoiceRemainingDue(updated)).toBe(2900);
    expect(getInvoiceRemainingToRefund(updated)).toBe(0);

    // Calling again with the same cancelled order is an idempotent no-op
    const secondResult = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(secondResult.adjusted).toBe(false);
    expect(mockFirestoreDocs[invoiceId].totalAmount).toBe(2900);
  });

  // Scenario 10: Cancellation after partial payment
  it("Scenario 10: Cancellation after partial payment preserves paidAmount, reduces totalAmount and remainingDue", async () => {
    const invoiceId = "inv_sc10";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-SC10",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 30, unitPrice: 100, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 1000, // Customer paid ₹1,000 previously
      collectedAmount: 1000,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: "pay_sc10",
    };

    const cancelledOrder: Order = {
      id: "ord_cancel_sc10",
      subscriptionId,
      customerId,
      date: "2026-10-12",
      mealType: "lunch",
      status: "cancelled",
      price: 200, // 2 meals
      invoiceId,
    } as Order;

    const result = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(result.adjusted).toBe(true);
    expect(result.deductedAmount).toBe(200);

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.subtotal).toBe(2800);
    expect(updated.totalAmount).toBe(2800);
    expect(updated.paidAmount).toBe(1000); // Preserved!
    expect(updated.collectedAmount).toBe(1000);
    expect(getInvoiceRemainingDue(updated)).toBe(1800); // 2800 - 1000
    expect(getInvoiceRemainingToRefund(updated)).toBe(0);
  });

  // Scenario 11: Cancellation after full payment, creating refundable excess
  it("Scenario 11: Cancellation after full payment recalculates paidAmount to revised total, preserves collectedAmount, and tracks excess as remainingToRefund", async () => {
    const invoiceId = "inv_sc11";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-SC11",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 30, unitPrice: 100, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 3000,
      collectedAmount: 3000,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
      paymentId: "pay_sc11",
    };

    const cancelledOrder: Order = {
      id: "ord_cancel_sc11",
      subscriptionId,
      customerId,
      date: "2026-10-20",
      mealType: "lunch",
      status: "cancelled",
      price: 300, // ₹300 cancelled
      invoiceId,
    } as Order;

    const result = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(result.adjusted).toBe(true);
    expect(result.remainingToRefund).toBe(300);

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.subtotal).toBe(2700);
    expect(updated.totalAmount).toBe(2700);
    // Option A: paidAmount recalculated to match revised payable total
    expect(updated.paidAmount).toBe(2700);
    expect(updated.collectedAmount).toBe(3000); // Gross cash preserved
    expect(getInvoicePaidAmount(updated)).toBe(2700);
    expect(getInvoiceCollectedAmount(updated)).toBe(3000);
    expect(updated.remainingToRefund).toBe(300);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(300);

    // No wallet credit or automatic refund created
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(0);
  });

  // Scenario 12: Confirmed partial and full refunds
  it("Scenario 12: Confirmed refunds reduce remainingToRefund and subsequent cancellations recalculate remaining refundable amount correctly", async () => {
    const invoiceId = "inv_sc12";
    // ₹3,000 collected, ₹2,700 bill after initial cancellations, ₹100 confirmed refund
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-SC12",
      customerId,
      subscriptionId,
      subtotal: 2700,
      totalAmount: 2700,
      paidAmount: 2700,
      collectedAmount: 3000,
      confirmedRefunds: 100, // ₹100 refund already processed and confirmed
      remainingToRefund: 200, // 3000 - 2700 - 100 = 200
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
    };

    // Another cancellation of ₹100 occurs -> bill drops to ₹2,600
    const cancelledOrder: Order = {
      id: "ord_cancel_sc12",
      subscriptionId,
      customerId,
      date: "2026-10-22",
      mealType: "lunch",
      status: "cancelled",
      price: 100,
      invoiceId,
    } as Order;

    const result = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(result.adjusted).toBe(true);
    expect(result.deductedAmount).toBe(100);
    expect(result.remainingToRefund).toBe(300);

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.subtotal).toBe(2600);
    expect(updated.totalAmount).toBe(2600);
    expect(updated.paidAmount).toBe(2600); // Option A: capped at 2600
    expect(updated.collectedAmount).toBe(3000);
    expect(updated.confirmedRefunds).toBe(100);
    // remainingToRefund = max(0, 3000 - 2600 - 100 confirmedRefunds) = 300
    expect(updated.remainingToRefund).toBe(300);
    expect(getInvoiceRemainingToRefund(updated)).toBe(300);
    expect(getInvoiceRemainingDue(updated)).toBe(0);

    // When the remaining ₹300 refund is subsequently confirmed by authorized process:
    const settledRefundInvoice: Invoice = {
      ...updated,
      confirmedRefunds: 400, // Total confirmed refunds: 100 + 300 = 400
      remainingToRefund: 0,
    };
    expect(getInvoiceRemainingToRefund(settledRefundInvoice)).toBe(0);
  });

  // Scenario 13: Repeated cancellation attempts and idempotency
  it("Scenario 13: Repeated cancellation attempts for identical order IDs are idempotent and do not reduce invoice amount twice", async () => {
    const invoiceId = "inv_sc13";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-SC13",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 30, unitPrice: 100, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 3000,
      collectedAmount: 3000,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
    };

    const cancelledOrder: Order = {
      id: "ord_cancel_sc13",
      subscriptionId,
      customerId,
      date: "2026-10-18",
      mealType: "lunch",
      status: "cancelled",
      price: 150,
      invoiceId,
    } as Order;

    const res1 = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(res1.adjusted).toBe(true);
    expect(res1.deductedAmount).toBe(150);
    expect(mockFirestoreDocs[invoiceId].totalAmount).toBe(2850);
    expect(mockFirestoreDocs[invoiceId].paidAmount).toBe(2850);
    expect(mockFirestoreDocs[invoiceId].collectedAmount).toBe(3000);
    expect(mockFirestoreDocs[invoiceId].remainingToRefund).toBe(150);

    // Retry/duplicate attempt with same order
    const res2 = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-1");
    expect(res2.adjusted).toBe(false);
    expect(res2.deductedAmount).toBe(0);
    expect(mockFirestoreDocs[invoiceId].totalAmount).toBe(2850);
    expect(mockFirestoreDocs[invoiceId].paidAmount).toBe(2850);
    expect(mockFirestoreDocs[invoiceId].collectedAmount).toBe(3000);
    expect(mockFirestoreDocs[invoiceId].remainingToRefund).toBe(150);
  });

  // Scenario 14: Legacy invoices without paidAmount or the new optional field
  it("Scenario 14: Legacy invoices without collectedAmount evaluate correctly via conservative fallbacks and do not infer fabricated refunds", () => {
    // 14A: Legacy paid invoice where paidAmount was capped at totalAmount (3000) and no collectedAmount exists
    const legacyPaidCapped: Invoice = {
      id: "inv_legacy_paid",
      invoiceNumber: "INV-LEGACY-01",
      customerId,
      subscriptionId,
      lineItems: [],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 3000, // Capped at totalAmount under historical Phase 5 contract
      // collectedAmount intentionally undefined (legacy document)
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-06-01",
      billingPeriodEnd: "2026-06-30",
      dueDate: "2026-06-30",
      paidAt: "2026-06-30T10:00:00Z" as any,
      paymentId: "leg_pay_1",
      createdAt: "MOCK_TIMESTAMP" as any,
    };
    expect(isInvoiceCollectedAmountKnown(legacyPaidCapped)).toBe(false);
    expect(getInvoicePaidAmount(legacyPaidCapped)).toBe(3000);
    expect(getInvoiceCollectedAmount(legacyPaidCapped)).toBe(3000); // Conservative fallback
    expect(getInvoiceRemainingDue(legacyPaidCapped)).toBe(0);
    expect(getInvoiceRemainingToRefund(legacyPaidCapped)).toBe(0); // Never infers fabricated refund

    // 14B: Legacy issued invoice without paidAmount or collectedAmount
    const legacyIssued: Invoice = {
      ...legacyPaidCapped,
      id: "inv_legacy_issued",
      paidAmount: undefined,
      status: "issued",
      paidAt: null,
      paymentId: null,
    };
    expect(isInvoiceCollectedAmountKnown(legacyIssued)).toBe(false);
    expect(getInvoicePaidAmount(legacyIssued)).toBe(0);
    expect(getInvoiceCollectedAmount(legacyIssued)).toBe(0);
    expect(getInvoiceRemainingDue(legacyIssued)).toBe(3000);
    expect(getInvoiceRemainingToRefund(legacyIssued)).toBe(0);

    // 14C: Legacy invoice with completely missing payment-receipt links (paymentId: null)
    const legacyNoReceipt: Invoice = {
      ...legacyPaidCapped,
      id: "inv_legacy_no_receipt",
      paidAmount: undefined,
      paymentId: null,
      status: "paid",
    };
    expect(isInvoiceCollectedAmountKnown(legacyNoReceipt)).toBe(false);
    expect(getInvoicePaidAmount(legacyNoReceipt)).toBe(3000);
    expect(getInvoiceCollectedAmount(legacyNoReceipt)).toBe(3000);
    expect(getInvoiceRemainingDue(legacyNoReceipt)).toBe(0);
    expect(getInvoiceRemainingToRefund(legacyNoReceipt)).toBe(0);

    // 14D: Genuine new-format invoice with reliable collectedAmount > totalAmount
    const modernOverpaidInvoice: Invoice = {
      ...legacyPaidCapped,
      id: "inv_modern_overpaid",
      totalAmount: 3000,
      paidAmount: 3000, // Capped
      collectedAmount: 3500, // Verified gross cash
      remainingToRefund: 500,
      status: "paid",
    };
    expect(isInvoiceCollectedAmountKnown(modernOverpaidInvoice)).toBe(true);
    expect(getInvoicePaidAmount(modernOverpaidInvoice)).toBe(3000);
    expect(getInvoiceCollectedAmount(modernOverpaidInvoice)).toBe(3500);
    expect(getInvoiceRemainingDue(modernOverpaidInvoice)).toBe(0);
    expect(getInvoiceRemainingToRefund(modernOverpaidInvoice)).toBe(500);
  });

  // Scenario 15: Historical overpayments previously routed to wallet credit
  it("Scenario 15: Historical overpayments routed to wallet credit in previous phases remain preserved and are not re-interpreted as active invoice payments or new refunds", () => {
    // Historical profile had ₹400 wallet credit created in June 2026
    const historicalCustomerDoc = {
      uid: customerId,
      fullName: "Historical Customer",
      creditBalance: 400,
    };
    mockFirestoreDocs[`users/${customerId}`] = historicalCustomerDoc;

    // An unpaid October bill is checked
    const octoberInvoice: Invoice = {
      id: "inv_oct",
      invoiceNumber: "INV-OCT-01",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic", quantity: 1, unitPrice: 2000, amount: 2000 }],
      subtotal: 2000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 2000,
      paidAmount: 0,
      collectedAmount: 0,
      creditApplied: 0, // No wallet credit applied
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-31",
      dueDate: "2026-10-31",
      paidAt: null,
      paymentId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
    };

    expect(getInvoicePaidAmount(octoberInvoice)).toBe(0);
    expect(getInvoiceRemainingDue(octoberInvoice)).toBe(2000);
    expect(getInvoiceRemainingToRefund(octoberInvoice)).toBe(0);

    // Historical creditBalance remains unchanged and inactive
    expect(mockFirestoreDocs[`users/${customerId}`].creditBalance).toBe(400);
  });

  // Scenario 16: Customers with historical positive wallet balances
  it("Scenario 16: Customer with historical positive wallet balance has new invoice generated without applying credit or mutating wallet", async () => {
    mockFirestoreDocs[`users/${customerId}`].creditBalance = 750;

    const orders: Order[] = [];
    for (let day = 1; day <= 25; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const created = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(created.totalAmount).toBe(2500); // Full 25 delivered meals, NOT reduced by 750
    expect(created.creditApplied || 0).toBe(0);
    expect(getInvoiceRemainingDue(created)).toBe(2500);

    // Historical wallet balance remains strictly untouched
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(750);
  });

  // Scenario 17: Unused meal advances without wallet-credit creation
  it("Scenario 17: Unused meal advance creates remainingToRefund on invoice without creating wallet credit or ledger entries", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 10 ? "cancelled" : "delivered", // 20 delivered = ₹2,000
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    // Customer had paid ₹3,000 advance
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "adv_pay_sc17",
        subscriptionId,
        customerId,
        amount: 3000,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-10",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const created = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(created.totalAmount).toBe(2000);
    // Option A: paidAmount strictly capped at totalAmount
    expect(created.paidAmount).toBe(2000);
    expect(created.collectedAmount).toBe(3000);
    expect(getInvoicePaidAmount(created)).toBe(2000);
    expect(getInvoiceCollectedAmount(created)).toBe(3000);
    expect(created.remainingToRefund).toBe(1000);
    expect(getInvoiceRemainingDue(created)).toBe(0);
    expect(getInvoiceRemainingToRefund(created)).toBe(1000);

    // No wallet credit or ledger writes
    const user = mockFirestoreDocs[`users/${customerId}`];
    expect(user.creditBalance).toBe(0);
    const ledgerKeys = Object.keys(mockFirestoreDocs).filter((k) => k.includes("ledger"));
    expect(ledgerKeys.length).toBe(0);
  });

  // Scenario 18: Consistency among invoice details, customer payment history, admin summaries, and CSV reports
  it("Scenario 18: Financial consistency across invoice details, admin summaries, customer payment views, and monthly CSV exports", async () => {
    const inv1: Invoice = {
      id: "inv_18_overpaid",
      invoiceNumber: "INV-18-01",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 3000, // Capped
      collectedAmount: 3500, // Gross cash
      remainingToRefund: 500,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-31",
      dueDate: "2026-10-31",
      paidAt: "2026-10-15T00:00:00Z" as any,
      paymentId: "p1",
      createdAt: { seconds: 1792137600 } as any,
    };

    const inv2: Invoice = {
      id: "inv_18_partial",
      invoiceNumber: "INV-18-02",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Plan", quantity: 1, unitPrice: 2000, amount: 2000 }],
      subtotal: 2000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 2000,
      paidAmount: 500,
      collectedAmount: 500,
      remainingToRefund: 0,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-31",
      dueDate: "2026-10-31",
      paidAt: null,
      paymentId: "p2",
      createdAt: { seconds: 1792137600 } as any,
    };

    // 1. Contract verification
    expect(getInvoicePaidAmount(inv1)).toBe(3000);
    expect(getInvoiceCollectedAmount(inv1)).toBe(3500);
    expect(getInvoiceRemainingDue(inv1)).toBe(0);
    expect(getInvoiceRemainingToRefund(inv1)).toBe(500);

    expect(getInvoicePaidAmount(inv2)).toBe(500);
    expect(getInvoiceCollectedAmount(inv2)).toBe(500);
    expect(getInvoiceRemainingDue(inv2)).toBe(1500);
    expect(getInvoiceRemainingToRefund(inv2)).toBe(0);

    // Legacy invoice with unknown gross collection
    const inv3_legacy: Invoice = {
      id: "inv_18_legacy",
      invoiceNumber: "INV-18-03",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Plan", quantity: 1, unitPrice: 1000, amount: 1000 }],
      subtotal: 1000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 1000,
      paidAmount: 1000,
      // collectedAmount is undefined
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
      dueDate: "2026-09-30",
      paidAt: "2026-09-15T00:00:00Z" as any,
      paymentId: "p3",
      createdAt: { seconds: 1792137600 } as any,
    };

    // 1. Contract verification
    expect(getInvoicePaidAmount(inv1)).toBe(3000);
    expect(getInvoiceCollectedAmount(inv1)).toBe(3500);
    expect(isInvoiceCollectedAmountKnown(inv1)).toBe(true);
    expect(getInvoiceRemainingDue(inv1)).toBe(0);
    expect(getInvoiceRemainingToRefund(inv1)).toBe(500);

    expect(getInvoicePaidAmount(inv2)).toBe(500);
    expect(getInvoiceCollectedAmount(inv2)).toBe(500);
    expect(isInvoiceCollectedAmountKnown(inv2)).toBe(true);
    expect(getInvoiceRemainingDue(inv2)).toBe(1500);
    expect(getInvoiceRemainingToRefund(inv2)).toBe(0);

    expect(getInvoicePaidAmount(inv3_legacy)).toBe(1000);
    expect(getInvoiceCollectedAmount(inv3_legacy)).toBe(1000);
    expect(isInvoiceCollectedAmountKnown(inv3_legacy)).toBe(false);
    expect(getInvoiceRemainingDue(inv3_legacy)).toBe(0);
    expect(getInvoiceRemainingToRefund(inv3_legacy)).toBe(0);

    // 2. Admin summary metrics consistency
    const allInvoices = [inv1, inv2, inv3_legacy];
    const totalOutstanding = allInvoices.reduce((acc, inv) => acc + (inv.status !== "paid" && inv.status !== "void" ? getInvoiceRemainingDue(inv) : 0), 0);
    const totalPaidApplied = allInvoices.reduce((acc, inv) => acc + getInvoicePaidAmount(inv), 0);
    const totalCashCollected = allInvoices.reduce((acc, inv) => acc + getInvoiceCollectedAmount(inv), 0);
    const totalRefundLiability = allInvoices.reduce((acc, inv) => acc + getInvoiceRemainingToRefund(inv), 0);

    expect(totalOutstanding).toBe(1500); // 2000 - 500
    expect(totalPaidApplied).toBe(4500); // 3000 + 500 + 1000 applied
    expect(totalCashCollected).toBe(5000); // 3500 + 500 + 1000 gross cash
    expect(totalRefundLiability).toBe(500); // 500 refundable excess
    expect(totalCashCollected - totalPaidApplied).toBe(totalRefundLiability);

    // 3. Monthly CSV report consistency - displays "Unknown (Legacy)" when exact collection is unrecorded
    vi.spyOn(accountsRepository, "getInvoicesInRange").mockResolvedValue(allInvoices);
    const csv = await accountsRepository.generateMonthlyReport("2026-10");

    expect(csv).toContain("Invoice Number,Customer ID,Billing Period Start,Billing Period End,Subtotal,Deposit Held,Total Due,Paid Amount,Collected Amount,Remaining Due,Remaining to Refund,Status,Date");
    // Row 1: inv1 (3000 total due, 3000 paid, 3500 collected, 0 remaining due, 500 refund)
    expect(csv).toContain("INV-18-01,cust_p6e_1,2026-10-01,2026-10-31,3000,0,3000,3000,3500,0,500,paid");
    // Row 2: inv2 (2000 total due, 500 paid, 500 collected, 1500 remaining due, 0 refund)
    expect(csv).toContain("INV-18-02,cust_p6e_1,2026-10-01,2026-10-31,2000,0,2000,500,500,1500,0,issued");
    // Row 3: inv3_legacy (1000 total due, 1000 paid, "Unknown (Legacy)" collected, 0 remaining due, 0 refund)
    expect(csv).toContain("INV-18-03,cust_p6e_1,2026-09-01,2026-09-30,1000,0,1000,1000,Unknown (Legacy),0,0,paid");
  });

  // Scenario 19: Subscription advance payments are scoped strictly to the appropriate billing cycle
  it("Scenario 19: Subscription advances are strictly cycle-scoped: earlier, later, and unattributed receipts are excluded", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_sc19_${dateStr}`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: "delivered",
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      // Eligible payment for this October cycle
      {
        id: "pay_oct_valid",
        subscriptionId,
        customerId,
        amount: 2500,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-10",
      } as any,
      // Earlier cycle payment (September)
      {
        id: "pay_sep_old",
        subscriptionId,
        customerId,
        amount: 3000,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-09",
      } as any,
      // Later cycle payment (November)
      {
        id: "pay_nov_future",
        subscriptionId,
        customerId,
        amount: 3000,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-11",
      } as any,
      // Payment already linked to a different invoice
      {
        id: "pay_already_invoiced",
        subscriptionId,
        customerId,
        amount: 1000,
        status: "verified",
        purpose: "usage",
        invoiceId: "inv_different_cycle",
        billingMonth: "2026-10",
      } as any,
      // Unattributed payment (no billingMonth, no paymentDate)
      {
        id: "pay_unattributed",
        subscriptionId,
        customerId,
        amount: 500,
        status: "verified",
        purpose: "usage",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const created = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(created.totalAmount).toBe(3000);
    // Only pay_oct_valid (2500) is attributed!
    expect(created.paidAmount).toBe(2500);
    expect(created.collectedAmount).toBe(2500);
    expect(getInvoiceRemainingDue(created)).toBe(500);
    expect(getInvoiceRemainingToRefund(created)).toBe(0);
    expect(created.status).toBe("issued");
  });

  // Scenario 20: Prevention of reusing one advance payment across multiple billing cycles
  it("Scenario 20: An advance payment linked to one invoice is never re-allocated to subsequent billing cycles", async () => {
    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_sc20_${i}`,
      subscriptionId,
      customerId,
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    const novemberSub: Subscription = {
      ...baseSubscription,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    };

    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    // Customer's payment history contains a payment from October that was already allocated to October's invoice
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "pay_oct_allocated",
        subscriptionId,
        customerId,
        amount: 3000,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-10",
        invoiceId: `inv_${subscriptionId}_2026-10-30`, // Linked to October bill!
      } as any,
    ]);

    await billingService.processSubscriptionEnd(novemberSub, "2026-11-30", "expired");

    const novemberInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-11-30`];
    expect(novemberInvoice.totalAmount).toBe(3000);
    // The October payment is NOT reused
    expect(novemberInvoice.paidAmount).toBe(0);
    expect(novemberInvoice.collectedAmount).toBe(0);
    expect(getInvoiceRemainingDue(novemberInvoice)).toBe(3000);
    expect(novemberInvoice.status).toBe("issued");
  });

  // Scenario 21: De-duplication of duplicate payment records in query results
  it("Scenario 21: Retried or duplicated payment records in query results are de-duplicated by ID and never double-count", async () => {
    const orders: Order[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ord_sc21_${i}`,
      subscriptionId,
      customerId,
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      mealType: "lunch",
      status: "delivered",
      price: 100,
    } as Order));

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    const paymentRecord = {
      id: "pay_dup_single",
      subscriptionId,
      customerId,
      amount: 1500,
      status: "verified",
      purpose: "meal_plan",
      billingMonth: "2026-10",
    } as any;

    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    // Duplicate payment object in the returned array (e.g. from retried reads or join artifact)
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      paymentRecord,
      paymentRecord,
    ]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const invoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(invoice.totalAmount).toBe(3000);
    // Deduplicated: 1500, NOT 3000!
    expect(invoice.paidAmount).toBe(1500);
    expect(invoice.collectedAmount).toBe(1500);
    expect(getInvoiceRemainingDue(invoice)).toBe(1500);
  });
});
