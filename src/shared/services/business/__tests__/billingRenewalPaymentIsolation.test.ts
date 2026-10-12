import { describe, it, expect, vi, beforeEach } from "vitest";
import { billingService } from "../billingService";
import { orderRepository } from "@/shared/services/firestore/orderRepository";
import { paymentRepository } from "@/shared/services/firestore/paymentRepository";
import type { Subscription, ManualPayment } from "@/shared/types";

vi.mock("@/shared/lib/firebase", () => ({
  functions: {},
  db: {},
}));

let mockCreatedInvoices: Record<string, any> = {};

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    runTransaction: vi.fn(async (_db, cb) => {
      const txn = {
        get: vi.fn().mockImplementation(async (ref: any) => ({
          exists: () => !!mockCreatedInvoices[ref.id],
          data: () => mockCreatedInvoices[ref.id],
        })),
        set: vi.fn((ref: any, data: any) => {
          mockCreatedInvoices[ref.id] = data;
        }),
        update: vi.fn((ref: any, data: any) => {
          if (mockCreatedInvoices[ref.id]) {
            Object.assign(mockCreatedInvoices[ref.id], data);
          }
        }),
      };
      await cb(txn);
      return txn;
    }),
    doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
    getDoc: vi.fn().mockImplementation(async (ref: any) => ({
      exists: () => !!mockCreatedInvoices[ref.id],
      data: () => mockCreatedInvoices[ref.id],
    })),
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
    getByCustomerId: vi.fn(),
  },
}));

describe("Bug 1: Subscription Renewal Billing & Payment Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatedInvoices = {};
  });

  const baseSubMonth1: Subscription = {
    id: "sub-renewal-1",
    customerId: "cust-1",
    planId: "plan-std",
    planTier: "regular",
    status: "active",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    billingCycle: "monthly",
    quantity: 1,
    pricingMatrixSnapshot: {
      lunch: 100,
    },
    depositAmount: 1500,
  } as any;

  const month1Orders = Array.from({ length: 30 }, (_, i) => ({
    id: `ord-m1-${i + 1}`,
    subscriptionId: "sub-renewal-1",
    customerId: "cust-1",
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    mealType: "lunch",
    status: "delivered",
  }));

  const month2Orders = Array.from({ length: 30 }, (_, i) => ({
    id: `ord-m2-${i + 1}`,
    subscriptionId: "sub-renewal-1",
    customerId: "cust-1",
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    mealType: "lunch",
    status: "delivered",
  }));

  const month1Payment: ManualPayment = {
    id: "pay-m1",
    customerId: "cust-1",
    subscriptionId: "sub-renewal-1",
    customerName: "Customer One",
    amount: 3000,
    currency: "INR",
    paymentMethod: "upi",
    referenceNumber: "UPI-M1-12345",
    paymentDate: "2026-08-02",
    billingMonth: "2026-08",
    status: "verified",
    purpose: "usage",
    verifiedBy: "admin-1",
    verificationDate: "MOCK_TIMESTAMP" as any,
    verificationNotes: "Approved",
    screenshotUrl: null,
    createdAt: "MOCK_TIMESTAMP" as any,
    updatedAt: "MOCK_TIMESTAMP" as any,
  };

  const securityDepositPayment: ManualPayment = {
    id: "pay-deposit",
    customerId: "cust-1",
    subscriptionId: "sub-renewal-1",
    customerName: "Customer One",
    amount: 1500,
    currency: "INR",
    paymentMethod: "upi",
    referenceNumber: "UPI-DEP-99999",
    paymentDate: "2026-07-28",
    billingMonth: "2026-08",
    status: "verified",
    purpose: "security_deposit",
    verifiedBy: "admin-1",
    verificationDate: "MOCK_TIMESTAMP" as any,
    verificationNotes: "Deposit Approved",
    screenshotUrl: null,
    createdAt: "MOCK_TIMESTAMP" as any,
    updatedAt: "MOCK_TIMESTAMP" as any,
  };

  it("Scenario A: Month 1 payment does NOT reduce Month 2 invoice", async () => {
    const renewedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      lastBilledDate: "2026-08-31",
      lastInvoiceId: "inv_sub-renewal-1_2026-08-31",
    };

    // Database has Month 1 payment and security deposit, but NO Month 2 payment
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      month1Payment,
      securityDepositPayment,
    ]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(renewedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    expect(m2Invoice).toBeDefined();
    // Month 2 has 30 orders @ ₹100 = ₹3,000.
    expect(m2Invoice.subtotal).toBe(3000);
    // Month 1 payment must NOT be applied to Month 2!
    expect(m2Invoice.totalAmount).toBe(3000);
    expect(m2Invoice.status).toBe("issued");
  });

  it("Scenario B: Month 2 payment reduces only Month 2 invoice", async () => {
    const renewedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      lastBilledDate: "2026-08-31",
      lastInvoiceId: "inv_sub-renewal-1_2026-08-31",
    };

    const month2Payment: ManualPayment = {
      ...month1Payment,
      id: "pay-m2",
      amount: 1000,
      paymentDate: "2026-09-05",
      billingMonth: "2026-09",
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      month1Payment,
      securityDepositPayment,
      month2Payment,
    ]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(renewedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    expect(m2Invoice).toBeDefined();
    expect(m2Invoice.subtotal).toBe(3000);
    expect(m2Invoice.totalAmount).toBe(3000);
    expect(m2Invoice.paidAmount).toBe(1000);
    // Remaining due = totalAmount (3000) - paidAmount (1000) = 2000
    expect(Math.max(0, m2Invoice.totalAmount - (m2Invoice.paidAmount || 0))).toBe(2000);
    expect(m2Invoice.status).toBe("issued");
  });

  it("Scenario C: Multiple valid payments in the same cycle are accumulated correctly", async () => {
    const renewedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    };

    const paymentPart1: ManualPayment = {
      ...month1Payment,
      id: "pay-m2-part1",
      amount: 1200,
      paymentDate: "2026-09-05",
      billingMonth: "2026-09",
    };

    const paymentPart2: ManualPayment = {
      ...month1Payment,
      id: "pay-m2-part2",
      amount: 800,
      paymentDate: "2026-09-18",
      billingMonth: "2026-09",
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([
      month1Payment,
      paymentPart1,
      paymentPart2,
    ]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(renewedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    expect(m2Invoice.subtotal).toBe(3000);
    expect(m2Invoice.totalAmount).toBe(3000);
    expect(m2Invoice.paidAmount).toBe(2000);
    // Remaining due = totalAmount (3000) - paidAmount (2000) = 1000
    expect(Math.max(0, m2Invoice.totalAmount - (m2Invoice.paidAmount || 0))).toBe(1000);
    expect(m2Invoice.status).toBe("issued");
  });

  it("Scenario D: Rejected payment does not reduce invoice balance", async () => {
    const renewedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    };

    const rejectedPayment: ManualPayment = {
      ...month1Payment,
      id: "pay-m2-rej",
      amount: 3000,
      paymentDate: "2026-09-05",
      billingMonth: "2026-09",
      status: "rejected",
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([rejectedPayment]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(renewedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    expect(m2Invoice.totalAmount).toBe(3000);
    expect(m2Invoice.status).toBe("issued");
  });

  it("Scenario H: Security deposit is not treated as meal-cycle usage payment", async () => {
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([securityDepositPayment]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month1Orders as any);

    await billingService.processSubscriptionEnd(baseSubMonth1, "2026-08-31");

    const m1Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-08-31"];
    expect(m1Invoice.subtotal).toBe(3000);
    // Security deposit of ₹1500 is NOT deducted from meal charges
    expect(m1Invoice.totalAmount).toBe(3000);
    expect(m1Invoice.depositHeld).toBe(1500);
    expect(m1Invoice.status).toBe("issued");
  });

  it("Scenario I: Add-on charges remain correctly billed alongside standard meals", async () => {
    const addonOrder = {
      id: "ord-m1-addon-1",
      subscriptionId: "sub-renewal-1",
      customerId: "cust-1",
      date: "2026-08-15",
      mealType: "lunch",
      isAddon: true,
      mealName: "Paneer Butter Masala",
      addonQuantity: 2,
      addonUnitPrice: 75,
      price: 150,
      status: "delivered",
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue([
      ...month1Orders,
      addonOrder as any,
    ]);

    await billingService.processSubscriptionEnd(baseSubMonth1, "2026-08-31");

    const m1Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-08-31"];
    // 30 standard @ 100 = 3000 + 150 addon = 3150
    expect(m1Invoice.subtotal).toBe(3150);
    expect(m1Invoice.totalAmount).toBe(3150);
  });

  it("Scenario J: Re-running billing operation remains idempotent", async () => {
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([month1Payment]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month1Orders as any);

    const firstRun = await billingService.processSubscriptionEnd(baseSubMonth1, "2026-08-31");
    expect(firstRun).toBe(true);
    const invCountAfterFirst = Object.keys(mockCreatedInvoices).length;

    const secondRun = await billingService.processSubscriptionEnd(baseSubMonth1, "2026-08-31");
    expect(secondRun).toBe(true);
    expect(Object.keys(mockCreatedInvoices).length).toBe(invCountAfterFirst);
  });

  it("Scenario K: Customer with no payment in new cycle gets full outstanding amount", async () => {
    const renewedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(renewedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    expect(m2Invoice.totalAmount).toBe(3000);
    expect(m2Invoice.status).toBe("issued");
  });

  it("Scenario L: A fully paid current cycle becomes paid with payableAmount 0", async () => {
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([month1Payment]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month1Orders as any);

    await billingService.processSubscriptionEnd(baseSubMonth1, "2026-08-31");

    const m1Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-08-31"];
    expect(m1Invoice.subtotal).toBe(3000);
    expect(m1Invoice.totalAmount).toBe(3000);
    expect(m1Invoice.paidAmount).toBe(3000);
    expect(Math.max(0, m1Invoice.totalAmount - (m1Invoice.paidAmount || 0))).toBe(0);
    expect(m1Invoice.status).toBe("paid");
  });

  it("Scenario G: Negotiated customer pricing calculates correctly and isolates payments", async () => {
    const negotiatedSubMonth2: Subscription = {
      ...baseSubMonth1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      negotiatedPricing: {
        breakfast: 50,
        lunch: 80, // Negotiated discount price
        dinner: 70,
        breakfast_lunch: 120,
        lunch_dinner: 140,
        breakfast_dinner: 110,
        breakfast_lunch_dinner: 190,
      },
    };

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValue([month1Payment]);
    vi.mocked(orderRepository.getBySubscriptionId).mockResolvedValue(month2Orders as any);

    await billingService.processSubscriptionEnd(negotiatedSubMonth2, "2026-09-30");

    const m2Invoice = mockCreatedInvoices["inv_sub-renewal-1_2026-09-30"];
    // 30 orders @ ₹80 = ₹2,400
    expect(m2Invoice.subtotal).toBe(2400);
    // Month 1 payment (₹3,000) not applied -> ₹2,400 due
    expect(m2Invoice.totalAmount).toBe(2400);
  });
});
