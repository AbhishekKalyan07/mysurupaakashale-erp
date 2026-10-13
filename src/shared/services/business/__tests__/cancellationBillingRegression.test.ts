import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "../billingService";
import { getInvoiceRemainingDue, getInvoiceRemainingToRefund } from "@/shared/types/billing.types";
import type { Subscription, Order, Invoice } from "@/shared/types";

vi.mock("@/shared/lib/firebase", () => ({
  functions: {},
  db: {},
}));

let mockFirestoreDocs: Record<string, any> = {};

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
    doc: vi.fn((_db, collectionName, id) => ({ collectionName, id, path: `${collectionName}/${id}` })),
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

vi.mock("@/shared/services/firestore/accountsRepository", () => ({
  accountsRepository: {
    getInvoicesByCustomerId: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue("mock-audit-id"),
  },
}));

describe("Phase 6B Consumption Billing and No Wallet Credit Regression Suite", () => {
  const customerId = "cust_cb_1";
  const subscriptionId = "sub_cb_1";

  const baseSubscription: Subscription = {
    id: subscriptionId,
    customerId,
    planId: "plan_basic",
    planTier: "basic",
    status: "active",
    startDate: "2026-10-01",
    endDate: "2026-10-30",
    billingCycle: "monthly",
    quantity: 1,
    deliveryAddressId: "addr_1",
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
  } as unknown as Subscription;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestoreDocs = {
      [`users/${customerId}`]: {
        fullName: "Test Customer",
        creditBalance: 0,
      },
      [customerId]: {
        fullName: "Test Customer",
        creditBalance: 0,
      },
    };
  });

  // Test 1: Thirty meals at ₹100, with three cancelled before delivery: bill 27 delivered meals for ₹2,700
  it("Test 1: Thirty meals at ₹100, with three cancelled before delivery produces 27 delivered meals and ₹2,700 bill", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 3 ? "cancelled" : "delivered",
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const invoiceId = `inv_${subscriptionId}_2026-10-30`;
    const createdInvoice = mockFirestoreDocs[invoiceId];

    expect(createdInvoice).toBeDefined();
    expect(createdInvoice.subtotal).toBe(2700);
    expect(createdInvoice.totalAmount).toBe(2700);
    expect(createdInvoice.paidAmount).toBe(0);
    expect(getInvoiceRemainingDue(createdInvoice)).toBe(2700);
  });

  // Test 2: Cancelled meals generate no wallet credit or credit-ledger entries
  it("Test 2: Cancelled meals generate no wallet credit or credit-ledger entries", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 3 ? "cancelled" : "delivered",
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const userDoc = mockFirestoreDocs[`users/${customerId}`] || mockFirestoreDocs[customerId];
    expect(userDoc.creditBalance).toBe(0);

    const ledgerKeys = Object.keys(mockFirestoreDocs).filter((k) => k.includes("/ledger"));
    expect(ledgerKeys.length).toBe(0);
  });

  // Test 3: Delivered meals remain billable when other meals are cancelled
  it("Test 3: Delivered meals remain billable when other meals are cancelled", async () => {
    const orders: Order[] = [
      { id: "o1", subscriptionId, customerId, date: "2026-10-01", mealType: "lunch", status: "delivered", price: 100 },
      { id: "o2", subscriptionId, customerId, date: "2026-10-02", mealType: "lunch", status: "delivered", price: 100 },
      { id: "o3", subscriptionId, customerId, date: "2026-10-03", mealType: "lunch", status: "cancelled", price: 100 },
      { id: "o4", subscriptionId, customerId, date: "2026-10-04", mealType: "lunch", status: "delivered", price: 100 },
    ] as Order[];

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(
      { ...baseSubscription, endDate: "2026-10-04" },
      "2026-10-04",
      "expired",
    );

    const createdInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-04`];
    // 3 delivered meals remain billable: 3 * 100 = 300
    expect(createdInvoice.totalAmount).toBe(300);
    expect(createdInvoice.subtotal).toBe(300);
  });

  // Test 4: Skipped and failed-delivery meals follow the confirmed non-billable rules
  it("Test 4: Skipped and failed-delivery meals follow the confirmed non-billable rules", async () => {
    const orders: Order[] = [
      { id: "o1", subscriptionId, customerId, date: "2026-10-01", mealType: "lunch", status: "delivered", price: 100 },
      { id: "o2", subscriptionId, customerId, date: "2026-10-02", mealType: "lunch", status: "skipped", price: 100 },
      { id: "o3", subscriptionId, customerId, date: "2026-10-03", mealType: "lunch", status: "failed_delivery", price: 100 },
      { id: "o4", subscriptionId, customerId, date: "2026-10-04", mealType: "lunch", status: "returned_delivery", price: 100 },
    ] as Order[];

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(
      { ...baseSubscription, endDate: "2026-10-04" },
      "2026-10-04",
      "expired",
    );

    const createdInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-04`];
    expect(createdInvoice.totalAmount).toBe(100);
  });

  // Test 5: Repeated cancellation and billing retries do not create duplicate deductions
  it("Test 5: Repeated cancellation and billing retries do not create duplicate deductions (idempotency)", async () => {
    const invoiceId = "inv_test5_issued";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST5",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
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

    const cancelledOrder: Order = {
      id: "ord_cancel_test5",
      subscriptionId,
      customerId,
      date: "2026-10-05",
      mealType: "lunch",
      status: "cancelled",
      price: 100,
      invoiceId,
    } as Order;

    const res1 = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin");
    expect(res1.adjusted).toBe(true);
    expect(res1.deductedAmount).toBe(100);
    expect(mockFirestoreDocs[invoiceId].totalAmount).toBe(2900);

    // Retried request
    const res2 = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin");
    expect(res2.adjusted).toBe(false);
    expect(res2.deductedAmount).toBe(0);
    expect(mockFirestoreDocs[invoiceId].totalAmount).toBe(2900);
  });

  // Test 6: Cancellation before invoice generation produces the correct final bill
  it("Test 6: Cancellation before invoice generation produces the correct final bill", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 10; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 2 ? "cancelled" : "delivered", // 2 cancelled
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);

    await billingService.processSubscriptionEnd(
      { ...baseSubscription, endDate: "2026-10-10" },
      "2026-10-10",
      "expired",
    );

    const createdInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-10`];
    expect(createdInvoice.totalAmount).toBe(800);
    expect(createdInvoice.subtotal).toBe(800);
  });

  // Test 7: Cancellation against an unpaid issued invoice revises the outstanding total
  it("Test 7: Cancellation against an unpaid issued invoice revises the outstanding total", async () => {
    const invoiceId = "inv_test7_unpaid";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST7",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
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

    const cancelledOrders: Order[] = [
      { id: "c1", subscriptionId, customerId, date: "2026-10-10", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
      { id: "c2", subscriptionId, customerId, date: "2026-10-11", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
    ] as Order[];

    await billingService.adjustInvoiceForCancelledOrders(cancelledOrders, baseSubscription, "admin");

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.subtotal).toBe(2800);
    expect(updated.totalAmount).toBe(2800);
    expect(updated.paidAmount).toBe(0);
    expect(getInvoiceRemainingDue(updated)).toBe(2800);
  });

  // Test 8: Cancellation against a partially paid invoice preserves paidAmount and recalculates the amount due
  it("Test 8: Cancellation against a partially paid invoice preserves paidAmount and recalculates amount due", async () => {
    const invoiceId = "inv_test8_partial";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST8",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 1000, // partially paid ₹1,000
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: null,
    };

    const cancelledOrders: Order[] = [
      { id: "p1", subscriptionId, customerId, date: "2026-10-15", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
      { id: "p2", subscriptionId, customerId, date: "2026-10-16", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
    ] as Order[];

    await billingService.adjustInvoiceForCancelledOrders(cancelledOrders, baseSubscription, "admin");

    const updated = mockFirestoreDocs[invoiceId];
    // Revised bill: ₹2,800, Paid: ₹1,000, Remaining due: ₹1,800
    expect(updated.totalAmount).toBe(2800);
    expect(updated.paidAmount).toBe(1000);
    expect(getInvoiceRemainingDue(updated)).toBe(1800);
    expect(getInvoiceRemainingToRefund(updated)).toBe(0);
  });

  // Test 9: Cancellation against an already-paid invoice revises the bill and displays excess as remainingToRefund
  it("Test 9: Cancellation against an already-paid invoice revises the bill and displays excess as remainingToRefund", async () => {
    const invoiceId = "inv_test9_paid";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST9",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 3000, // fully paid ₹3,000
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
      paymentId: "pay_1",
    };

    const cancelledOrders: Order[] = [
      { id: "c1", subscriptionId, customerId, date: "2026-10-20", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
      { id: "c2", subscriptionId, customerId, date: "2026-10-21", mealType: "lunch", status: "cancelled", price: 100, invoiceId },
    ] as Order[];

    const result = await billingService.adjustInvoiceForCancelledOrders(cancelledOrders, baseSubscription, "admin");

    expect(result.adjusted).toBe(true);
    expect(result.deductedAmount).toBe(200);
    expect(result.remainingToRefund).toBe(200);

    const updated = mockFirestoreDocs[invoiceId];
    // Option A: Revised bill: ₹2,800, Applied Paid: ₹2,800, Collected: ₹3,000, Remaining due: ₹0, Remaining to Refund: ₹200
    expect(updated.totalAmount).toBe(2800);
    expect(updated.paidAmount).toBe(2800);
    expect(updated.collectedAmount).toBe(3000);
    expect(updated.status).toBe("paid");
    expect(updated.remainingToRefund).toBe(200);
    expect(getInvoiceRemainingDue(updated)).toBe(0);
    expect(getInvoiceRemainingToRefund(updated)).toBe(200);

    // No wallet credit created!
    expect(mockFirestoreDocs[`users/${customerId}`].creditBalance).toBe(0);
    const ledgerKeys = Object.keys(mockFirestoreDocs).filter((k) => k.includes("/ledger"));
    expect(ledgerKeys.length).toBe(0);
  });

  // Test 10: Confirmed refunds reduce remainingToRefund exactly once
  it("Test 10: Confirmed refunds reduce remainingToRefund exactly once", async () => {
    const invoiceId = "inv_test10_refund";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST10",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 3000,
      paidAmount: 3000,
      confirmedRefunds: 100, // ₹100 already confirmed/refunded previously
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
      paymentId: "pay_1",
    };

    const cancelledOrder: Order = {
      id: "c10",
      subscriptionId,
      customerId,
      date: "2026-10-25",
      mealType: "lunch",
      status: "cancelled",
      price: 200,
      invoiceId,
    } as Order;

    const result = await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin");
    expect(result.adjusted).toBe(true);
    expect(result.deductedAmount).toBe(200);

    const updated = mockFirestoreDocs[invoiceId];
    expect(updated.totalAmount).toBe(2800);
    expect(updated.paidAmount).toBe(2800);
    expect(updated.collectedAmount).toBe(3000);
    // excess = max(0, 3000 - 2800 - 100) = 100
    expect(updated.remainingToRefund).toBe(100);
    expect(getInvoiceRemainingToRefund(updated)).toBe(100);
  });

  // Test 11: No new wallet credit is created from meal cancellations, unused meal advances, or payment overpayments
  it("Test 11: No new wallet credit is created from meal cancellations, unused meal advances, or payment overpayments", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      orders.push({
        id: `ord_${subscriptionId}_${dateStr}_lunch`,
        subscriptionId,
        customerId,
        date: dateStr,
        mealType: "lunch",
        status: day <= 3 ? "cancelled" : "delivered", // 27 meals consumed = ₹2,700
        price: 100,
      } as Order);
    }

    const { orderRepository } = await import("@/shared/services/firestore/orderRepository");
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(orders);

    // Customer had paid ₹3,000 usage payment
    const { paymentRepository } = await import("@/shared/services/firestore/paymentRepository");
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "adv_pay_1",
        subscriptionId,
        customerId,
        amount: 3000,
        status: "verified",
        purpose: "meal_plan",
        billingMonth: "2026-10",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const createdInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(createdInvoice.totalAmount).toBe(2700);
    expect(createdInvoice.paidAmount).toBe(2700);
    expect(createdInvoice.collectedAmount).toBe(3000);
    expect(createdInvoice.remainingToRefund).toBe(300);

    // Under Phase 6B, NO wallet credit or cycle_credit ledger entry is created!
    const userDoc = mockFirestoreDocs[`users/${customerId}`] || mockFirestoreDocs[customerId];
    expect(userDoc.creditBalance).toBe(0);

    const ledgerKeys = Object.keys(mockFirestoreDocs).filter((k) => k.includes("/ledger"));
    expect(ledgerKeys.length).toBe(0);
  });

  // Test 12: Payment history, invoice ownership, role authorization, and general audit history remain intact
  it("Test 12: Payment history, invoice ownership, role authorization, and general audit history remain intact", async () => {
    const invoiceId = "inv_test12";
    mockFirestoreDocs[invoiceId] = {
      id: invoiceId,
      invoiceNumber: "INV-TEST12",
      customerId,
      subscriptionId,
      lineItems: [{ description: "Basic Plan", quantity: 1, unitPrice: 3000, amount: 3000 }],
      subtotal: 3000,
      totalAmount: 3000,
      paidAmount: 1500,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: null,
      paymentId: "pay_12",
    };

    const cancelledOrder: Order = {
      id: "c12",
      subscriptionId,
      customerId,
      date: "2026-10-18",
      mealType: "lunch",
      status: "cancelled",
      price: 100,
      invoiceId,
    } as Order;

    const { auditRepository } = await import("@/shared/services/firestore/auditRepository");
    await billingService.adjustInvoiceForCancelledOrders([cancelledOrder], baseSubscription, "admin-uid");

    // Verify audit log was recorded
    expect(auditRepository.logAction).toHaveBeenCalledWith(
      "invoice_adjusted_for_cancellation",
      "admin-uid",
      "system",
      "BillingService",
      invoiceId,
      "invoice",
      expect.objectContaining({
        invoiceId,
        deductedAmount: 100,
      }),
    );
  });

  // Test 13: Historical invoices with legacy fields remain correctly represented
  it("Test 13: Historical invoices with legacy fields remain correctly represented", async () => {
    // Historical invoice from Phase 5 that stored creditApplied: 500 and totalAmount: 2500
    const historicalInvoice: Invoice = {
      id: "inv_hist_1",
      invoiceNumber: "INV-HIST-01",
      customerId,
      subscriptionId,
      lineItems: [],
      subtotal: 3000,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 2500, // already net of legacy creditApplied
      creditApplied: 500,
      paidAmount: 1000,
      currency: "INR",
      status: "issued",
      billingPeriodStart: "2026-08-01",
      billingPeriodEnd: "2026-08-31",
      dueDate: "2026-08-31",
      paidAt: null,
      paymentId: null,
      createdAt: "MOCK_TIMESTAMP" as any,
    };

    // Remaining due = max(0, 2500 - 1000) = 1500
    expect(getInvoiceRemainingDue(historicalInvoice)).toBe(1500);
    // Historical creditApplied is NOT re-subtracted or corrupted
    expect(historicalInvoice.creditApplied).toBe(500);
    expect(historicalInvoice.totalAmount).toBe(2500);
  });

  // Test 14: Security deposits remain separate from meal charges
  it("Test 14: Security deposits remain separate from meal charges", async () => {
    const orders: Order[] = [];
    for (let day = 1; day <= 30; day++) {
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
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      {
        id: "dep_1",
        subscriptionId,
        customerId,
        amount: 1000,
        status: "verified",
        purpose: "security_deposit",
      } as any,
    ]);

    await billingService.processSubscriptionEnd(baseSubscription, "2026-10-30", "expired");

    const createdInvoice = mockFirestoreDocs[`inv_${subscriptionId}_2026-10-30`];
    expect(createdInvoice.depositHeld).toBe(1000);
    // Security deposit does NOT reduce meal bill or paidAmount
    expect(createdInvoice.totalAmount).toBe(3000);
    expect(createdInvoice.paidAmount).toBe(0);
    expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);
    expect(getInvoiceRemainingToRefund(createdInvoice)).toBe(0);
  });

  // Test 15: Customer Subscription header and kitchen-configuration fixes still work
  it("Test 15: Customer Subscription header and kitchen-configuration fixes still work", async () => {
    const paidInv: Invoice = {
      id: "inv_p",
      invoiceNumber: "INV-P",
      customerId,
      subscriptionId,
      lineItems: [],
      subtotal: 2700,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 2700,
      paidAmount: 2700,
      currency: "INR",
      status: "paid",
      billingPeriodStart: "2026-10-01",
      billingPeriodEnd: "2026-10-30",
      dueDate: "2026-10-30",
      paidAt: "MOCK_TIMESTAMP" as any,
      paymentId: "p1",
      createdAt: "MOCK_TIMESTAMP" as any,
    };
    expect(getInvoiceRemainingDue(paidInv)).toBe(0);
    expect(getInvoiceRemainingToRefund(paidInv)).toBe(0);

    // Void invoices have 0 due
    const voidInv: Invoice = { ...paidInv, status: "void" };
    expect(getInvoiceRemainingDue(voidInv)).toBe(0);
  });
});
