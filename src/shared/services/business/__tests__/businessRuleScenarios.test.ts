import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderService } from "../orderService";
import { OrderDiagnosticService } from "../orderDiagnosticService";
import { subscriptionService } from "../subscriptionService";
import { subscriptionRepository } from "../../firestore/subscriptionRepository";
import { orderRepository } from "../../firestore/orderRepository";
import { userRepository } from "../../firestore/userRepository";
import { deliveryZoneRepository } from "../../firestore/deliveryZoneRepository";
import { kitchenRepository } from "../../firestore/kitchenRepository";
import { mealPlanRepository } from "../../firestore/mealPlanRepository";
import { holidayRepository } from "../../firestore/holidayRepository";
import { orderGenerationRunRepository } from "../../firestore/analyticsRepository";

// Mock Firebase Firestore
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    runTransaction: vi.fn(async (_db, cb) => {
      const mockTxn = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return await cb(mockTxn);
    }),
    serverTimestamp: vi.fn(() => "server-timestamp"),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    doc: vi.fn((db, collection, id, ...rest) => ({
      db,
      collection,
      id,
      rest,
    })),
    collection: vi.fn((db, path) => ({
      db,
      path,
      withConverter: vi.fn(() => ({ db, path })),
    })),
  };
});

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "test-admin" } },
}));

describe("Production Safety Review: Scenarios A through I", () => {
  const targetDate = "2026-09-23"; // Wednesday (not Sunday)

  const mockCustomer = {
    id: "c1",
    role: "customer",
    fullName: "Customer One",
    defaultAddressId: "addr1",
    addresses: [{ id: "addr1", pincode: "570001", line1: "Street", city: "Mysuru" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(holidayRepository, "isHoliday").mockResolvedValue(false);
    vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue(null);
    vi.spyOn(orderGenerationRunRepository, "create").mockResolvedValue("run1");
    vi.spyOn(orderGenerationRunRepository, "update").mockResolvedValue();
    vi.spyOn(mealPlanRepository, "list").mockResolvedValue([]);
    vi.spyOn(userRepository, "list").mockResolvedValue([mockCustomer] as any);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([mockCustomer] as any);
    vi.spyOn(userRepository, "getById").mockResolvedValue(mockCustomer as any);
    vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
      { id: "z1", name: "Zone 1", pincodes: ["570001"], kitchenId: "k1", isActive: true },
    ] as any);
    vi.spyOn(kitchenRepository, "list").mockResolvedValue([
      { id: "k1", name: "Main Kitchen" },
    ] as any);
  });

  // Scenario A: Active subscription + no pause + no customer skip -> order MUST be generated/scheduled
  it("Scenario A: generates scheduled order for active subscription with no pause and no customer skip", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const subs = [
      {
        id: "sub_a",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    expect(result.generated).toBe(1);
    expect(result.failed).toBe(0);
    expect(batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: `ord_sub_a_${targetDate}_lunch`,
        status: "scheduled",
      }),
      { merge: true },
    );
  });

  // Scenario B: Active subscription + stale pauseStartDate in past + pauseEndDate: null -> MUST NOT be treated as paused
  it("Scenario B: active subscription with stale pauseStartDate in the past and null pauseEndDate is NOT treated as paused", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const subs = [
      {
        id: "sub_b",
        customerId: "c1",
        status: "active",
        startDate: "2026-08-01",
        endDate: "2026-10-31",
        pauseStartDate: "2026-08-10", // stale past pause
        pauseEndDate: null,
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    expect(result.generated).toBe(1);
    expect(batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: `ord_sub_b_${targetDate}_lunch`,
        status: "scheduled",
      }),
      { merge: true },
    );
  });

  // Scenario C: Active subscription + valid pause window covering today -> order MUST NOT be generated/restored
  it("Scenario C: active subscription within a valid pause window covering today MUST NOT generate orders", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const subs = [
      {
        id: "sub_c",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        pauseStartDate: "2026-09-20",
        pauseEndDate: "2026-09-25", // targetDate is 2026-09-23 -> actively paused
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    expect(result.generated).toBe(0);
    expect(batchSet).not.toHaveBeenCalled();
  });

  // Scenario D: Subscription status = paused -> order MUST NOT be generated/restored
  it("Scenario D: subscription with status = 'paused' MUST NOT generate orders", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    // generateMealOrders queries where("status", "==", "active"), so paused subs are not returned
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return [];
      return [
        {
          id: "sub_d",
          customerId: "c1",
          status: "paused",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          mealPreferences: [{ mealType: "lunch" }],
        } as any,
      ];
    });
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    expect(result.generated).toBe(0);
    expect(batchSet).not.toHaveBeenCalled();
  });

  // Scenario E: Customer intentionally skipped today's meal -> cancelled/skipped order MUST remain cancelled/skipped and NOT auto-restored
  it("Scenario E: intentionally skipped order by customer MUST remain cancelled and NOT be restored to scheduled", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    // Mock customer skip doc exists for today with lunch
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ mealTypes: ["lunch"], reason: "Personal travel" }),
    } as any);

    const subs = [
      {
        id: "sub_e",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });

    // An order document already exists with status: "cancelled"
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub_e_${targetDate}_lunch`,
        subscriptionId: "sub_e",
        customerId: "c1",
        mealType: "lunch",
        date: targetDate,
        status: "cancelled",
      } as any,
    ]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    // It should NOT restore the order to scheduled
    expect(result.generated).toBe(0);
    expect(batchSet).not.toHaveBeenCalled();

    // Verify diagnostic service also respects intentional skip and does NOT auto-heal it
    const diagnosticService = new OrderDiagnosticService();
    const diagResult = await diagnosticService.diagnoseAndRemediate(targetDate);

    expect(diagResult.status).toBe("all_paused_or_skipped");
    expect(diagResult.autoHealedCount).toBe(0);
    expect(diagResult.skippedCustomers).toHaveLength(1);
    expect(diagResult.skippedCustomers[0].mealTypes).toContain("lunch");
  });

  // Scenario F: Existing cancelled/skipped order + NO customer skip record -> order MAY be restored to scheduled
  it("Scenario F: cancelled order without customer skip document is restored to scheduled", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    // No customer skip document
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const subs = [
      {
        id: "sub_f",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });

    // Existing order document in Firestore is cancelled
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub_f_${targetDate}_lunch`,
        subscriptionId: "sub_f",
        customerId: "c1",
        mealType: "lunch",
        date: targetDate,
        status: "cancelled",
      } as any,
    ]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    // It restores the cancelled order to scheduled
    expect(result.generated).toBe(1);
    expect(batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: `ord_sub_f_${targetDate}_lunch`,
        status: "scheduled",
      }),
      { merge: true },
    );
  });

  // Scenario G: Customer resumes subscription today -> today's eligible orders restored/generated exactly once, intentional skips preserved
  it("Scenario G: resuming subscription restores/generates orders exactly once and preserves intentional skips", async () => {
    const { getDoc } = await import("firebase/firestore");
    // Customer had explicitly skipped dinner, but lunch was not skipped
    vi.mocked(getDoc).mockImplementation(async (ref: any) => {
      if (ref.id === targetDate || (ref.rest && ref.rest[1] === targetDate)) {
        return {
          exists: () => true,
          data: () => ({ mealTypes: ["dinner"] }),
        } as any;
      }
      return { exists: () => false, data: () => ({}) } as any;
    });

    const sub: any = {
      id: "sub_g",
      customerId: "c1",
      status: "paused",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      pauseStartDate: "2026-09-20",
      pauseEndDate: "2026-09-25",
      mealPreferences: [{ mealType: "lunch" }, { mealType: "dinner" }],
    };

    const dateModule = await import("@/shared/lib/date");
    vi.spyOn(dateModule, "getTodayInTimezone").mockReturnValue(targetDate);

    vi.spyOn(subscriptionRepository, "update").mockResolvedValue();
    const restoreSpy = vi.spyOn(orderService, "restoreOrdersForUnskipDay").mockResolvedValue();

    await subscriptionService.resumeSubscription(sub);

    expect(subscriptionRepository.update).toHaveBeenCalledWith("sub_g", {
      status: "active",
      pauseStartDate: null,
      pauseEndDate: null,
    });

    // restoreOrdersForUnskipDay must be called with ONLY lunch, excluding dinner which was skipped!
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(restoreSpy).toHaveBeenCalledWith(
      "c1",
      "sub_g",
      targetDate,
      ["lunch"], // dinner omitted because customer intentionally skipped it
      true,
    );
  });

  // Scenario H: Re-running daily generation -> MUST remain idempotent; no duplicate orders
  it("Scenario H: re-running daily generation is strictly idempotent and does not duplicate orders", async () => {
    const { writeBatch, getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as any);

    const subs = [
      {
        id: "sub_h",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && q.value === "active") return subs as any;
      return [];
    });

    // First run: order already exists in scheduled state
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub_h_${targetDate}_lunch`,
        subscriptionId: "sub_h",
        customerId: "c1",
        mealType: "lunch",
        date: targetDate,
        status: "scheduled",
      } as any,
    ]);

    const batchSet = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any);

    const result = await orderService.generateLunchOrders(targetDate);

    expect(result.generated).toBe(0);
    expect(result.failed).toBe(0);
    expect(batchSet).not.toHaveBeenCalled();
  });

  // Scenario I: Running diagnostic/auto-heal repeatedly -> MUST NOT create duplicate orders or undo intentional customer actions
  it("Scenario I: running diagnostic/auto-heal repeatedly does not duplicate orders or undo intentional skips", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ mealTypes: ["lunch"] }),
    } as any);

    const subs = [
      {
        id: "sub_i",
        customerId: "c1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      },
    ];
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (...args: any[]) => {
      const q = args.find((a: any) => a.field === "status");
      if (q && (q.value === "active" || (Array.isArray(q.value) && q.value.includes("active")))) {
        return subs as any;
      }
      return [];
    });

    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub_i_${targetDate}_lunch`,
        subscriptionId: "sub_i",
        customerId: "c1",
        mealType: "lunch",
        date: targetDate,
        status: "cancelled",
      } as any,
    ]);

    const genSubSpy = vi.spyOn(orderService, "generateOrdersForSubscription").mockResolvedValue(1 as any);

    const diagnosticService = new OrderDiagnosticService();

    // Run 1
    const run1 = await diagnosticService.diagnoseAndRemediate(targetDate);
    expect(run1.autoHealedCount).toBe(0);
    expect(genSubSpy).not.toHaveBeenCalled();

    // Run 2
    const run2 = await diagnosticService.diagnoseAndRemediate(targetDate);
    expect(run2.autoHealedCount).toBe(0);
    expect(genSubSpy).not.toHaveBeenCalled();
  });
});
