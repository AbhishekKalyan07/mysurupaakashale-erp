import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscriptionService } from "../subscriptionService";
import { orderService } from "../orderService";
import { auditRepository } from "@/shared/services/firestore/auditRepository";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    doc: vi.fn((_db, collection, id) => ({ collection, id })),
  };
});

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    update: vi.fn(),
  },
}));

vi.mock("../orderService", () => ({
  orderService: {
    appendCancelOrdersToBatch: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue("mock-audit-id"),
  },
}));

describe("Bug 3: Pause Subscription Audit Actor Attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSub = {
    id: "sub-audit-1",
    customerId: "cust-audit-1",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  } as any;

  const mockCancelledOrders = [
    { id: "ord-1", mealType: "lunch" },
    { id: "ord-2", mealType: "dinner" },
  ];

  it("Scenario A: When an Admin pauses subscription, audit log records the authentic Admin actor", async () => {
    vi.mocked(orderService.appendCancelOrdersToBatch).mockResolvedValue(mockCancelledOrders as any);

    const adminActor = {
      uid: "admin-uid-999",
      role: "admin",
      fullName: "Super Admin",
    };

    await subscriptionService.pauseSubscription(
      mockSub,
      true, // shouldPauseNow
      "2026-09-20",
      "2026-09-25",
      adminActor,
    );

    // Give dynamic import promise a tick to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(auditRepository.logAction).toHaveBeenCalledWith(
      "meal_cancelled",
      "admin-uid-999",
      "admin",
      "Super Admin",
      "ord-1",
      "order",
      expect.objectContaining({
        mealType: "lunch",
        source: "admin_pause",
      }),
    );
  });

  it("Scenario B: When customer pauses own subscription, customer identity is recorded", async () => {
    vi.mocked(orderService.appendCancelOrdersToBatch).mockResolvedValue(mockCancelledOrders as any);

    await subscriptionService.pauseSubscription(
      mockSub,
      true, // shouldPauseNow
      "2026-09-20",
      "2026-09-25",
      // No admin actor passed -> defaults to customer
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(auditRepository.logAction).toHaveBeenCalledWith(
      "meal_cancelled",
      "cust-audit-1",
      "customer",
      "Customer",
      "ord-1",
      "order",
      expect.objectContaining({
        mealType: "lunch",
        source: "customer_pause",
      }),
    );
  });
});
