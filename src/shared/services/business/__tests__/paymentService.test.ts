import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTransaction, getDoc, doc } from "firebase/firestore";
import { paymentService } from "../paymentService";
import { paymentRepository } from "../../firestore/paymentRepository";
import { userRepository } from "../../firestore/userRepository";
import { auditRepository } from "../../firestore/auditRepository";

describe("paymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doc).mockImplementation(
      (_db: any, col: string, id?: string) =>
        ({ id: id || "mock-id", path: `${col}/${id}`, type: "doc" }) as any,
    );
  });

  describe("submitPayment", () => {
    it("submits a payment successfully and logs payment_submitted audit event", async () => {
      vi.spyOn(paymentRepository, "create").mockResolvedValue("pay1");
      vi.spyOn(userRepository, "list").mockResolvedValue([]);
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        displayId: "CUST-1",
      } as any);
      const auditSpy = vi
        .spyOn(auditRepository, "logAction")
        .mockResolvedValue({} as any);

      const res = await paymentService.submitPayment(
        {
          subscriptionId: "sub1",
          amount: 1000,
          paymentMethod: "upi",
          referenceNumber: "123",
          paymentDate: "2026-08-01",
          billingMonth: "2026-08",
          purpose: "usage",
        },
        "c1",
        "Customer",
      );
      expect(res).toBe("pay1");
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledWith(
        "payment_submitted",
        "c1",
        "customer",
        "Customer",
        "pay1",
        "payment",
        expect.objectContaining({
          amount: 1000,
          paymentMethod: "upi",
          referenceNumber: "123",
          purpose: "usage",
          subscriptionId: "sub1",
          customerId: "c1",
          billingMonth: "2026-08",
        }),
      );
    });
  });

  describe("approvePayment", () => {
    beforeEach(() => {
      vi.mocked(getDoc).mockImplementation(
        async () =>
          ({
            exists: () => true,
            data: () => ({
              id: "pay1",
              status: "pending",
              subscriptionId: "sub1",
              purpose: "security_deposit",
              amount: 1000,
              customerId: "c1",
              paymentMethod: "upi",
              referenceNumber: "UTR-999",
            }),
          }) as any,
      );
    });

    it("approves payment successfully when conditions are met and logs payment_received", async () => {
      const auditSpy = vi
        .spyOn(auditRepository, "logAction")
        .mockResolvedValue({} as any);

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            const refPath = (ref as any)?.path || "";
            if (refPath.includes("payments") || (ref as any)?.id === "pay1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  id: "pay1",
                  status: "pending",
                  subscriptionId: "sub1",
                  purpose: "security_deposit",
                  amount: 1000,
                  customerId: "c1",
                  paymentMethod: "upi",
                  referenceNumber: "UTR-999",
                }),
              });
            }
            if (refPath.includes("subscriptions") || (ref as any)?.id === "sub1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  status: "pending_payment",
                  depositAmount: 1000,
                  startDate: "2026-09-01",
                  endDate: "2026-09-30",
                }),
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn(),
          set: vi.fn(),
        };
        await cb(mockTransaction);
        expect(mockTransaction.update).toHaveBeenCalledTimes(2);
      });

      await expect(
        paymentService.approvePayment(
          "pay1",
          "admin1",
          "Payment verified via bank statement",
          "Super Admin",
        ),
      ).resolves.not.toThrow();

      const receivedAuditCalls = auditSpy.mock.calls.filter(
        (c) => c[0] === "payment_received",
      );
      expect(receivedAuditCalls).toHaveLength(1);
      expect(receivedAuditCalls[0]).toEqual([
        "payment_received",
        "admin1",
        "admin",
        "Super Admin",
        "pay1",
        "payment",
        expect.objectContaining({
          amount: 1000,
          paymentMethod: "upi",
          referenceNumber: "UTR-999",
          purpose: "security_deposit",
          customerId: "c1",
          subscriptionId: "sub1",
          notes: "Payment verified via bank statement",
        }),
      ]);
    });

    it("rejects if payment already verified", async () => {
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({ status: "verified" }),
          }),
          update: vi.fn(),
          set: vi.fn(),
        };
        await cb(mockTransaction);
      });
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).rejects.toThrow("This payment has already been processed or verified.");
    });

    it("rejects if subscription is not pending_payment", async () => {
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            const refPath = (ref as any)?.path || "";
            if (refPath.includes("payments") || (ref as any)?.id === "pay1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  status: "pending",
                  subscriptionId: "sub1",
                  purpose: "security_deposit",
                  amount: 1000,
                }),
              });
            }
            if (refPath.includes("subscriptions") || (ref as any)?.id === "sub1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "active", depositAmount: 1000 }),
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).rejects.toThrow("Subscription is not in a pending payment state.");
    });

    it("rejects if missing subscription", async () => {
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            const refPath = (ref as any)?.path || "";
            if (refPath.includes("payments") || (ref as any)?.id === "pay1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  status: "pending",
                  subscriptionId: "sub1",
                  purpose: "security_deposit",
                  amount: 1000,
                }),
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).rejects.toThrow("Referenced subscription not found.");
    });

    it("rejects if security deposit amount does not match", async () => {
      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            const refPath = (ref as any)?.path || "";
            if (refPath.includes("payments") || (ref as any)?.id === "pay1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  status: "pending",
                  subscriptionId: "sub1",
                  purpose: "security_deposit",
                  amount: 500,
                }),
              });
            }
            if (refPath.includes("subscriptions") || (ref as any)?.id === "sub1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "pending_payment", depositAmount: 1000 }),
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).rejects.toThrow(
        "Payment amount does not match required security deposit.",
      );
    });

    it("rejects if activation payment purpose is not security_deposit", async () => {
      vi.mocked(getDoc).mockImplementation(
        async () =>
          ({
            exists: () => true,
            data: () => ({
              id: "pay1",
              status: "pending",
              subscriptionId: "sub1",
              purpose: "usage",
              amount: 500,
              customerId: "c1",
            }),
          }) as any,
      );

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            const refPath = (ref as any)?.path || "";
            if (refPath.includes("payments") || (ref as any)?.id === "pay1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({
                  id: "pay1",
                  status: "pending",
                  subscriptionId: "sub1",
                  purpose: "usage",
                  amount: 500,
                }),
              });
            }
            if (refPath.includes("subscriptions") || (ref as any)?.id === "sub1") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "pending_payment", depositAmount: 1000 }),
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).rejects.toThrow("Activation requires a security deposit payment.");
    });
  });

  describe("rejectPayment", () => {
    it("rejects payment successfully and logs payment_rejected with complete metadata and reason", async () => {
      const auditSpy = vi
        .spyOn(auditRepository, "logAction")
        .mockResolvedValue({} as any);

      vi.mocked(runTransaction).mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation(() => {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                id: "pay1",
                status: "pending",
                amount: 1500,
                paymentMethod: "bank_transfer",
                referenceNumber: "REF-987654",
                purpose: "usage",
                customerId: "cust-1",
                subscriptionId: "sub-1",
              }),
            });
          }),
          update: vi.fn(),
        };
        await cb(mockTransaction);
      });

      const rejected = await paymentService.rejectPayment(
        "pay1",
        "admin-42",
        "Invalid transaction reference",
        "Finance Officer",
      );

      expect(rejected.amount).toBe(1500);
      const rejectedCalls = auditSpy.mock.calls.filter(
        (c) => c[0] === "payment_rejected",
      );
      expect(rejectedCalls).toHaveLength(1);
      expect(rejectedCalls[0]).toEqual([
        "payment_rejected",
        "admin-42",
        "admin",
        "Finance Officer",
        "pay1",
        "payment",
        {
          amount: 1500,
          paymentMethod: "bank_transfer",
          referenceNumber: "REF-987654",
          purpose: "usage",
          customerId: "cust-1",
          subscriptionId: "sub-1",
          reason: "Invalid transaction reference",
        },
      ]);
    });
  });
});
