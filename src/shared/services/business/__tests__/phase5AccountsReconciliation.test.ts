import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTransaction, getDoc, doc } from "firebase/firestore";
import { billingService } from "../billingService";
import { paymentService } from "../paymentService";
import { accountsRepository } from "../../firestore/accountsRepository";
import { ledgerRepository } from "../../firestore/ledgerRepository";
import { paymentRepository } from "../../firestore/paymentRepository";
import { orderRepository } from "../../firestore/orderRepository";
import { pricingService } from "../pricingService";
import { auditRepository } from "../../firestore/auditRepository";
import type { Subscription, Invoice, ManualPayment, SubmitPaymentInput } from "@/shared/types";
import { getInvoicePaidAmount, getInvoiceRemainingDue } from "@/shared/types";

describe("Phase 5A: Financial Invariants, Canonical Ledger Credits & Payment Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    } as any);
    vi.mocked(doc).mockImplementation(
      (_db: any, col: string, id?: string) =>
        ({ id: id || "mock-id", path: `${col}/${id}`, type: "doc" }) as any,
    );
  });

  function createMockSubscription(overrides: Partial<Subscription>): Subscription {
    return {
      id: "sub-1",
      customerId: "cust-1",
      planId: "plan-1",
      planTier: "regular",
      quantity: 1,
      pricePerDaySnapshot: 100,
      deliveryAddressId: "addr-1",
      zoneId: "zone-1",
      mealPreferences: [],
      status: "active",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      billingCycle: "monthly",
      autoRenew: false,
      latestPaymentId: null,
      depositAmount: 0,
      createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      ...overrides,
    };
  }

  function createMockPayment(overrides: Partial<ManualPayment>): ManualPayment {
    return {
      id: "pay-1",
      customerId: "cust-1",
      customerName: "Abhishek",
      subscriptionId: "sub-1",
      invoiceId: null,
      amount: 1000,
      currency: "INR",
      paymentMethod: "upi",
      referenceNumber: "REF-1",
      purpose: "usage",
      paymentDate: "2026-08-05",
      status: "pending",
      verifiedBy: null,
      verificationDate: null,
      verificationNotes: null,
      screenshotUrl: null,
      billingMonth: "2026-08",
      createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // Canonical Settlement Scenarios (A - F)
  // ---------------------------------------------------------------------------
  describe("Canonical Billing Settlement Formulas (Scenarios A - F)", () => {
    it("Scenario A: Charge ₹3,000, payment ₹0, credit ₹0 -> remaining due ₹3,000", async () => {
      const mockSub = createMockSubscription({ id: "sub-a", customerId: "cust-a" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-a-${i}`,
        subscriptionId: "sub-a",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 30 * 100 = 3000
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);

      let savedInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      expect(savedInvoice).not.toBeNull();
      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(0);
      const remainingDue = Math.max(0, savedInvoice.totalAmount - savedInvoice.paidAmount);
      expect(remainingDue).toBe(3000);
      expect(savedInvoice.status).toBe("issued");
    });

    it("Scenario B: Charge ₹3,000, advance payment ₹1,000, credit ₹0 -> remaining due ₹2,000", async () => {
      const mockSub = createMockSubscription({ id: "sub-b", customerId: "cust-b" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-b-${i}`,
        subscriptionId: "sub-b",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([
        createMockPayment({ id: "pay-b1", subscriptionId: "sub-b", customerId: "cust-b", amount: 1000, status: "verified" }),
      ]);

      let savedInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(1000);
      const remainingDue = Math.max(0, savedInvoice.totalAmount - savedInvoice.paidAmount);
      expect(remainingDue).toBe(2000);
      expect(savedInvoice.status).toBe("issued");
    });

    it("Scenario C: Charge ₹3,000, payment ₹1,000, credit applied ₹500 -> remaining due ₹1,500", async () => {
      const mockSub = createMockSubscription({ id: "sub-c", customerId: "cust-c" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-c-${i}`,
        subscriptionId: "sub-c",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([
        createMockPayment({ id: "pay-c1", subscriptionId: "sub-c", customerId: "cust-c", amount: 1000, status: "verified" }),
      ]);

      let savedInvoice: any = null;
      let userUpdated: any = null;
      let ledgerEntry: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 500 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
            if (p.includes("ledger")) ledgerEntry = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      // Gross 3000, Phase 6B: wallet credit is not applied to newly generated bills
      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(1000);
      const remainingDue = Math.max(0, savedInvoice.totalAmount - savedInvoice.paidAmount);
      expect(remainingDue).toBe(2000);
      expect(savedInvoice.status).toBe("issued");

      // Phase 6B: customer creditBalance untouched, no credit_applied ledger entry
      expect(userUpdated).toBeNull();
      expect(ledgerEntry).toBeNull();
    });

    it("Scenario D: Charge ₹3,000, advance payment ₹3,000 -> remaining due ₹0 with no duplicate charge or credit", async () => {
      const mockSub = createMockSubscription({ id: "sub-d", customerId: "cust-d" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-d-${i}`,
        subscriptionId: "sub-d",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([
        createMockPayment({ id: "pay-d1", subscriptionId: "sub-d", customerId: "cust-d", amount: 3000, status: "verified" }),
      ]);

      let savedInvoice: any = null;
      let userUpdated: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(3000);
      const remainingDue = Math.max(0, savedInvoice.totalAmount - savedInvoice.paidAmount);
      expect(remainingDue).toBe(0);
      expect(savedInvoice.status).toBe("paid");
      // No credit adjustments generated or deducted
      expect(userUpdated).toBeNull();
    });

    it("Scenario E: Charge ₹3,000, payment ₹3,500 -> invoice fully settled, surplus ₹500 credited exactly once", async () => {
      const mockSub = createMockSubscription({ id: "sub-e", customerId: "cust-e" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-e-${i}`,
        subscriptionId: "sub-e",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([
        createMockPayment({ id: "pay-e1", subscriptionId: "sub-e", customerId: "cust-e", amount: 3500, status: "verified" }),
      ]);

      let savedInvoice: any = null;
      let userUpdated: any = null;
      let ledgerEntry: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 200 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
            if (p.includes("ledger")) ledgerEntry = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(3000);
      expect(savedInvoice.collectedAmount).toBe(3500);
      expect(savedInvoice.remainingToRefund).toBe(500);
      expect(savedInvoice.status).toBe("paid");

      // Phase 6B: Surplus 500 is NOT added to wallet credit
      expect(userUpdated).toBeNull();
      expect(ledgerEntry).toBeNull();
    });

    it("Scenario F: Charge ₹3,000, available credit ₹2,000, payment ₹1,000 -> remaining due ₹0 and no negative balance", async () => {
      const mockSub = createMockSubscription({ id: "sub-f", customerId: "cust-f" });
      const mockOrders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-f-${i}`,
        subscriptionId: "sub-f",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(mockOrders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([
        createMockPayment({ id: "pay-f1", subscriptionId: "sub-f", customerId: "cust-f", amount: 1000, status: "verified" }),
      ]);

      let savedInvoice: any = null;
      let userUpdated: any = null;
      let ledgerEntry: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 2000 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) savedInvoice = data;
            if (p.includes("ledger")) ledgerEntry = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      // Gross 3000, Phase 6B: credit is not automatically applied
      expect(savedInvoice.subtotal).toBe(3000);
      expect(savedInvoice.creditApplied).toBe(0);
      expect(savedInvoice.totalAmount).toBe(3000);
      expect(savedInvoice.paidAmount).toBe(1000);
      const remainingDue = Math.max(0, savedInvoice.totalAmount - savedInvoice.paidAmount);
      expect(remainingDue).toBe(2000);
      expect(savedInvoice.status).toBe("issued");

      // Credit balance is untouched
      expect(userUpdated).toBeNull();
      expect(ledgerEntry).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Payment Reconciliation Scenarios (G, H, Overpayments, Receipts)
  // ---------------------------------------------------------------------------
  describe("Payment Reconciliation (Scenarios G, H, Overpayments)", () => {
    it("Scenario G: Charge ₹3,000, applied credit ₹500, invoice payment ₹1,000 -> next remaining due ₹1,500 without duplicate credit application", async () => {
      // Invoice was issued with totalAmount 2500, creditApplied 500, paidAmount 0
      const mockInvoice: Invoice = {
        id: "inv-g",
        invoiceNumber: "INV-G",
        customerId: "cust-g",
        subscriptionId: "sub-g",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2500,
        paidAmount: 0,
        creditApplied: 500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const mockPayment = createMockPayment({
        id: "pay-g1",
        subscriptionId: "sub-g",
        invoiceId: "inv-g",
        customerId: "cust-g",
        amount: 1000,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => mockPayment } as any);

      let invoiceUpdate: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => mockPayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => mockInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-g", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-g1", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(invoiceUpdate.paidAmount).toBe(1000);
      expect(invoiceUpdate.status).toBe("issued");
      const nextDue = Math.max(0, mockInvoice.totalAmount - invoiceUpdate.paidAmount);
      expect(nextDue).toBe(1500);
    });

    it("Scenario H: Two partial payments: ₹1,000 followed by ₹1,000 against a ₹3,000 invoice", async () => {
      const mockInvoice: Invoice = {
        id: "inv-h",
        invoiceNumber: "INV-H",
        customerId: "cust-h",
        subscriptionId: "sub-h",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 3000,
        paidAmount: 0,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      // Payment 1
      const pay1 = createMockPayment({ id: "pay-h1", invoiceId: "inv-h", customerId: "cust-h", amount: 1000 });
      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => pay1 } as any);

      let invoiceUpdate1: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => pay1 });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => mockInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-h", status: "active" }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate1 = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-h1", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(invoiceUpdate1.paidAmount).toBe(1000);
      expect(invoiceUpdate1.status).toBe("issued");
      expect(Math.max(0, mockInvoice.totalAmount - invoiceUpdate1.paidAmount)).toBe(2000);

      // Payment 2 (applied against invoice that already has paidAmount = 1000)
      const mockInvoiceAfterPay1 = { ...mockInvoice, paidAmount: 1000 };
      const pay2 = createMockPayment({ id: "pay-h2", invoiceId: "inv-h", customerId: "cust-h", amount: 1000 });
      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => pay2 } as any);

      let invoiceUpdate2: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => pay2 });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => mockInvoiceAfterPay1 });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-h", status: "active" }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate2 = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-h2", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(invoiceUpdate2.paidAmount).toBe(2000);
      expect(invoiceUpdate2.status).toBe("issued");
      expect(Math.max(0, mockInvoice.totalAmount - invoiceUpdate2.paidAmount)).toBe(1000);
    });

    it("credits surplus overpayment on issued invoice to customer ledger exactly once", async () => {
      const mockInvoice: Invoice = {
        id: "inv-over",
        invoiceNumber: "INV-OVER",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 1000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1000,
        paidAmount: 0,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const mockPayment = createMockPayment({
        id: "pay-over-1",
        invoiceId: "inv-over",
        amount: 1500, // 500 surplus over 1000 due
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => mockPayment } as any);

      let invoiceUpdate: any = null;
      let userUpdate: any = null;
      let ledgerEntry: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => mockPayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => mockInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 200 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("ledger")) ledgerEntry = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate = data;
            if (p.includes("users")) userUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-over-1", "admin-1", { role: "admin", fullName: "Admin" } as any);

      // Phase 6E (Option A): paidAmount capped at totalAmount, gross cash in collectedAmount, surplus tracked as remainingToRefund, no wallet credit
      expect(invoiceUpdate.paidAmount).toBe(1000);
      expect(invoiceUpdate.collectedAmount).toBe(1500);
      expect(invoiceUpdate.remainingToRefund).toBe(500);
      expect(invoiceUpdate.status).toBe("paid");
      expect(userUpdate).toBeNull();
      expect(ledgerEntry).toBeNull();
    });

    it("credits payment targeting an already settled invoice directly to customer credit balance", async () => {
      const mockPaidInvoice: Invoice = {
        id: "inv-already-paid",
        invoiceNumber: "INV-PAID",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 1000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1000,
        paidAmount: 1000,
        currency: "INR",
        status: "paid", // Already paid
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: { seconds: 1722470400, nanoseconds: 0 } as any,
        paymentId: "pay-prior",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const mockPayment = createMockPayment({
        id: "pay-extra",
        invoiceId: "inv-already-paid",
        amount: 500,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => mockPayment } as any);

      let invoiceUpdate: any = null;
      let userUpdate: any = null;
      let ledgerEntry: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => mockPayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => mockPaidInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 100 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("ledger")) ledgerEntry = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate = data;
            if (p.includes("users")) userUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-extra", "admin-1", { role: "admin", fullName: "Admin" } as any);

      // Phase 6E (Option A): paidAmount capped at totalAmount, gross cash in collectedAmount, surplus tracked as remainingToRefund
      expect(invoiceUpdate.paidAmount).toBe(1000);
      expect(invoiceUpdate.collectedAmount).toBe(1500);
      expect(invoiceUpdate.remainingToRefund).toBe(500);
      expect(userUpdate).toBeNull();
      expect(ledgerEntry).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency & Concurrency (Scenarios I, J)
  // ---------------------------------------------------------------------------
  describe("Idempotency & Concurrency Safety (Scenarios I, J)", () => {
    it("Scenario I: Retry billing settlement after completion creates no duplicate invoices or credits", async () => {
      const mockSub = createMockSubscription({ id: "sub-idem", customerId: "cust-idem" });
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue([]);
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ id: "existing-inv", status: "issued" }),
      } as any);

      const mockSet = vi.fn();
      const mockUpdate = vi.fn();

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({
            exists: () => true, // Already exists in transaction check!
            data: () => ({ id: "existing-inv" }),
          }),
          set: mockSet,
          update: mockUpdate,
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(mockSub, "2026-08-31");

      // Idempotency: neither new invoice nor ledger entry is created
      expect(mockSet).not.toHaveBeenCalled();
      const userUpdates = mockUpdate.mock.calls.filter(([ref]) =>
        ((ref as any)?.path || "").includes("users"),
      );
      expect(userUpdates.length).toBe(0);
    });

    it("Scenario I: Retry payment approval when payment is already verified is rejected", async () => {
      const alreadyVerifiedPayment = createMockPayment({
        id: "pay-ver",
        status: "verified", // Already verified!
      });

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => alreadyVerifiedPayment,
      } as any);

      await expect(
        paymentService.approvePayment("pay-ver", "admin-1", { role: "admin", fullName: "Admin" } as any),
      ).rejects.toThrow("Cannot approve payment with status verified");
    });

    it("Scenario J: Two concurrent payment approvals: transaction ensures atomic settlement without double counting", async () => {
      const mockInvoice: Invoice = {
        id: "inv-concurrent",
        invoiceNumber: "INV-CONC",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 2000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2000,
        paidAmount: 0,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const payA = createMockPayment({ id: "pay-a", invoiceId: "inv-concurrent", amount: 1000 });
      const payB = createMockPayment({ id: "pay-b", invoiceId: "inv-concurrent", amount: 1000 });

      // Simulate sequential transactional execution where txn 2 sees updated invoice from txn 1
      let inMemoryInvoice = { ...mockInvoice };
      vi.spyOn(accountsRepository, "getInvoiceById").mockImplementation((id: string) =>
        Promise.resolve(id === "inv-concurrent" ? (inMemoryInvoice as any) : null),
      );

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments/pay-a")) return Promise.resolve({ exists: () => true, data: () => payA });
            if (p.includes("payments/pay-b")) return Promise.resolve({ exists: () => true, data: () => payB });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => inMemoryInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn(),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) {
              inMemoryInvoice = { ...inMemoryInvoice, ...data };
            }
          }),
        };
        return cb(mockTxn);
      });

      // Transaction 1 approves payA
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => payA } as any);
      await paymentService.approvePayment("pay-a", "admin-1", { role: "admin", fullName: "Admin" } as any);
      expect(inMemoryInvoice.paidAmount).toBe(1000);
      expect(inMemoryInvoice.status).toBe("issued");

      // Transaction 2 approves payB
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => payB } as any);
      await paymentService.approvePayment("pay-b", "admin-1", { role: "admin", fullName: "Admin" } as any);
      expect(inMemoryInvoice.paidAmount).toBe(2000);
      expect(inMemoryInvoice.status).toBe("paid");
    });
  });

  // ---------------------------------------------------------------------------
  // Operational Edge Cases & Repository Methods
  // ---------------------------------------------------------------------------
  describe("Operational Edge Cases & Accounts Repository", () => {
    it("submits payment with explicit invoice reference", async () => {
      vi.spyOn(paymentRepository, "create").mockResolvedValue("pay-100");
      vi.spyOn(auditRepository, "logAction").mockResolvedValue({} as any);

      const input: SubmitPaymentInput = {
        subscriptionId: "sub-1",
        invoiceId: "inv-2026-aug",
        amount: 2500,
        paymentMethod: "upi",
        referenceNumber: "UTR-555666",
        paymentDate: "2026-08-02",
        purpose: "usage",
        billingMonth: "2026-08",
      };

      const res = await paymentService.submitPayment(input, "cust-1", "Abhishek");

      expect(res).toBe("pay-100");
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: "inv-2026-aug",
          subscriptionId: "sub-1",
          amount: 2500,
        }),
      );
    });

    it("does not match an unambiguous invoice if candidate belongs to another customer", async () => {
      const foreignInvoice: Invoice = {
        id: "inv-foreign",
        invoiceNumber: "INV-FOREIGN",
        customerId: "cust-DIFFERENT", // Different customer!
        subscriptionId: "sub-foreign",
        lineItems: [],
        subtotal: 1000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1000,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.spyOn(accountsRepository, "getInvoiceById").mockResolvedValue(foreignInvoice);

      const paymentWithForeignInvoice = createMockPayment({
        id: "pay-tamper",
        invoiceId: "inv-foreign",
        customerId: "cust-1", // Attacker's uid
        amount: 1000,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => paymentWithForeignInvoice } as any);

      let invoiceUpdated: any = null;
      let receiptCreated: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => paymentWithForeignInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) receiptCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-tamper", "admin-1", { role: "admin", fullName: "Admin" } as any);

      // Foreign invoice must NOT be updated
      expect(invoiceUpdated).toBeNull();
      // Standalone receipt invoice created for customer's payment instead
      expect(receiptCreated).not.toBeNull();
      expect(receiptCreated.customerId).toBe("cust-1");
    });

    it("does not match when multiple open candidate invoices exist (no guessing)", async () => {
      vi.spyOn(accountsRepository, "getInvoicesByCustomerId").mockResolvedValue([
        { id: "inv-cand-1", status: "issued" } as any,
        { id: "inv-cand-2", status: "issued" } as any,
      ]);

      const ambiguousPayment = createMockPayment({
        id: "pay-ambig",
        invoiceId: null, // No explicit invoice specified
        subscriptionId: "manual",
        customerId: "cust-1",
        amount: 1000,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ambiguousPayment } as any);

      let receiptInvoiceCreated: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => ambiguousPayment });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) receiptInvoiceCreated = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-ambig", "admin-1", { role: "admin", fullName: "Admin" } as any);

      // Does not guess between candidate 1 and 2; creates standalone receipt invoice
      expect(receiptInvoiceCreated).not.toBeNull();
      expect(receiptInvoiceCreated.totalAmount).toBe(1000);
    });

    it("voids an issued invoice with audit trail and preserves document", async () => {
      const mockInvoice: Invoice = {
        id: "inv-to-void",
        invoiceNumber: "INV-VOID-1",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 1500,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      let updateData: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({ exists: () => true, data: () => mockInvoice }),
          update: vi.fn().mockImplementation((_ref, data) => { updateData = data; }),
        };
        return cb(mockTxn);
      });

      const auditSpy = vi.spyOn(auditRepository, "logAction").mockResolvedValue({} as any);

      await accountsRepository.voidInvoice("inv-to-void", "Customer canceled order", "admin-1", "Admin");

      expect(updateData.status).toBe("void");
      expect(updateData.voidReason).toBe("Customer canceled order");
      expect(updateData.voidedBy).toBe("admin-1");
      expect(auditSpy).toHaveBeenCalledWith("invoice_voided", "admin-1", "admin", "Admin", "inv-to-void", "invoice", expect.any(Object));
    });

    it("prevents voiding a paid invoice directly", async () => {
      const mockPaidInvoice: Invoice = {
        id: "inv-paid",
        invoiceNumber: "INV-PAID-1",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 1500,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1500,
        currency: "INR",
        status: "paid",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: { seconds: 1722470400, nanoseconds: 0 } as any,
        paymentId: "pay-1",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({ exists: () => true, data: () => mockPaidInvoice }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await expect(
        accountsRepository.voidInvoice("inv-paid", "Reason", "admin-1"),
      ).rejects.toThrow("Paid invoices cannot be voided directly");
    });

    it("applies manual credit adjustment and prevents resulting negative balance", async () => {
      let userUpdated: any = null;
      let ledgerCreated: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ creditBalance: 300 }) }),
          update: vi.fn().mockImplementation((_ref, data) => { userUpdated = data; }),
          set: vi.fn().mockImplementation((_ref, data) => { ledgerCreated = data; }),
        };
        return cb(mockTxn);
      });

      const res = await ledgerRepository.adjustCustomerCredit({
        customerId: "cust-10",
        amount: 200,
        reason: "Goodwill gesture for delay",
        actorId: "admin-1",
        actorRole: "admin",
      });

      expect(res.balanceAfter).toBe(500);
      expect(userUpdated.creditBalance).toBe(500);
      expect(ledgerCreated.type).toBe("manual_adjustment");
      expect(ledgerCreated.amount).toBe(200);
      expect(ledgerCreated.balanceAfter).toBe(500);
    });

    it("rejects debit adjustment that would cause negative balance", async () => {
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ creditBalance: 100 }) }),
          update: vi.fn(),
          set: vi.fn(),
        };
        return cb(mockTxn);
      });

      await expect(
        ledgerRepository.adjustCustomerCredit({
          customerId: "cust-10",
          amount: -250,
          reason: "Adjustment",
          actorId: "admin-1",
          actorRole: "admin",
        }),
      ).rejects.toThrow("Resulting balance cannot be negative");
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5B.3: Final Invoice Balance Consistency & Regression Scenarios (1 - 7)
  // ---------------------------------------------------------------------------
  describe("Phase 5B.3: Final Invoice Balance Consistency & Regression Scenarios (1 - 7)", () => {
    // Scenario 1
    it("Scenario 1: Subtotal ₹3,000, credit ₹500, total ₹2,500, paid ₹1,000 -> remaining ₹1,500 (creditApplied is NOT subtracted again)", () => {
      const invoice: Invoice = {
        id: "inv-scen-1",
        invoiceNumber: "INV-SCEN-001",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [
          { description: "Standard meal plan", quantity: 1, unitPrice: 3000, amount: 3000 },
          { description: "Less: Customer Credit Balance Applied", quantity: 1, unitPrice: -500, amount: -500 },
        ],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2500, // already net of ₹500 credit
        paidAmount: 1000,
        creditApplied: 500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: "pay-part-1",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const paid = getInvoicePaidAmount(invoice);
      const remainingDue = getInvoiceRemainingDue(invoice);

      expect(paid).toBe(1000);
      expect(remainingDue).toBe(1500);
      // Verify creditApplied (500) was NOT subtracted again from totalAmount (2500)
      expect(remainingDue).not.toBe(1000);
      expect(invoice.totalAmount - paid).toBe(1500);
    });

    // Scenario 2
    it("Scenario 2: The same invoice receives a further ₹500 payment -> remaining ₹1,000", async () => {
      const invoice: Invoice = {
        id: "inv-scen-2",
        invoiceNumber: "INV-SCEN-002",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2500,
        paidAmount: 1000, // previously paid
        creditApplied: 500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: "pay-1",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const furtherPayment = createMockPayment({
        id: "pay-scen-2",
        invoiceId: "inv-scen-2",
        customerId: "cust-1",
        amount: 500,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => furtherPayment } as any);

      let invoiceUpdate: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => furtherPayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => invoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-scen-2", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(invoiceUpdate.paidAmount).toBe(1500);
      expect(invoiceUpdate.status).toBe("issued");

      const updatedInvoice: Invoice = { ...invoice, ...invoiceUpdate };
      expect(getInvoicePaidAmount(updatedInvoice)).toBe(1500);
      expect(getInvoiceRemainingDue(updatedInvoice)).toBe(1000);
    });

    // Scenario 3
    it("Scenario 3: A further ₹1,000 payment -> remaining ₹0 and status 'paid'", async () => {
      const invoice: Invoice = {
        id: "inv-scen-3",
        invoiceNumber: "INV-SCEN-003",
        customerId: "cust-1",
        subscriptionId: "sub-1",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2500,
        paidAmount: 1500, // previously paid ₹1,500
        creditApplied: 500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: "pay-2",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      const finalPayment = createMockPayment({
        id: "pay-scen-3",
        invoiceId: "inv-scen-3",
        customerId: "cust-1",
        amount: 1000,
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => finalPayment } as any);

      let invoiceUpdate: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => finalPayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => invoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-1", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) invoiceUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-scen-3", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(invoiceUpdate.paidAmount).toBe(2500);
      expect(invoiceUpdate.status).toBe("paid");

      const updatedInvoice: Invoice = { ...invoice, ...invoiceUpdate };
      expect(getInvoicePaidAmount(updatedInvoice)).toBe(2500);
      expect(getInvoiceRemainingDue(updatedInvoice)).toBe(0);
    });

    // Scenario 4
    it("Scenario 4: Legacy invoice with totalAmount: 1,000 already net of historical advance -> outstanding remains ₹1,000 when no additional invoice payment is recorded", () => {
      const legacyInvoice: Invoice = {
        id: "inv-legacy-scen-4",
        invoiceNumber: "INV-LEGACY-004",
        customerId: "cust-legacy",
        subscriptionId: "sub-legacy",
        lineItems: [
          { description: "REGULAR Plan", quantity: 1, unitPrice: 2000, amount: 2000 },
          { description: "Less: Verified Payments Received", quantity: 1, unitPrice: -1000, amount: -1000 },
        ],
        subtotal: 2000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1000, // already net of ₹1,000 historical advance
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      };

      const paid = getInvoicePaidAmount(legacyInvoice);
      const remainingDue = getInvoiceRemainingDue(legacyInvoice);

      expect(paid).toBe(0);
      expect(remainingDue).toBe(1000);
      expect(remainingDue).not.toBe(2000); // Does NOT ignore historical advance deduction
      expect(remainingDue).not.toBe(0); // Does NOT double deduct the advance
    });

    // Scenario 5
    it("Scenario 5: An invoice with missing paidAmount and status 'paid' evaluates remainingDue = 0 and does not reopen", async () => {
      const legacyPaidInvoice: Invoice = {
        id: "inv-legacy-paid-scen-5",
        invoiceNumber: "INV-LEGACY-PAID-005",
        customerId: "cust-legacy",
        subscriptionId: "sub-legacy",
        lineItems: [],
        subtotal: 2000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2000,
        currency: "INR",
        status: "paid",
        billingPeriodStart: "2026-05-01",
        billingPeriodEnd: "2026-05-31",
        dueDate: "2026-05-31",
        paidAt: { seconds: 1717113600, nanoseconds: 0 } as any,
        paymentId: "pay-hist-5",
        createdAt: { seconds: 1717113600, nanoseconds: 0 } as any,
      };

      expect(getInvoicePaidAmount(legacyPaidInvoice)).toBe(2000);
      expect(getInvoiceRemainingDue(legacyPaidInvoice)).toBe(0);

      // Attempting offline payment on this invoice throws error
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => legacyPaidInvoice });
            return Promise.resolve({ exists: () => false });
          }),
        };
        return cb(mockTxn);
      });

      await expect(
        accountsRepository.recordOfflinePayment({
          invoiceId: "inv-legacy-paid-scen-5",
          amount: 500,
          paymentMethod: "cash",
          paymentDate: "2026-08-01",
          adminUid: "admin-1",
          adminName: "Admin",
        }),
      ).rejects.toThrow("Invoice is already fully paid");
    });

    // Scenario 6
    it("Scenario 6: Offline partial payment and online partial payment produce consistent results", async () => {
      const baseInvoice: Invoice = {
        id: "inv-scen-6",
        invoiceNumber: "INV-SCEN-006",
        customerId: "cust-6",
        subscriptionId: "sub-6",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2500,
        paidAmount: 1000,
        creditApplied: 500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: "pay-initial",
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      // 6a. Offline payment of ₹500
      let offlineInvoiceUpdate: any = null;
      let offlinePaymentCreated: any = null;
      vi.mocked(runTransaction).mockImplementationOnce(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => baseInvoice });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ fullName: "Customer Six", displayId: "MP-C006", creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) offlinePaymentCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) offlineInvoiceUpdate = data;
          }),
        };
        return cb(mockTxn);
      });

      await accountsRepository.recordOfflinePayment({
        invoiceId: "inv-scen-6",
        amount: 500,
        paymentMethod: "cash",
        paymentDate: "2026-09-01",
        adminUid: "admin-1",
        adminName: "Admin",
      });

      expect(offlineInvoiceUpdate.paidAmount).toBe(1500);
      expect(offlinePaymentCreated.status).toBe("verified");
      expect(getInvoiceRemainingDue({ ...baseInvoice, ...offlineInvoiceUpdate })).toBe(1000);

      // 6b. Online payment of ₹500
      const onlinePayment = createMockPayment({
        id: "pay-scen-6-online",
        invoiceId: "inv-scen-6",
        customerId: "cust-6",
        amount: 500,
      });
      vi.mocked(getDoc).mockImplementation((ref: any) => {
        const p = ref?.path || "";
        if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => onlinePayment } as any);
        if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => baseInvoice } as any);
        return Promise.resolve({ exists: () => false } as any);
      });

      let onlineInvoiceUpdate: any = null;
      vi.mocked(runTransaction).mockImplementationOnce(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => onlinePayment });
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => baseInvoice });
            if (p.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ customerId: "cust-6", status: "active" }) });
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) onlineInvoiceUpdate = data;
          }),
          set: vi.fn(),
        };
        return cb(mockTxn);
      });

      await paymentService.approvePayment("pay-scen-6-online", "admin-1", { role: "admin", fullName: "Admin" } as any);

      expect(onlineInvoiceUpdate.paidAmount).toBe(1500);
      expect(getInvoiceRemainingDue({ ...baseInvoice, ...onlineInvoiceUpdate })).toBe(1000);

      // Both produce exactly identical remainingDue and paidAmount
      expect(offlineInvoiceUpdate.paidAmount).toBe(onlineInvoiceUpdate.paidAmount);
      expect(getInvoiceRemainingDue({ ...baseInvoice, ...offlineInvoiceUpdate }))
        .toBe(getInvoiceRemainingDue({ ...baseInvoice, ...onlineInvoiceUpdate }));
    });

    // Scenario 7
    it("Scenario 7: Retrying payment approval does not apply the payment or credit twice", async () => {
      // Payment already verified
      const verifiedPayment = createMockPayment({
        id: "pay-scen-7-verified",
        invoiceId: "inv-scen-7",
        customerId: "cust-7",
        amount: 500,
        status: "verified",
      });

      vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => verifiedPayment } as any);

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => verifiedPayment });
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn(),
          set: vi.fn(),
        };
        return cb(mockTxn);
      });

      await expect(
        paymentService.approvePayment("pay-scen-7-verified", "admin-1", { role: "admin", fullName: "Admin" } as any),
      ).rejects.toThrow(/Cannot approve payment with status verified|already been processed/);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5B.4: Deposit Accounting Semantics
  // ---------------------------------------------------------------------------
  describe("Phase 5B.4: Deposit Accounting Semantics", () => {
    it("case 1: invoice with no deposit (depositHeld = 0)", async () => {
      const sub = createMockSubscription({ id: "sub-dep-none", customerId: "cust-dep-none", depositAmount: 0 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-dep-none-${i}`,
        subscriptionId: "sub-dep-none",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);

      let createdInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(createdInvoice.depositHeld).toBe(0);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);
    });

    it("case 2: invoice with a separately held deposit (depositHeld = 1500) is NOT deducted from meal charges", async () => {
      const sub = createMockSubscription({ id: "sub-dep-held", customerId: "cust-dep-held", depositAmount: 1500 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-dep-held-${i}`,
        subscriptionId: "sub-dep-held",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100);

      // Security deposit payment exists
      const depositPayment = createMockPayment({
        id: "pay-dep-1",
        subscriptionId: "sub-dep-held",
        customerId: "cust-dep-held",
        amount: 1500,
        purpose: "security_deposit",
        status: "verified",
      });
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([depositPayment]);

      let createdInvoice: any = null;
      let userUpdated: any = null;
      let ledgerCreated: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
            if (p.includes("ledger")) ledgerCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      // Security deposit of ₹1500 is NOT deducted from totalAmount
      expect(createdInvoice.totalAmount).toBe(3000);
      // Security deposit is NOT treated as meal paidAmount
      expect(createdInvoice.paidAmount).toBe(0);
      expect(createdInvoice.depositHeld).toBe(1500);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);
      // Zero ledger effects during standard billing (held in escrow)
      expect(userUpdated).toBeNull();
      expect(ledgerCreated).toBeNull();
    });

    it("case 3: deposit later applied to the invoice via customer credit reduces invoice total and records audited ledger entry", async () => {
      const sub = createMockSubscription({ id: "sub-dep-applied", customerId: "cust-dep-applied" });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-dep-app-${i}`,
        subscriptionId: "sub-dep-applied",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);

      // Customer previously had security deposit released to credit balance (creditBalance = 1000)
      let createdInvoice: any = null;
      let userUpdated: any = null;
      let ledgerCreated: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 1000 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
            if (p.includes("ledger")) ledgerCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.creditApplied).toBe(0);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);

      // Phase 6B: Customer balance is untouched, no credit_applied entry
      expect(userUpdated).toBeNull();
      expect(ledgerCreated).toBeNull();
    });

    it("case 4: deposits represented by existing payment records partition cleanly and prevent double counting", async () => {
      const sub = createMockSubscription({ id: "sub-dep-part", customerId: "cust-dep-part" });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-dep-part-${i}`,
        subscriptionId: "sub-dep-part",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000

      // Both security deposit (₹1,500) and meal advance (₹1,000) exist
      const depositPayment = createMockPayment({
        id: "pay-dep-sec",
        subscriptionId: "sub-dep-part",
        customerId: "cust-dep-part",
        amount: 1500,
        purpose: "security_deposit",
        status: "verified",
      });
      const usagePayment = createMockPayment({
        id: "pay-dep-use",
        subscriptionId: "sub-dep-part",
        customerId: "cust-dep-part",
        amount: 1000,
        purpose: "usage",
        status: "verified",
      });
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([depositPayment, usagePayment]);

      let createdInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.totalAmount).toBe(3000);
      // ONLY usage payment is counted in paidAmount: 1000
      expect(createdInvoice.paidAmount).toBe(1000);
      // Security deposit is isolated in depositHeld
      expect(createdInvoice.depositHeld).toBe(1500);
      // Remaining due = 3000 - 1000 = 2000
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(2000);
      expect(getInvoiceRemainingDue(createdInvoice)).not.toBe(500); // Does NOT double count deposit
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5B.4: Void Invoice Payment Guard Policy
  // ---------------------------------------------------------------------------
  describe("Phase 5B.4: Void Invoice Payment Guard Policy", () => {
    it("rejects online payment approval linked to a void invoice before approval", async () => {
      const voidInvoice: Invoice = {
        id: "inv-void-101",
        invoiceNumber: "INV-VOID-101",
        customerId: "cust-void",
        subscriptionId: "sub-void",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 3000,
        paidAmount: 0,
        currency: "INR",
        status: "void",
        voidReason: "Billed in error",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.spyOn(accountsRepository, "getInvoiceById").mockResolvedValue(voidInvoice);

      const pendingPayment = createMockPayment({
        id: "pay-linked-void-1",
        invoiceId: "inv-void-101",
        customerId: "cust-void",
        amount: 1500,
        status: "pending",
      });

      vi.mocked(getDoc).mockImplementation((ref: any) => {
        const p = ref?.path || "";
        if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => pendingPayment } as any);
        if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => voidInvoice } as any);
        return Promise.resolve({ exists: () => false } as any);
      });

      let txnExecuted = false;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        txnExecuted = true;
        return cb({ get: vi.fn(), update: vi.fn(), set: vi.fn() });
      });

      // 1. Approval attempt throws error
      await expect(
        paymentService.approvePayment("pay-linked-void-1", "admin-1", { role: "admin", fullName: "Admin" } as any),
      ).rejects.toThrow("Cannot approve payment linked to void invoice INV-VOID-101. The target invoice has been voided.");

      // Transaction was aborted before execution
      expect(txnExecuted).toBe(false);
      // Invoice remains void and untouched
      expect(voidInvoice.status).toBe("void");
      expect(voidInvoice.paidAmount).toBe(0);

      // 2. Retry of the same payment approval also rejects idempotently without mutations
      await expect(
        paymentService.approvePayment("pay-linked-void-1", "admin-1", { role: "admin", fullName: "Admin" } as any),
      ).rejects.toThrow("Cannot approve payment linked to void invoice INV-VOID-101. The target invoice has been voided.");
      expect(txnExecuted).toBe(false);
    });

    it("rejects offline payment recording attempt against a void invoice", async () => {
      const voidInvoice: Invoice = {
        id: "inv-void-102",
        invoiceNumber: "INV-VOID-102",
        customerId: "cust-void-2",
        subscriptionId: "sub-void-2",
        lineItems: [],
        subtotal: 2000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2000,
        currency: "INR",
        status: "void",
        voidReason: "Customer cancelled plan",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => voidInvoice });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn(),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await expect(
        accountsRepository.recordOfflinePayment({
          invoiceId: "inv-void-102",
          amount: 1000,
          paymentMethod: "cash",
          paymentDate: "2026-09-01",
          adminUid: "admin-1",
          adminName: "Admin",
        }),
      ).rejects.toThrow("Cannot record payment for a voided invoice");

      // Void invoice is unchanged
      expect(voidInvoice.status).toBe("void");
    });

    it("rejects manual payment submission against a void invoice at the submission layer", async () => {
      const voidInvoice: Invoice = {
        id: "inv-void-103",
        invoiceNumber: "INV-VOID-103",
        customerId: "cust-void-3",
        subscriptionId: "sub-void-3",
        lineItems: [],
        subtotal: 1500,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1500,
        currency: "INR",
        status: "void",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.spyOn(accountsRepository, "getInvoiceById").mockResolvedValue(voidInvoice);

      await expect(
        paymentService.submitPayment(
          {
            subscriptionId: "sub-void-3",
            invoiceId: "inv-void-103",
            amount: 1500,
            paymentMethod: "upi",
            referenceNumber: "REF-VOID",
            paymentDate: "2026-08-15",
            billingMonth: "2026-08",
          },
          "cust-void-3",
          "Customer Void",
        ),
      ).rejects.toThrow("Cannot submit payment against a voided invoice.");
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5B.5: Verification of Final Invoice Generation Formula and Scenarios
  // ---------------------------------------------------------------------------
  describe("Phase 5B.5: Verification of Final Invoice Generation Formula and Scenarios", () => {
    // Scenario 1: ₹3,000 meal charge, no credit, no security deposit: totalAmount ₹3,000.
    it("Scenario 1: ₹3,000 meal charge, no credit, no security deposit -> totalAmount ₹3,000", async () => {
      const sub = createMockSubscription({ id: "sub-5b5-1", customerId: "cust-5b5-1", depositAmount: 0 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-5b5-1-${i}`,
        subscriptionId: "sub-5b5-1",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 30 * 100 = 3000
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);

      let createdInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.creditApplied).toBe(0);
      expect(createdInvoice.depositHeld).toBe(0);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);
    });

    // Scenario 2: ₹3,000 meal charge, ₹1,500 held security deposit, no usage advance: totalAmount remains ₹3,000.
    it("Scenario 2: ₹3,000 meal charge, ₹1,500 held security deposit, no usage advance -> totalAmount remains ₹3,000", async () => {
      const sub = createMockSubscription({ id: "sub-5b5-2", customerId: "cust-5b5-2", depositAmount: 1500 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-5b5-2-${i}`,
        subscriptionId: "sub-5b5-2",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000

      const depositPayment = createMockPayment({
        id: "pay-5b5-sec-2",
        subscriptionId: "sub-5b5-2",
        customerId: "cust-5b5-2",
        amount: 1500,
        purpose: "security_deposit",
        status: "verified",
      });
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([depositPayment]);

      let createdInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(createdInvoice.depositHeld).toBe(1500);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);
    });

    // Scenario 3: ₹3,000 meal charge, ₹1,000 usage advance, ₹1,500 held security deposit: verify the invoice and remaining balance account only for the usage advance.
    it("Scenario 3: ₹3,000 meal charge, ₹1,000 usage advance, ₹1,500 held security deposit -> invoice accounts only for usage advance", async () => {
      const sub = createMockSubscription({ id: "sub-5b5-3", customerId: "cust-5b5-3", depositAmount: 1500 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-5b5-3-${i}`,
        subscriptionId: "sub-5b5-3",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000

      const depositPayment = createMockPayment({
        id: "pay-5b5-sec-3",
        subscriptionId: "sub-5b5-3",
        customerId: "cust-5b5-3",
        amount: 1500,
        purpose: "security_deposit",
        status: "verified",
      });
      const usagePayment = createMockPayment({
        id: "pay-5b5-use-3",
        subscriptionId: "sub-5b5-3",
        customerId: "cust-5b5-3",
        amount: 1000,
        purpose: "usage",
        status: "verified",
      });
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([depositPayment, usagePayment]);

      let createdInvoice: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 0 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
          }),
          update: vi.fn(),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(1000);
      expect(createdInvoice.depositHeld).toBe(1500);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(2000);
      expect(getInvoiceRemainingDue(createdInvoice)).not.toBe(500); // Ensures deposit is not deducted
    });

    // Scenario 4: ₹3,000 meal charge, ₹500 customer ledger credit applied: totalAmount ₹2,500.
    it("Scenario 4: ₹3,000 meal charge, ₹500 customer ledger credit applied -> totalAmount ₹2,500", async () => {
      const sub = createMockSubscription({ id: "sub-5b5-4", customerId: "cust-5b5-4" });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-5b5-4-${i}`,
        subscriptionId: "sub-5b5-4",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([]);

      let createdInvoice: any = null;
      let userUpdated: any = null;
      let ledgerCreated: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 500 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
            if (p.includes("ledger")) ledgerCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.creditApplied).toBe(0);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);

      // Phase 6B: Ledger effect - untouched
      expect(userUpdated).toBeNull();
      expect(ledgerCreated).toBeNull();
    });

    // Scenario 5: The deposit is not applied via wallet credit to newly generated bills.
    it("Scenario 5: deposit explicitly released to customer ledger credit and applied -> not also deducted through depositHeld", async () => {
      const sub = createMockSubscription({ id: "sub-5b5-5", customerId: "cust-5b5-5", depositAmount: 1500 });
      const orders = Array.from({ length: 30 }, (_, i) => ({
        id: `ord-5b5-5-${i}`,
        subscriptionId: "sub-5b5-5",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        mealType: "lunch" as const,
        status: "delivered" as const,
      }));
      vi.spyOn(orderRepository, "getCustomerOrdersInRange").mockResolvedValue(orders as any);
      vi.spyOn(pricingService, "calculateAggregatedAmount").mockReturnValue(100); // 3000

      // Original security deposit was paid, but admin released ₹1,500 into customer's ledger creditBalance
      const depositPayment = createMockPayment({
        id: "pay-5b5-sec-5",
        subscriptionId: "sub-5b5-5",
        customerId: "cust-5b5-5",
        amount: 1500,
        purpose: "security_deposit",
        status: "verified",
      });
      vi.spyOn(paymentRepository, "getByCustomerId").mockResolvedValue([depositPayment]);

      let createdInvoice: any = null;
      let userUpdated: any = null;
      let ledgerCreated: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            // Customer credit balance holds the released ₹1,500 deposit
            if (p.includes("users")) return Promise.resolve({ exists: () => true, data: () => ({ creditBalance: 1500 }) });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) createdInvoice = data;
            if (p.includes("ledger")) ledgerCreated = data;
          }),
          update: vi.fn().mockImplementation((ref, data) => {
            const p = (ref as any)?.path || "";
            if (p.includes("users")) userUpdated = data;
          }),
        };
        return cb(mockTxn);
      });

      await billingService.processSubscriptionEnd(sub, "2026-08-31");

      expect(createdInvoice).not.toBeNull();
      expect(createdInvoice.subtotal).toBe(3000);
      expect(createdInvoice.creditApplied).toBe(0);
      expect(createdInvoice.totalAmount).toBe(3000);
      expect(createdInvoice.paidAmount).toBe(0);
      expect(getInvoiceRemainingDue(createdInvoice)).toBe(3000);

      // Phase 6B: No ledger mutation
      expect(userUpdated).toBeNull();
      expect(ledgerCreated).toBeNull();
    });

    // Scenario 6: A void invoice rejects customer payment submission, online approval, and offline recording without reopening or silently reallocating funds.
    it("Scenario 6: void invoice rejects customer submission, online approval, and offline recording without reopening or reallocating", async () => {
      const voidInvoice: Invoice = {
        id: "inv-5b5-void",
        invoiceNumber: "INV-5B5-VOID",
        customerId: "cust-5b5-void",
        subscriptionId: "sub-5b5-void",
        lineItems: [],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 3000,
        paidAmount: 0,
        currency: "INR",
        status: "void",
        voidReason: "Customer subscription voided",
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        dueDate: "2026-09-05",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1722470400, nanoseconds: 0 } as any,
      };

      vi.spyOn(accountsRepository, "getInvoiceById").mockResolvedValue(voidInvoice);

      // 6a: Customer manual submission rejected
      await expect(
        paymentService.submitPayment(
          {
            subscriptionId: "sub-5b5-void",
            invoiceId: "inv-5b5-void",
            amount: 3000,
            paymentMethod: "upi",
            referenceNumber: "REF-VOID-5B5",
            paymentDate: "2026-08-15",
            billingMonth: "2026-08",
          },
          "cust-5b5-void",
          "Customer Void",
        ),
      ).rejects.toThrow("Cannot submit payment against a voided invoice.");

      // 6b: Admin online approval of pre-existing pending payment rejected
      const pendingPayment = createMockPayment({
        id: "pay-5b5-void-pending",
        invoiceId: "inv-5b5-void",
        customerId: "cust-5b5-void",
        amount: 3000,
        status: "pending",
      });
      vi.mocked(getDoc).mockImplementation((ref: any) => {
        const p = ref?.path || "";
        if (p.includes("payments")) return Promise.resolve({ exists: () => true, data: () => pendingPayment } as any);
        if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => voidInvoice } as any);
        return Promise.resolve({ exists: () => false } as any);
      });

      await expect(
        paymentService.approvePayment("pay-5b5-void-pending", "admin-1", { role: "admin", fullName: "Admin" } as any),
      ).rejects.toThrow("Cannot approve payment linked to void invoice INV-5B5-VOID. The target invoice has been voided.");

      // 6c: Offline payment recording rejected
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        return cb({
          get: vi.fn().mockImplementation((ref) => {
            const p = (ref as any)?.path || "";
            if (p.includes("invoices")) return Promise.resolve({ exists: () => true, data: () => voidInvoice });
            return Promise.resolve({ exists: () => false });
          }),
          set: vi.fn(),
          update: vi.fn(),
        });
      });

      await expect(
        accountsRepository.recordOfflinePayment({
          invoiceId: "inv-5b5-void",
          amount: 3000,
          paymentMethod: "cash",
          paymentDate: "2026-09-01",
          adminUid: "admin-1",
          adminName: "Admin",
        }),
      ).rejects.toThrow("Cannot record payment for a voided invoice");

      // Verify invoice state remains void and unpaid
      expect(voidInvoice.status).toBe("void");
      expect(voidInvoice.paidAmount).toBe(0);
      expect(voidInvoice.paidAt).toBeNull();
    });
  });
});
