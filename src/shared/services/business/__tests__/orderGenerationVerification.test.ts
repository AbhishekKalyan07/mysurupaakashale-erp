import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderService } from "../orderService";
import { orderVerificationService } from "../orderVerificationService";
import { orderRepository } from "../../firestore/orderRepository";
import { subscriptionRepository } from "../../firestore/subscriptionRepository";
import { holidayRepository } from "../../firestore/holidayRepository";
import { userRepository } from "../../firestore/userRepository";
import { deliveryZoneRepository } from "../../firestore/deliveryZoneRepository";
import { mealPlanRepository } from "../../firestore/mealPlanRepository";
import { orderGenerationRunRepository } from "../../firestore/analyticsRepository";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "system" } },
}));

vi.mock("@/shared/services/firestore/holidayRepository", () => ({
  holidayRepository: {
    isHoliday: vi.fn().mockResolvedValue(false),
    getHoliday: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/services/firestore/notificationService", () => ({
  notifyAdminAlert: vi.fn().mockResolvedValue(undefined),
  notifyOrderGeneratedCustomer: vi.fn().mockResolvedValue(undefined),
  notifyOrderGeneratedDriver: vi.fn().mockResolvedValue(undefined),
  notifyDailyOrdersGenerated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    logFailure: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Firebase Firestore
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    addDoc: vi.fn().mockResolvedValue({ id: "mock_id" }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    query: vi.fn(),
    onSnapshot: vi.fn(),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTxn = {
        get: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return await callback(mockTxn);
    }),
    serverTimestamp: vi.fn(() => "server-timestamp"),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    doc: vi.fn((db, collection, id, sub, subId) => ({
      db,
      collection,
      id,
      sub,
      subId,
    })),
    collection: vi.fn((db, path) => ({
      db,
      path,
      withConverter: vi.fn(() => ({ db, path })),
    })),
    updateDoc: vi.fn(),
  };
});

describe("Order Generation & Verification Comprehensive Test Suite", () => {
  const TEST_DATE = "2026-09-22"; // Tuesday (operating day)
  const SUNDAY_DATE = "2026-09-20"; // Sunday

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    vi.mocked(holidayRepository.getHoliday).mockResolvedValue(null);

    // Default mock setup for repositories
    vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue(null);
    vi.spyOn(orderGenerationRunRepository, "create").mockResolvedValue("run1");
    vi.spyOn(orderGenerationRunRepository, "update").mockResolvedValue();

    vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
      { id: "zone1", name: "Zone 1", kitchenId: "kitchen1", pincodes: ["570001"], isActive: true } as any,
    ]);

    vi.spyOn(userRepository, "list").mockResolvedValue([
      {
        id: "driver1",
        role: "delivery_partner",
        isActive: true,
        isAvailable: true,
        zoneIds: ["zone1"],
        shifts: ["breakfast", "lunch", "dinner"],
      } as any,
    ]);

    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust1",
        role: "customer",
        fullName: "Test Customer",
        defaultAddressId: "addr1",
        addresses: [{ id: "addr1", pincode: "570001", line1: "123 Main St", city: "Mysuru" }],
      } as any,
    ]);

    vi.spyOn(mealPlanRepository, "list").mockResolvedValue([
      {
        id: "plan1",
        name: "Standard Plan",
        mealSlots: [
          { mealType: "breakfast", options: [{ id: "opt1", label: "Idli Sambar" }] },
          { mealType: "lunch", options: [{ id: "opt2", label: "South Meals" }] },
          { mealType: "dinner", options: [{ id: "opt3", label: "Chapathi Curry" }] },
        ],
      } as any,
    ]);
  });

  // ── 1. Single Active Subscription ──────────────────────────────────────────
  it("1. generates orders for a single active subscription with all meals", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub1",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [
          { mealType: "breakfast", selectedOptionId: "opt1" },
          { mealType: "lunch", selectedOptionId: "opt2" },
          { mealType: "dinner", selectedOptionId: "opt3" },
        ],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(3);
  });

  // ── 2. Multiple Active Subscriptions ───────────────────────────────────────
  it("2. generates all orders for multiple active subscriptions", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub1",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }, { mealType: "lunch" }],
      } as any,
      {
        id: "sub2",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }, { mealType: "dinner" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(4);
  });

  // ── 3-5. Single Meal Types (Breakfast only, Lunch only, Dinner only) ───────
  it("3. generates breakfast only when subscription only subscribes to breakfast", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_b",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(1);
  });

  it("4. generates lunch only when subscription only subscribes to lunch", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_l",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(1);
  });

  it("5. generates dinner only when subscription only subscribes to dinner", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_d",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "dinner" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(1);
  });

  // ── 6. All Meals ──────────────────────────────────────────────────────────
  it("6. generates all 3 meals when subscription includes all meal preferences", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_all",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }, { mealType: "lunch" }, { mealType: "dinner" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.success).toBe(true);
    expect(result.ordersGenerated).toBe(3);
  });

  // ── 7. Paused Subscription ────────────────────────────────────────────────
  it("7. excludes subscriptions that are paused for today", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_paused",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        pauseStartDate: "2026-09-20",
        pauseEndDate: "2026-09-25",
        mealPreferences: [{ mealType: "lunch" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.ordersGenerated).toBe(0);
  });

  it("7b. includes subscriptions whose pause starts in the future", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_future_pause",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        pauseStartDate: "2026-09-28",
        pauseEndDate: "2026-09-30",
        mealPreferences: [{ mealType: "lunch" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.ordersGenerated).toBe(1);
  });

  // ── 8. Cancelled Subscription ─────────────────────────────────────────────
  it("8. excludes cancelled subscriptions from order generation", async () => {
    vi.spyOn(subscriptionRepository, "list").mockImplementation(async (..._args: any[]) => {
      // In Firestore query: where("status", "==", "active")
      return [];
    });

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.ordersGenerated).toBe(0);
  });

  // ── 9. Expired Subscription ───────────────────────────────────────────────
  it("9. excludes expired subscriptions whose endDate has passed", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_expired",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-08-01",
        endDate: "2026-09-15", // In past relative to 2026-09-22
        mealPreferences: [{ mealType: "lunch" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.ordersGenerated).toBe(0);
  });

  // ── 10. Future Subscription ───────────────────────────────────────────────
  it("10. excludes future subscriptions whose startDate has not arrived", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_future",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01", // Future
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "lunch" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateDailyOrders(TEST_DATE);

    expect(result.ordersGenerated).toBe(0);
  });

  // ── 11. Official Holiday ──────────────────────────────────────────────────
  it("11. skips order generation on official declared holidays", async () => {
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(true);
    vi.mocked(holidayRepository.getHoliday).mockResolvedValue({
      id: `holiday_${TEST_DATE}`,
      date: TEST_DATE,
      title: "Gandhi Jayanti",
      status: "active",
    } as any);

    const bRes = await orderService.generateBreakfastOrders(TEST_DATE);
    const lRes = await orderService.generateLunchOrders(TEST_DATE);
    const dRes = await orderService.generateDinnerOrders(TEST_DATE);

    expect(bRes.generated).toBe(0);
    expect(lRes.generated).toBe(0);
    expect(dRes.generated).toBe(0);

    const dailyRes = await orderService.generateDailyOrders(TEST_DATE);
    expect(dailyRes.success).toBe(true);
    expect(dailyRes.message).toContain("holiday");
    expect(dailyRes.ordersGenerated).toBe(0);
  });

  // ── 12. Sunday Weekly Holiday ─────────────────────────────────────────────
  it("12. skips order generation on Sundays and reports expected skip", async () => {
    const result = await orderService.generateDailyOrders(SUNDAY_DATE);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Sunday (Holiday)");
    expect(result.ordersGenerated).toBe(0);
  });

  // ── 13. Idempotent Duplicate Execution ────────────────────────────────────
  it("13. does not create duplicate orders if workflow runs twice", async () => {
    const sub = {
      id: "sub_idempotent",
      customerId: "cust1",
      planId: "plan1",
      status: "active",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      mealPreferences: [{ mealType: "breakfast" }],
    } as any;

    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([sub]);

    // First run: no orders exist yet
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);
    const run1 = await orderService.generateBreakfastOrders(TEST_DATE);
    expect(run1.generated).toBe(1);

    // Second run: order already exists in Firestore with id ord_sub_idempotent_2026-09-22_breakfast
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_${sub.id}_${TEST_DATE}_breakfast`,
        subscriptionId: sub.id,
        mealType: "breakfast",
        date: TEST_DATE,
        status: "scheduled",
      } as any,
    ]);
    const run2 = await orderService.generateBreakfastOrders(TEST_DATE);
    expect(run2.generated).toBe(0); // 0 duplicates created!
  });

  // ── 14. Missing Kitchen Configuration ─────────────────────────────────────
  it("14. fails generation and formats error when kitchen configuration is missing", async () => {
    // No delivery zones configured in system
    vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([]);
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_nokitchen",
        customerId: "cust1",
        planId: "plan1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
  });

  // ── 15-16. Verification Service: Expected Zero Orders ─────────────────────
  it("15. verifies Sunday as an expected zero skip (PASS)", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const verification = await orderVerificationService.verifyDailyOrders(SUNDAY_DATE);

    expect(verification.verification).toBe("PASS");
    expect(verification.finalResult).toBe("SUCCESS");
    expect(verification.isExpectedZero).toBe(true);
  });

  it("16. verifies configured holiday as an expected zero skip (PASS)", async () => {
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(true);
    vi.mocked(holidayRepository.getHoliday).mockResolvedValue({
      id: `holiday_${TEST_DATE}`,
      date: TEST_DATE,
      title: "Public Holiday",
      status: "active",
    } as any);
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const verification = await orderVerificationService.verifyDailyOrders(TEST_DATE);

    expect(verification.verification).toBe("PASS");
    expect(verification.finalResult).toBe("SUCCESS");
    expect(verification.isExpectedZero).toBe(true);
  });

  // ── 17. Unexpected Zero Orders (Catastrophic Bug Fix) ──────────────────────
  it("17. FAILS verification when eligible active subscriptions exist but 0 orders were generated", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub1",
        customerId: "cust1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }, { mealType: "lunch" }, { mealType: "dinner" }],
      } as any,
    ]);
    // 0 orders in Firestore
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const verification = await orderVerificationService.verifyDailyOrders(TEST_DATE);

    expect(verification.verification).toBe("FAIL");
    expect(verification.finalResult).toBe("FAILED");
    expect(verification.failureReasons[0]).toContain("UNEXPECTED ZERO");
  });

  // ── 18. Partial Order Generation ──────────────────────────────────────────
  it("18. FAILS verification when only some expected orders were generated", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub1",
        customerId: "cust1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }, { mealType: "lunch" }],
      } as any,
    ]);
    // Only breakfast was created, lunch is missing!
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub1_${TEST_DATE}_breakfast`,
        subscriptionId: "sub1",
        mealType: "breakfast",
        date: TEST_DATE,
        status: "scheduled",
      } as any,
    ]);

    const verification = await orderVerificationService.verifyDailyOrders(TEST_DATE);

    expect(verification.verification).toBe("FAIL");
    expect(verification.finalResult).toBe("FAILED");
    expect(verification.orders.missing).toHaveLength(1);
    expect(verification.orders.missing[0].mealType).toBe("lunch");
  });

  // ── 19. Complete Verification Success ─────────────────────────────────────
  it("19. PASSES verification when all expected orders are present in Firestore", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub1",
        customerId: "cust1",
        status: "active",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        mealPreferences: [{ mealType: "breakfast" }, { mealType: "lunch" }],
      } as any,
    ]);
    // Both orders exist in Firestore
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub1_${TEST_DATE}_breakfast`,
        subscriptionId: "sub1",
        mealType: "breakfast",
        date: TEST_DATE,
        status: "scheduled",
      } as any,
      {
        id: `ord_sub1_${TEST_DATE}_lunch`,
        subscriptionId: "sub1",
        mealType: "lunch",
        date: TEST_DATE,
        status: "scheduled",
      } as any,
    ]);

    const verification = await orderVerificationService.verifyDailyOrders(TEST_DATE);

    expect(verification.verification).toBe("PASS");
    expect(verification.finalResult).toBe("SUCCESS");
    expect(verification.orders.missing).toHaveLength(0);
    expect(verification.orders.duplicates).toHaveLength(0);
  });

  // ── 20. Structured Report Formatting ──────────────────────────────────────
  it("20. formats report matching the exact Phase 6 specification", () => {
    const report = orderVerificationService.formatReport({
      businessDate: "2026-09-22",
      timezone: "Asia/Kolkata",
      subscriptions: {
        total: 10,
        active: 8,
        paused: 2,
        cancelled: 0,
        eligible: 8,
      },
      calendar: {
        day: "Tuesday",
        isHoliday: false,
        reason: "None",
      },
      orders: {
        expectedBreakfast: 8,
        expectedLunch: 8,
        expectedDinner: 8,
        expectedTotal: 24,
        actualBreakfast: 8,
        actualLunch: 8,
        actualDinner: 8,
        actualTotal: 24,
        missing: [],
        duplicates: [],
      },
      verification: "PASS",
      finalResult: "SUCCESS",
      isExpectedZero: false,
      failureReasons: [],
    });

    expect(report).toContain("========================================");
    expect(report).toContain("MYSURU PAAKASHALE DAILY AUTOMATION");
    expect(report).toContain("Business Date: 2026-09-22");
    expect(report).toContain("Timezone: Asia/Kolkata");
    expect(report).toContain("Expected Total: 24");
    expect(report).toContain("Generated Total: 24");
    expect(report).toContain("Verification:\nPASS");
    expect(report).toContain("Final Result:\nSUCCESS");
  });
});
