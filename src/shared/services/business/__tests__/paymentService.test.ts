import { describe, it, expect, vi, beforeEach } from "vitest";
import { paymentService } from "../paymentService";
import { paymentRepository } from "../../firestore/paymentRepository";

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    runTransaction: vi.fn(),
  };
});

describe("paymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitPayment", () => {
    it("submits a payment successfully", async () => {
      vi.spyOn(paymentRepository, "create").mockResolvedValue("pay1");

      const res = await paymentService.submitPayment(
        {
          subscriptionId: "sub1",
          amount: 1000,
          paymentMethod: "upi",
          referenceNumber: "123",
          paymentDate: "2026-08-01",
          billingMonth: "2026-08",
        },
        "c1",
        "Customer",
      );
      expect(res).toBe("pay1");
    });
  });

  describe("approvePayment", () => {
    it("approves payment successfully when conditions are met", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            if (ref.path.includes("payments")) {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "pending", subscriptionId: "sub1", purpose: "security_deposit", amount: 1000, customerId: "c1" })
              });
            }
            if (ref.path.includes("subscriptions")) {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "pending_payment", depositAmount: 1000 })
              });
            }
            return Promise.resolve({ exists: () => false });
          }),
          update: vi.fn(),
          set: vi.fn()
        };
        await cb(mockTransaction);
        expect(mockTransaction.update).toHaveBeenCalledTimes(2);
      });
      
      await expect(
        paymentService.approvePayment("pay1", "admin1"),
      ).resolves.not.toThrow();
    });

    it("rejects if payment already verified", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ status: "verified" }) }),
          update: vi.fn(),
          set: vi.fn()
        };
        await cb(mockTransaction);
      });
      await expect(paymentService.approvePayment("pay1", "admin1")).rejects.toThrow("This payment has already been processed or verified.");
    });

    it("rejects if subscription is not pending_payment", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            if (ref.path.includes("payments")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending", subscriptionId: "sub1" }) });
            if (ref.path.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ status: "active", depositAmount: 1000 }) });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(paymentService.approvePayment("pay1", "admin1")).rejects.toThrow("Subscription is not in a pending payment state.");
    });

    it("rejects if missing subscription", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            if (ref.path.includes("payments")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending", subscriptionId: "sub1" }) });
            if (ref.path.includes("subscriptions")) return Promise.resolve({ exists: () => false });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(paymentService.approvePayment("pay1", "admin1")).rejects.toThrow("Referenced subscription not found.");
    });

    it("rejects if security deposit amount does not match", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            if (ref.path.includes("payments")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending", subscriptionId: "sub1", purpose: "security_deposit", amount: 500 }) });
            if (ref.path.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending_payment", depositAmount: 1000 }) });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(paymentService.approvePayment("pay1", "admin1")).rejects.toThrow("Payment amount does not match required security deposit.");
    });

    it("rejects if activation payment purpose is not security_deposit", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any, cb: any) => {
        const mockTransaction = {
          get: vi.fn().mockImplementation((ref) => {
            if (ref.path.includes("payments")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending", subscriptionId: "sub1", purpose: "usage", amount: 500 }) });
            if (ref.path.includes("subscriptions")) return Promise.resolve({ exists: () => true, data: () => ({ status: "pending_payment", depositAmount: 1000 }) });
          }),
        };
        await cb(mockTransaction);
      });
      await expect(paymentService.approvePayment("pay1", "admin1")).rejects.toThrow("Activation requires a security deposit payment.");
    });
  });

  describe("rejectPayment", () => {
    it("rejects payment successfully", async () => {
      const { runTransaction } = require("firebase/firestore");
      runTransaction.mockImplementation(async (_db: any) => {});
      await expect(
        paymentService.rejectPayment("pay1", "admin1", "reason"),
      ).resolves.not.toThrow();
    });
  });
});
