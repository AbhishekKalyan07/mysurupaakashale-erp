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
import { failureQueueRepository } from "../../firestore/failureQueueRepository";
import { OrderDataIntegrityError } from "../orderErrors";

vi.mock("@/shared/lib/firebase", () => ({
  db: { app: { options: { projectId: "demo-test" } } },
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
  dispatchOperationalCancellationNotifications: vi.fn().mockResolvedValue(undefined),
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
      delete: vi.fn(),
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

describe("Orphan Subscription & Order Generation Regression Suite (Scenarios 1-11)", () => {
  const TEST_DATE = "2026-10-27"; // Tuesday

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    vi.mocked(holidayRepository.getHoliday).mockResolvedValue(null);

    vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue(null);
    vi.spyOn(orderGenerationRunRepository, "create").mockResolvedValue("run1");
    vi.spyOn(orderGenerationRunRepository, "update").mockResolvedValue();

    vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
      {
        id: "zone1",
        name: "Zone 1",
        kitchenId: "kitchen1",
        pincodes: ["570001"],
        isActive: true,
      } as any,
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

  // Scenario 1: An active subscription references a customer profile that does not exist
  it("1. reports missing customer profile cleanly when subscription references a deleted customer", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_orphan_1",
        customerId: "cust_deleted_123",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust_deleted_123",
      "sub_orphan_1",
      "breakfast",
      TEST_DATE,
      expect.stringContaining("Referenced customer profile not found in database"),
      expect.anything(),
    );
  });

  // Scenario 2: A customer exists but the referenced delivery address is missing
  it("2. reports missing delivery address when customer has no matching address", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_no_addr",
        customerId: "cust_active",
        deliveryAddressId: "addr_nonexistent",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_active",
        role: "customer",
        fullName: "Test Customer",
        addresses: [], // Empty address list
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust_active",
      "sub_no_addr",
      "breakfast",
      TEST_DATE,
      expect.stringContaining("Customer delivery address not found"),
      expect.anything(),
    );
  });

  // Scenario 3: An address exists but lacks a valid pincode
  it("3. reports routing error when customer address lacks a valid pincode", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_no_pin",
        customerId: "cust_active",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_active",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "   ", line1: "No Pincode Street" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust_active",
      "sub_no_pin",
      "breakfast",
      TEST_DATE,
      expect.stringContaining("Cannot route order: Address pincode is empty"),
      expect.anything(),
    );
  });

  // Scenario 4: The address is valid but no matching delivery zone can be resolved
  it("4. reports routing failure when pincode is not served by any delivery zone", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_unserved",
        customerId: "cust_active",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_active",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "570999", line1: "Outer Area" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust_active",
      "sub_unserved",
      "breakfast",
      TEST_DATE,
      expect.stringContaining("No delivery zone serves pincode 570999"),
      expect.anything(),
    );
  });

  // Scenario 5: A delivery zone references a missing or inactive kitchen
  it("5. reports missing kitchen configuration accurately when matched zone has no assigned kitchen", async () => {
    vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
      {
        id: "zone_nokitchen",
        name: "Unassigned Zone",
        kitchenId: null, // No assigned kitchen
        pincodes: ["570001"],
        isActive: true,
      } as any,
    ]);
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_nokitchen_zone",
        customerId: "cust_active",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_active",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "570001", line1: "Central Street" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(failureQueueRepository.logFailure).toHaveBeenCalledWith(
      "cust_active",
      "sub_nokitchen_zone",
      "breakfast",
      TEST_DATE,
      expect.stringContaining("has no assigned kitchen"),
      expect.anything(),
    );
  });

  // Scenario 6: A valid customer, address, zone, and kitchen produce expected order snapshot
  it("6. produces valid order snapshot when customer, address, zone, and kitchen are valid", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_valid",
        customerId: "cust_valid",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_valid",
        role: "customer",
        fullName: "Valid Customer",
        addresses: [{ id: "addr1", pincode: "570001", line1: "123 Main St", city: "Mysuru" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(0);
    expect(result.generated).toBe(1);
  });

  // Scenario 7: A transient infrastructure failure retains appropriate retry behavior
  it("7. retains retry behavior for transient errors and recovers if retry succeeds", async () => {
    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDoc).mockRejectedValueOnce(
      new Error("Transient Firestore connection timeout"),
    );

    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_transient",
        customerId: "cust_valid",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_valid",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "570001", line1: "123 Main St" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    // First attempt failed transiently, second attempt succeeded!
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(0);
  });

  // Scenario 8: Permanent data-integrity failures do not receive pointless retries
  it("8. skips redundant retries for permanent OrderDataIntegrityError", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_permanent_fail",
        customerId: "cust_nonexistent",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);

    // Check console logged the permanent failure note
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("permanent data integrity failure — skipping redundant retries"),
      expect.any(OrderDataIntegrityError),
    );

    consoleSpy.mockRestore();
  });

  // Scenario 9: Valid customers continue to receive orders when another subscription is invalid
  it("9. continues generating orders for valid customers even when another subscription has data integrity failure", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_orphan_fail",
        customerId: "cust_missing",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
      {
        id: "sub_valid_success",
        customerId: "cust_valid",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_valid",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "570001", line1: "123 Main St" }],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    // Valid customer received their order!
    expect(result.generated).toBe(1);
    // Invalid customer was isolated as a failure!
    expect(result.failed).toBe(1);
  });

  // Scenario 10: Repeated execution does not duplicate orders
  it("10. ensures idempotency by skipping already-generated orders on repeated execution", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_idempotent",
        customerId: "cust_valid",
        deliveryAddressId: "addr1",
        planId: "plan1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [{ mealType: "breakfast", selectedOptionId: "opt1" }],
      } as any,
    ]);
    vi.spyOn(userRepository, "getByIds").mockResolvedValue([
      {
        id: "cust_valid",
        role: "customer",
        addresses: [{ id: "addr1", pincode: "570001", line1: "123 Main St" }],
      } as any,
    ]);

    // Already exists in DB for this date
    vi.spyOn(orderRepository, "list").mockResolvedValue([
      {
        id: `ord_sub_idempotent_${TEST_DATE}_breakfast`,
        subscriptionId: "sub_idempotent",
        mealType: "breakfast",
        date: TEST_DATE,
        status: "scheduled",
      } as any,
    ]);

    const result = await orderService.generateBreakfastOrders(TEST_DATE);

    expect(result.generated).toBe(0); // 0 duplicates
    expect(result.failed).toBe(0);
  });

  // Scenario 11: Verification still fails when expected orders are missing
  it("11. fails verification with UNEXPECTED ZERO or PARTIAL GENERATION when expected orders are missing", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_missing_orders",
        customerId: "cust1",
        status: "active",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        mealPreferences: [
          { mealType: "breakfast" },
          { mealType: "lunch" },
          { mealType: "dinner" },
        ],
      } as any,
    ]);
    vi.spyOn(orderRepository, "list").mockResolvedValue([]);

    const verification = await orderVerificationService.verifyDailyOrders(TEST_DATE);

    expect(verification.verification).toBe("FAIL");
    expect(verification.finalResult).toBe("FAILED");
    expect(verification.orders.missing.length).toBe(3);
    expect(verification.failureReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UNEXPECTED ZERO"),
      ]),
    );
  });
});
