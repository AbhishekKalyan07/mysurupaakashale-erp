import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTransaction, getDoc, doc } from "firebase/firestore";
import { billingService } from "../billingService";
import { paymentService } from "../paymentService";
import { accountsRepository } from "../../firestore/accountsRepository";
import type { Subscription, Invoice, ManualPayment } from "@/shared/types";
import { getInvoicePaidAmount, getInvoiceRemainingDue } from "@/shared/types";

/**
 * Phase 5B.1: Legacy Invoice Compatibility Test Suite
 *
 * Verifies compatibility with historical pre-Phase-5 baseline documents
 * (commit 678cd7379c99f155627bee08d2b5932acf697c3e), where:
 * - paidAmount and creditApplied did NOT exist on invoice documents.
 * - invoiceId did NOT exist on payments.
 * - totalAmount on historical invoices was ALREADY net of advance payments deducted during billing.
 */
describe("Phase 5B.1: Legacy Invoice Compatibility & Accounting Contract", () => {
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

  // ---------------------------------------------------------------------------
  // 1. Legacy Paid Invoices
  // ---------------------------------------------------------------------------
  describe("1. Legacy Paid Invoices", () => {
    it("historical paid invoice with omitted paidAmount and creditApplied evaluates remainingDue = 0 and does not reopen", () => {
      // Historical pre-Phase-5 paid invoice fixture (omits paidAmount & creditApplied)
      const legacyPaidInvoice: Invoice = {
        id: "inv-legacy-paid-001",
        invoiceNumber: "INV-CUST-987654",
        customerId: "cust-legacy-1",
        subscriptionId: "sub-legacy-1",
        lineItems: [
          {
            description: "REGULAR Plan (monthly)",
            quantity: 1,
            unitPrice: 3000,
            amount: 3000,
          },
        ],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 3000,
        currency: "INR",
        status: "paid",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: { seconds: 1719705600, nanoseconds: 0 } as any,
        paymentId: "pay-legacy-001",
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
        // paidAmount and creditApplied are undefined
      };

      // Contract evaluation as implemented in AdminAccountsPage & PaymentHistoryPage
      const isPaid = legacyPaidInvoice.status === "paid";
      const isVoid = legacyPaidInvoice.status === "void";
      const paidAmount = legacyPaidInvoice.paidAmount ?? (isPaid ? legacyPaidInvoice.totalAmount : 0);
      const remainingDue = isPaid || isVoid ? 0 : Math.max(0, legacyPaidInvoice.totalAmount - paidAmount);

      expect(isPaid).toBe(true);
      expect(paidAmount).toBe(3000);
      expect(remainingDue).toBe(0);
      expect(getInvoicePaidAmount(legacyPaidInvoice)).toBe(3000);
      expect(getInvoiceRemainingDue(legacyPaidInvoice)).toBe(0);
      expect(legacyPaidInvoice.creditApplied).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Legacy Issued Invoices with No Previous Payment
  // ---------------------------------------------------------------------------
  describe("2. Legacy Issued Invoices (No Previous Payment)", () => {
    it("historical issued invoice has full remainingDue equal to totalAmount and settles cleanly upon payment approval", async () => {
      // Historical issued invoice fixture (no advance payments, subtotal == totalAmount == 3000)
      const legacyIssuedInvoice: Invoice = {
        id: "inv-legacy-issued-001",
        invoiceNumber: "INV-CUST-111111",
        customerId: "cust-legacy-2",
        subscriptionId: "sub-legacy-2",
        lineItems: [
          {
            description: "REGULAR Plan (monthly)",
            quantity: 1,
            unitPrice: 3000,
            amount: 3000,
          },
        ],
        subtotal: 3000,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 3000,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      };

      // Assert initial balance
      const isPaid = legacyIssuedInvoice.status === "paid";
      const paid = legacyIssuedInvoice.paidAmount ?? (isPaid ? legacyIssuedInvoice.totalAmount : 0);
      const remainingDue = Math.max(0, legacyIssuedInvoice.totalAmount - paid);

      expect(paid).toBe(0);
      expect(remainingDue).toBe(3000);

      // Now approve a payment of ₹3,000 against this legacy invoice
      const legacySub: Subscription = {
        id: "sub-legacy-2",
        customerId: "cust-legacy-2",
        planId: "plan-1",
        status: "active",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        billingCycle: "monthly",
        depositAmount: 0,
      } as any;

      const newPayment: ManualPayment = {
        id: "pay-new-001",
        customerId: "cust-legacy-2",
        customerName: "Customer Two",
        subscriptionId: "sub-legacy-2",
        invoiceId: "inv-legacy-issued-001",
        amount: 3000,
        currency: "INR",
        paymentMethod: "upi",
        referenceNumber: "UTR-111111",
        purpose: "usage",
        paymentDate: "2026-07-02",
        status: "pending",
        billingMonth: "2026-06",
      } as any;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => newPayment,
      } as any);

      let invoiceUpdatePayload: any = null;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref: any) => {
            if (ref.path === "payments/pay-new-001") {
              return { exists: () => true, data: () => newPayment };
            }
            if (ref.path === "subscriptions/sub-legacy-2") {
              return { exists: () => true, data: () => legacySub };
            }
            if (ref.path === "invoices/inv-legacy-issued-001") {
              return { exists: () => true, data: () => legacyIssuedInvoice };
            }
            if (ref.path === "users/cust-legacy-2") {
              return { exists: () => true, data: () => ({ creditBalance: 0 }) };
            }
            return { exists: () => false };
          }),
          update: vi.fn().mockImplementation((ref: any, data: any) => {
            if (ref.path === "invoices/inv-legacy-issued-001") {
              invoiceUpdatePayload = data;
            }
          }),
          set: vi.fn(),
        };
        return callback(mockTxn);
      });

      await paymentService.approvePayment("pay-new-001", "admin-uid");

      expect(invoiceUpdatePayload).toBeDefined();
      expect(invoiceUpdatePayload.status).toBe("paid");
      expect(invoiceUpdatePayload.paidAmount).toBe(3000);
      expect(invoiceUpdatePayload.totalAmount).toBe(3000);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Legacy Issued Invoices Where Advance Payment Was Already Deducted
  // ---------------------------------------------------------------------------
  describe("3. Legacy Issued Invoices with Advance Deducted at Generation", () => {
    it("historical invoice with net totalAmount after advance payment demands only remaining balance and prevents double charging", async () => {
      // In the pre-Phase-5 baseline:
      // gross = 3000
      // advance payment received during cycle = 1000
      // totalAmount stored = Math.max(0, 3000 - 1000) = 2000
      // line item added: "Less: Verified Payments Received" : -1000
      // paidAmount: undefined
      const legacyAdvanceDeductedInvoice: Invoice = {
        id: "inv-legacy-advance-deducted-001",
        invoiceNumber: "INV-CUST-222222",
        customerId: "cust-legacy-3",
        subscriptionId: "sub-legacy-3",
        lineItems: [
          {
            description: "REGULAR Plan (monthly)",
            quantity: 1,
            unitPrice: 3000,
            amount: 3000,
          },
          {
            description: "Less: Verified Payments Received",
            quantity: 1,
            unitPrice: -1000,
            amount: -1000,
          },
        ],
        subtotal: 3000, // gross
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 2000, // ALREADY net balance due!
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      };

      // 1. Verify UI remaining due calculation:
      // Because paidAmount is undefined, fallback is 0.
      // remainingDue = Math.max(0, totalAmount - 0) = 2000.
      // This is exactly the ₹2,000 remaining balance!
      const isPaid = legacyAdvanceDeductedInvoice.status === "paid";
      const paid = legacyAdvanceDeductedInvoice.paidAmount ?? (isPaid ? legacyAdvanceDeductedInvoice.totalAmount : 0);
      const remainingDue = Math.max(0, legacyAdvanceDeductedInvoice.totalAmount - paid);

      expect(remainingDue).toBe(2000);
      expect(getInvoicePaidAmount(legacyAdvanceDeductedInvoice)).toBe(0);
      expect(getInvoiceRemainingDue(legacyAdvanceDeductedInvoice)).toBe(2000);
      expect(remainingDue).not.toBe(3000); // Does NOT double charge the 1000 advance
      expect(remainingDue).not.toBe(1000); // Does NOT double subtract the 1000 advance

      // 2. Approve a payment of ₹2,000 to settle this invoice
      const legacySub: Subscription = {
        id: "sub-legacy-3",
        customerId: "cust-legacy-3",
        planId: "plan-1",
        status: "active",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        billingCycle: "monthly",
        depositAmount: 0,
      } as any;

      const settlementPayment: ManualPayment = {
        id: "pay-settle-001",
        customerId: "cust-legacy-3",
        customerName: "Customer Three",
        subscriptionId: "sub-legacy-3",
        invoiceId: "inv-legacy-advance-deducted-001",
        amount: 2000,
        currency: "INR",
        paymentMethod: "upi",
        referenceNumber: "UTR-222222",
        purpose: "usage",
        paymentDate: "2026-07-03",
        status: "pending",
        billingMonth: "2026-06",
      } as any;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => settlementPayment,
      } as any);

      let invoiceUpdatePayload: any = null;
      let userUpdatePayload: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref: any) => {
            if (ref.path === "payments/pay-settle-001") {
              return { exists: () => true, data: () => settlementPayment };
            }
            if (ref.path === "subscriptions/sub-legacy-3") {
              return { exists: () => true, data: () => legacySub };
            }
            if (ref.path === "invoices/inv-legacy-advance-deducted-001") {
              return { exists: () => true, data: () => legacyAdvanceDeductedInvoice };
            }
            if (ref.path === "users/cust-legacy-3") {
              return { exists: () => true, data: () => ({ creditBalance: 0 }) };
            }
            return { exists: () => false };
          }),
          update: vi.fn().mockImplementation((ref: any, data: any) => {
            if (ref.path === "invoices/inv-legacy-advance-deducted-001") {
              invoiceUpdatePayload = data;
            }
            if (ref.path === "users/cust-legacy-3") {
              userUpdatePayload = data;
            }
          }),
          set: vi.fn(),
        };
        return callback(mockTxn);
      });

      await paymentService.approvePayment("pay-settle-001", "admin-uid");

      // Verify invoice is fully settled
      expect(invoiceUpdatePayload.status).toBe("paid");
      expect(invoiceUpdatePayload.paidAmount).toBe(2000);
      expect(invoiceUpdatePayload.totalAmount).toBe(2000);
      // No spurious surplus credit created
      expect(userUpdatePayload).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Legacy Payment Model (No invoiceId on payment) Matching
  // ---------------------------------------------------------------------------
  describe("4. Legacy Payment Model Association", () => {
    it("unambiguously associates payment with open candidate for subscription without guessing", async () => {
      // Legacy payment without invoiceId
      const legacyPayment: ManualPayment = {
        id: "pay-legacy-unlinked-001",
        customerId: "cust-legacy-4",
        customerName: "Customer Four",
        subscriptionId: "sub-legacy-4",
        // invoiceId: omitted / undefined
        amount: 2500,
        currency: "INR",
        paymentMethod: "bank_transfer",
        referenceNumber: "NEFT-444444",
        purpose: "usage",
        paymentDate: "2026-07-04",
        status: "pending",
        billingMonth: "2026-06",
      } as any;

      const openInvoice = {
        id: "inv-open-single-001",
        invoiceNumber: "INV-CUST-444444",
        customerId: "cust-legacy-4",
        subscriptionId: "sub-legacy-4",
        lineItems: [],
        subtotal: 2500,
        totalAmount: 2500,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      } as unknown as Invoice;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => legacyPayment,
      } as any);

      // accountsRepository.getInvoicesByCustomerId returns exactly 1 open candidate
      vi.spyOn(accountsRepository, "getInvoicesByCustomerId").mockResolvedValue([openInvoice]);

      let updatedInvoiceId = "";
      vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref: any) => {
            if (ref.path === "payments/pay-legacy-unlinked-001") {
              return { exists: () => true, data: () => legacyPayment };
            }
            if (ref.path === "subscriptions/sub-legacy-4") {
              return { exists: () => true, data: () => ({ id: "sub-legacy-4", status: "active", depositAmount: 0 }) };
            }
            if (ref.path === "invoices/inv-open-single-001") {
              return { exists: () => true, data: () => openInvoice };
            }
            if (ref.path === "users/cust-legacy-4") {
              return { exists: () => true, data: () => ({ creditBalance: 0 }) };
            }
            return { exists: () => false };
          }),
          update: vi.fn().mockImplementation((ref: any, _data: any) => {
            if (ref.path.startsWith("invoices/")) {
              updatedInvoiceId = ref.path.replace("invoices/", "");
            }
          }),
          set: vi.fn(),
        };
        return callback(mockTxn);
      });

      await paymentService.approvePayment("pay-legacy-unlinked-001", "admin-uid");

      // Verify that the unambiguous candidate was targeted and updated
      expect(updatedInvoiceId).toBe("inv-open-single-001");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Overpayment against a Legacy Invoice
  // ---------------------------------------------------------------------------
  describe("5. New Payment with Overpayment against Legacy Invoice", () => {
    it("credits surplus overpayment on a legacy invoice to customer credit balance exactly once", async () => {
      const legacyInvoice = {
        id: "inv-legacy-partial-001",
        invoiceNumber: "INV-CUST-555555",
        customerId: "cust-legacy-5",
        subscriptionId: "sub-legacy-5",
        lineItems: [],
        subtotal: 2000,
        totalAmount: 2000,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      } as unknown as Invoice;

      // Customer pays ₹2,500 against this ₹2,000 legacy invoice
      const overpayment: ManualPayment = {
        id: "pay-over-001",
        customerId: "cust-legacy-5",
        customerName: "Customer Five",
        subscriptionId: "sub-legacy-5",
        invoiceId: "inv-legacy-partial-001",
        amount: 2500,
        currency: "INR",
        paymentMethod: "upi",
        referenceNumber: "UTR-555555",
        purpose: "usage",
        paymentDate: "2026-07-05",
        status: "pending",
        billingMonth: "2026-06",
      } as any;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => overpayment,
      } as any);

      let invoiceUpdatePayload: any = null;
      let userUpdatePayload: any = null;
      let ledgerEntryPayload: any = null;

      vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref: any) => {
            if (ref.path === "payments/pay-over-001") {
              return { exists: () => true, data: () => overpayment };
            }
            if (ref.path === "subscriptions/sub-legacy-5") {
              return { exists: () => true, data: () => ({ id: "sub-legacy-5", status: "active", depositAmount: 0 }) };
            }
            if (ref.path === "invoices/inv-legacy-partial-001") {
              return { exists: () => true, data: () => legacyInvoice };
            }
            if (ref.path === "users/cust-legacy-5") {
              return { exists: () => true, data: () => ({ creditBalance: 100 }) };
            }
            return { exists: () => false };
          }),
          update: vi.fn().mockImplementation((ref: any, data: any) => {
            if (ref.path === "invoices/inv-legacy-partial-001") invoiceUpdatePayload = data;
            if (ref.path === "users/cust-legacy-5") userUpdatePayload = data;
          }),
          set: vi.fn().mockImplementation((ref: any, data: any) => {
            if (ref.path.includes("/ledger/")) ledgerEntryPayload = data;
          }),
        };
        return callback(mockTxn);
      });

      await paymentService.approvePayment("pay-over-001", "admin-uid");

      // Invoice settled at totalAmount (2000)
      expect(invoiceUpdatePayload.status).toBe("paid");
      expect(invoiceUpdatePayload.paidAmount).toBe(2000);
      expect(invoiceUpdatePayload.totalAmount).toBe(2000);

      // Surplus of ₹500 credited to customer: 100 + 500 = 600
      expect(userUpdatePayload.creditBalance).toBe(600);
      expect(ledgerEntryPayload.amount).toBe(500);
      expect(ledgerEntryPayload.balanceAfter).toBe(600);
      expect(ledgerEntryPayload.type).toBe("manual_adjustment");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Retries and Re-approval Protection
  // ---------------------------------------------------------------------------
  describe("6. Idempotency on Legacy Invoices", () => {
    it("rejects approval on already verified legacy payment", async () => {
      const alreadyVerifiedPayment: ManualPayment = {
        id: "pay-already-verified",
        customerId: "cust-legacy-6",
        customerName: "Customer Six",
        subscriptionId: "sub-legacy-6",
        amount: 2000,
        currency: "INR",
        paymentMethod: "cash",
        referenceNumber: "CASH-1",
        purpose: "usage",
        paymentDate: "2026-06-15",
        status: "verified",
        billingMonth: "2026-06",
      } as any;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => alreadyVerifiedPayment,
      } as any);

      await expect(
        paymentService.approvePayment("pay-already-verified", "admin-uid"),
      ).rejects.toThrow(/Cannot approve payment with status verified|already been processed/i);
    });

    it("idempotently handles billing cycle retries without duplicating legacy invoices", async () => {
      const sub: Subscription = {
        id: "sub-idem-legacy",
        customerId: "cust-idem-legacy",
        planId: "plan-1",
        status: "active",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        billingCycle: "monthly",
        autoRenew: false,
        depositAmount: 0,
      } as any;

      const existingLegacyInvoice = {
        id: "INV_sub-idem-legacy_2026-06-30",
        invoiceNumber: "INV-IDEM-001",
        customerId: "cust-idem-legacy",
        subscriptionId: "sub-idem-legacy",
        lineItems: [],
        subtotal: 3000,
        totalAmount: 3000,
        currency: "INR",
        status: "issued",
        billingPeriodStart: "2026-06-01",
        billingPeriodEnd: "2026-06-30",
        dueDate: "2026-06-30",
        paidAt: null,
        paymentId: null,
        createdAt: { seconds: 1719705600, nanoseconds: 0 } as any,
      } as unknown as Invoice;

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => existingLegacyInvoice,
      } as any);

      let subUpdated = false;
      vi.mocked(runTransaction).mockImplementation(async (_db: any, callback: any) => {
        const mockTxn = {
          get: vi.fn().mockImplementation((ref: any) => {
            if (ref.path === "invoices/INV_sub-idem-legacy_2026-06-30") {
              return { exists: () => true, data: () => existingLegacyInvoice };
            }
            return { exists: () => false };
          }),
          update: vi.fn().mockImplementation((ref: any, _data: any) => {
            if (ref.path === "subscriptions/sub-idem-legacy") subUpdated = true;
          }),
          set: vi.fn(),
        };
        return callback(mockTxn);
      });

      const res = await billingService.processSubscriptionEnd(sub, "2026-06-30", "expired");
      expect(res).toBe(true);
      expect(subUpdated).toBe(true);
    });
  });
});
