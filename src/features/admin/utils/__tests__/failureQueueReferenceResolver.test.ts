import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatFailureQueueCustomerDisplay,
  formatFailureQueueSubscriptionDisplay,
  resolveFailureQueueReferences,
} from "../failureQueueReferenceResolver";
import type { FailureQueueRecord } from "@/shared/services/firestore/failureQueueRepository";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, name) => ({ _col: name })),
  query: vi.fn((col, ..._clauses) => ({ _query: true, _col: col?._col })),
  where: vi.fn(),
  documentId: vi.fn(),
  getDocs: vi.fn(),
}));

describe("failureQueueReferenceResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatFailureQueueCustomerDisplay", () => {
    const rawFirebaseUid = "firebaseAuthUidXYZ9876543210ABC";

    it("displays 'Customer Name (MP-001)' when customer has name and MP displayId", () => {
      const display = formatFailureQueueCustomerDisplay(
        {
          fullName: "Rahul Kumar",
          displayId: "MP-001",
        },
        rawFirebaseUid,
      );

      expect(display).toBe("Rahul Kumar (MP-001)");
      expect(display).not.toContain(rawFirebaseUid);
    });

    it("formats customer with name and formatted allotted code when displayId is absent", () => {
      const display = formatFailureQueueCustomerDisplay(
        {
          fullName: "Ananya Sharma",
        },
        rawFirebaseUid,
      );

      // Should format as Name (MP-xxxxxx) and never expose raw UID as plain string
      expect(display).toMatch(/^Ananya Sharma \(MP-[A-Z0-9]+\)$/);
      expect(display).not.toBe(`Ananya Sharma (${rawFirebaseUid})`);
      expect(display).not.toContain(rawFirebaseUid);
    });

    it("displays 'Customer (MP-042)' when customer name is missing or generic but displayId exists", () => {
      const display = formatFailureQueueCustomerDisplay(
        {
          fullName: "",
          displayId: "MP-042",
        },
        rawFirebaseUid,
      );

      expect(display).toBe("Customer (MP-042)");
      expect(display).not.toContain(rawFirebaseUid);
    });

    it("falls back safely to 'Customer (MP-xxxxxx)' when customer profile is null/unresolved", () => {
      const display = formatFailureQueueCustomerDisplay(null, rawFirebaseUid);

      // Allotted fallback should produce business-safe code, not raw Firebase Auth UID
      expect(display).toMatch(/^Customer \(MP-[A-Z0-9]+\)$/);
      expect(display).not.toContain(rawFirebaseUid);
    });

    it("falls back to 'Customer' when both customer object and raw ID are unavailable", () => {
      const display = formatFailureQueueCustomerDisplay(null, undefined);
      expect(display).toBe("Customer");
    });
  });

  describe("formatFailureQueueSubscriptionDisplay", () => {
    const rawSubscriptionUuid = "c8e1001a-5b2e-4f3b-9a1c-7d8e9f0a1b2c";

    it("displays '[Plan Name] ([Cycle])' when plan name and billing cycle are available", () => {
      const display = formatFailureQueueSubscriptionDisplay(
        { billingCycle: "monthly" },
        "Standard Lunch Plan",
        rawSubscriptionUuid,
      );

      expect(display).toBe("Standard Lunch Plan (Monthly)");
      expect(display).not.toContain(rawSubscriptionUuid);
    });

    it("displays '[Plan Name]' when plan name is available without cycle", () => {
      const display = formatFailureQueueSubscriptionDisplay(
        {},
        "Executive Breakfast & Dinner",
        rawSubscriptionUuid,
      );

      expect(display).toBe("Executive Breakfast & Dinner");
      expect(display).not.toContain(rawSubscriptionUuid);
    });

    it("falls back to '[Tier] Plan ([Cycle])' when plan name is absent but tier is known", () => {
      const display = formatFailureQueueSubscriptionDisplay(
        { planTier: "regular", billingCycle: "weekly" },
        undefined,
        rawSubscriptionUuid,
      );

      expect(display).toBe("Regular Plan (Weekly)");
      expect(display).not.toContain(rawSubscriptionUuid);
    });

    it("falls back to 'Subscription (SUB-xxxxxx)' when subscription is not in DB, never exposing 36-char raw UUID", () => {
      const display = formatFailureQueueSubscriptionDisplay(
        null,
        undefined,
        rawSubscriptionUuid,
      );

      expect(display).toBe("Subscription (SUB-C8E100)");
      expect(display).not.toBe(rawSubscriptionUuid);
      expect(display).not.toContain(rawSubscriptionUuid);
    });

    it("falls back to 'Subscription' when no subscription data or raw ID is provided", () => {
      const display = formatFailureQueueSubscriptionDisplay(null, undefined, null);
      expect(display).toBe("Subscription");
    });
  });

  describe("resolveFailureQueueReferences", () => {
    it("returns empty maps when given an empty incidents array", async () => {
      const res = await resolveFailureQueueReferences([]);
      expect(res.customerDisplayMap.size).toBe(0);
      expect(res.subscriptionDisplayMap.size).toBe(0);
    });

    it("batches lookups and builds display maps without exposing raw technical IDs", async () => {
      const { getDocs } = await import("firebase/firestore");
      const mockGetDocs = vi.mocked(getDocs);

      // 1st getDocs: mealPlans
      // 2nd getDocs: users
      // 3rd getDocs: subscriptions
      mockGetDocs.mockImplementation(async (qOrCol: any) => {
        if (qOrCol?._col === "mealPlans") {
          return {
            forEach: (cb: any) => {
              cb({ id: "plan-lunch-std", data: () => ({ name: "Standard Lunch Plan" }) });
            },
          } as any;
        }
        if (qOrCol?._col === "users") {
          return {
            forEach: (cb: any) => {
              cb({
                id: "uid-cust-001",
                data: () => ({ fullName: "Vikram Gowda", displayId: "MP-105" }),
              });
            },
          } as any;
        }
        if (qOrCol?._col === "subscriptions") {
          return {
            forEach: (cb: any) => {
              cb({
                id: "sub-uuid-001",
                data: () => ({ planId: "plan-lunch-std", billingCycle: "monthly" }),
              });
            },
          } as any;
        }
        return { forEach: () => {} } as any;
      });

      const incidents: FailureQueueRecord[] = [
        {
          id: "fail-1",
          customerId: "uid-cust-001",
          subscriptionId: "sub-uuid-001",
          mealType: "lunch",
          date: "2026-10-05",
          reason: "Cannot route order: No delivery zone serves pincode 573133.",
          status: "pending",
          attempts: 1,
          retryCount: 0,
          createdAt: { toDate: () => new Date() } as any,
        },
      ];

      const res = await resolveFailureQueueReferences(incidents);
      expect(res.customerDisplayMap.get("uid-cust-001")).toBe("Vikram Gowda (MP-105)");
      expect(res.subscriptionDisplayMap.get("sub-uuid-001")).toBe("Standard Lunch Plan (Monthly)");
    });

    it("gracefully degrades to safe fallback references when network/batch lookups fail", async () => {
      const { getDocs } = await import("firebase/firestore");
      const mockGetDocs = vi.mocked(getDocs);
      mockGetDocs.mockRejectedValue(new Error("Firestore network blip"));

      const incidents: FailureQueueRecord[] = [
        {
          id: "fail-2",
          customerId: "firebaseAuthUidFailingUser",
          subscriptionId: "c8e1001a-5b2e-4f3b-9a1c-7d8e9f0a1b2c",
          mealType: "dinner",
          date: "2026-10-05",
          reason: "Cannot route order: No delivery zone serves pincode 573133.",
          status: "pending",
          attempts: 1,
          retryCount: 0,
          createdAt: { toDate: () => new Date() } as any,
        },
      ];

      // Should not throw or crash
      const res = await resolveFailureQueueReferences(incidents);
      const custDisplay = res.customerDisplayMap.get("firebaseAuthUidFailingUser");
      const subDisplay = res.subscriptionDisplayMap.get("c8e1001a-5b2e-4f3b-9a1c-7d8e9f0a1b2c");

      expect(custDisplay).toMatch(/^Customer \(MP-[A-Z0-9]+\)$/);
      expect(custDisplay).not.toContain("firebaseAuthUidFailingUser");
      expect(subDisplay).toBe("Subscription (SUB-C8E100)");
      expect(subDisplay).not.toContain("c8e1001a-5b2e-4f3b-9a1c-7d8e9f0a1b2c");
    });
  });
});
