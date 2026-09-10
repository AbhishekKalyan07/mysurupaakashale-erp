import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderService } from "../orderService";
import { orderRepository } from "../../firestore/orderRepository";
import { kitchenRepository } from "../../firestore/kitchenRepository";

vi.mock("../../firestore/holidayRepository", () => ({
  holidayRepository: {
    isHoliday: vi.fn().mockResolvedValue(false),
  },
}));

// Mock Firebase Firestore
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
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
    Timestamp: {
      now: vi.fn(() => ({ toMillis: () => Date.now() })),
    },
  };
});

// Mock Firebase Functions
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() =>
    vi.fn().mockResolvedValue({
      data: { success: true, message: "Success", ordersGenerated: 0 },
    }),
  ),
}));

// Mock DB
vi.mock("@/shared/lib/firebase", () => ({
  functions: {},
  db: {},
  auth: { currentUser: { uid: "system" } },
}));

describe("orderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(kitchenRepository, "list").mockResolvedValue([
      { id: "k1" } as any,
    ]);
  });

  describe("generateDailyOrders", () => {
    it("aggregates orders generated from all meal types", async () => {
      vi.spyOn(orderService, "generateBreakfastOrders").mockResolvedValue({
        generated: 5,
        failed: 0,
      });
      vi.spyOn(orderService, "generateLunchOrders").mockResolvedValue({
        generated: 3,
        failed: 0,
      });
      vi.spyOn(orderService, "generateDinnerOrders").mockResolvedValue({
        generated: 2,
        failed: 0,
      });

      const result = await orderService.generateDailyOrders("2026-08-01"); // Saturday

      expect(orderService.generateBreakfastOrders).toHaveBeenCalledWith(
        "2026-08-01",
      );
      expect(orderService.generateLunchOrders).toHaveBeenCalledWith(
        "2026-08-01",
      );
      expect(orderService.generateDinnerOrders).toHaveBeenCalledWith(
        "2026-08-01",
      );
      expect(result).toEqual({
        success: true,
        message: "Successfully generated 10 new orders.",
        ordersGenerated: 10,
      });
    });

    it("returns 0 and skips generation if it is Sunday", async () => {
      vi.spyOn(orderService, "generateBreakfastOrders").mockResolvedValue({
        generated: 5,
        failed: 0,
      });
      const result = await orderService.generateDailyOrders("2026-08-02"); // Sunday

      expect(orderService.generateBreakfastOrders).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: "Today is Sunday (Holiday). No orders generated.",
        ordersGenerated: 0,
      });
    });

    it("returns success: false and preserves already generated orders if a later meal generation throws a fatal error", async () => {
      vi.spyOn(orderService, "generateBreakfastOrders").mockResolvedValue({
        generated: 5,
        failed: 0,
      });
      vi.spyOn(orderService, "generateLunchOrders").mockRejectedValue(
        new Error("Database offline"),
      );

      const result = await orderService.generateDailyOrders("2026-08-03");

      // Expected: breakfast succeeded (5), lunch failed, overall run is false, but ordersGenerated remains 5
      expect(result).toEqual({
        success: false,
        message: "Error: Database offline",
        ordersGenerated: 5,
      });
    });
  });

  describe("generateMealOrders (internal logic via mock)", () => {
    it("preserves idempotency and handles missing mealPreferences gracefully", async () => {
      // Simulate generateMealOrders by calling generateBreakfastOrders directly
      // Mock dependencies
      const { subscriptionRepository } =
        await import("../../firestore/subscriptionRepository");
      const { orderRepository } =
        await import("../../firestore/orderRepository");
      const { orderGenerationRunRepository } =
        await import("../../firestore/analyticsRepository");
      const { mealPlanRepository } =
        await import("../../firestore/mealPlanRepository");
      const { userRepository } = await import("../../firestore/userRepository");
      const { deliveryZoneRepository } =
        await import("../../firestore/deliveryZoneRepository");
      const { kitchenRepository } =
        await import("../../firestore/kitchenRepository");

      vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue(null);
      vi.spyOn(orderGenerationRunRepository, "create").mockResolvedValue(
        "run1",
      );
      vi.spyOn(orderGenerationRunRepository, "update").mockResolvedValue();

      vi.spyOn(mealPlanRepository, "list").mockResolvedValue([]);
      vi.spyOn(userRepository, "list").mockResolvedValue([]);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([]);
      vi.spyOn(kitchenRepository, "list").mockResolvedValue([]);

      const { getDoc } = await import("firebase/firestore");
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
        data: () => ({}),
      } as any);

      vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
        // Sub 1: Missing mealPreferences (legacy)
        {
          id: "sub1",
          customerId: "c1",
          status: "active",
          startDate: "2026-08-01",
        },
        // Sub 2: Active sub with autoRenew = false (should be generated if it hasn't ended)
        {
          id: "sub2",
          customerId: "c2",
          status: "active",
          autoRenew: false,
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          mealPreferences: [
            { mealType: "breakfast", selectedOptionId: "opt1" },
          ],
        },
        // Sub 3: Active sub that already has an order in todaysOrders (Idempotency check)
        {
          id: "sub3",
          customerId: "c3",
          status: "active",
          startDate: "2026-08-01",
          mealPreferences: [
            { mealType: "breakfast", selectedOptionId: "opt1" },
          ],
        },
        // Sub 4: Expired sub (status is active, but endDate is in the past). Should be skipped.
        {
          id: "sub4",
          customerId: "c4",
          status: "active",
          startDate: "2026-07-01",
          endDate: "2026-08-02",
          mealPreferences: [
            { mealType: "breakfast", selectedOptionId: "opt1" },
          ],
        },
      ] as any);

      // TodaysOrders contains an order for sub3 already (e.g., from a previously failed partial run)
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        {
          id: "ord_sub3_2026-08-03_breakfast",
          subscriptionId: "sub3",
          mealType: "breakfast",
          status: "packing",
        },
      ] as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchSet = vi.fn();
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({
        set: batchSet,
        update: vi.fn(),
        commit: batchCommit,
        delete: vi.fn(),
      } as any);

      const count = await orderService.generateBreakfastOrders("2026-08-03");

      // Sub1 is skipped because it has no breakfast preference.
      // Sub3 is skipped because its order already exists in todaysOrders.
      // Sub4 is skipped because its endDate (08-02) is before today (08-03).
      // Sub2 is generated because autoRenew=false does not stop it while active.
      expect(count.generated).toBe(1);
      expect(count.failed).toBe(0);

      // Verify Sub2 was created
      expect(batchSet).toHaveBeenCalledTimes(1);
      const createdOrder = batchSet.mock.calls[0][1];
      expect(createdOrder.subscriptionId).toBe("sub2");
    });

    it("reruns cleanly and recovers missing orders without global lockout (Idempotency Regression)", async () => {
      // Setup environment for the first run (0 existing orders)
      const { subscriptionRepository } =
        await import("../../firestore/subscriptionRepository");
      const { orderRepository } =
        await import("../../firestore/orderRepository");
      const { orderGenerationRunRepository } =
        await import("../../firestore/analyticsRepository");
      const { mealPlanRepository } =
        await import("../../firestore/mealPlanRepository");
      const { userRepository } = await import("../../firestore/userRepository");
      const { deliveryZoneRepository } =
        await import("../../firestore/deliveryZoneRepository");
      const { kitchenRepository } =
        await import("../../firestore/kitchenRepository");

      vi.spyOn(mealPlanRepository, "list").mockResolvedValue([]);
      vi.spyOn(userRepository, "list").mockResolvedValue([]);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([]);
      vi.spyOn(kitchenRepository, "list").mockResolvedValue([]);

      // The previous run (maybe buggy) left a "success" marker
      vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue({
        status: "success",
      } as any);

      vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
        {
          id: "sub_missing",
          customerId: "c1",
          status: "active",
          startDate: "2026-08-01",
          mealPreferences: [{ mealType: "breakfast" }],
        },
      ] as any);

      // Pass 1: Empty todaysOrders
      vi.spyOn(orderRepository, "list").mockResolvedValue([]);

      const { writeBatch } = await import("firebase/firestore");
      const batchSet = vi.fn();
      vi.mocked(writeBatch).mockReturnValue({
        set: batchSet,
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
      } as any);

      const pass1Count =
        await orderService.generateBreakfastOrders("2026-08-03");

      // Expected: Even though getById returned 'success', it still generates 1 missing order.
      expect(pass1Count.generated).toBe(1);
      expect(pass1Count.failed).toBe(0);
      expect(batchSet).toHaveBeenCalledTimes(1);
      const createdOrderId = batchSet.mock.calls[0][1].id;

      // Pass 2: The order is now in todaysOrders
      batchSet.mockClear();
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        {
          id: createdOrderId,
          subscriptionId: "sub_missing",
          mealType: "breakfast",
          status: "scheduled",
        },
      ] as any);

      const pass2Count =
        await orderService.generateBreakfastOrders("2026-08-03");

      // Expected: 0 new orders, no batch.set called (true document-level idempotency)
      expect(pass2Count.generated).toBe(0);
      expect(pass2Count.failed).toBe(0);
      expect(batchSet).not.toHaveBeenCalled();
    });

    it("orchestrates pause-resume and order generation correctly (E2E simulation)", async () => {
      // Create a simulated in-memory DB for subscriptions
      let subscriptions: any[] = [
        // Sub 1: Pause ends yesterday. Should resume today and get orders.
        {
          id: "sub_resumed_yesterday",
          customerId: "c1",
          status: "paused",
          pauseEndDate: "2026-08-02",
          startDate: "2026-08-01",
          mealPreferences: [{ mealType: "breakfast" }],
        },
        // Sub 2: Pause ends today. Should stay paused today.
        {
          id: "sub_pause_ends_today",
          customerId: "c2",
          status: "paused",
          pauseEndDate: "2026-08-03",
          startDate: "2026-08-01",
          mealPreferences: [{ mealType: "breakfast" }],
        },
        // Sub 3: Pause starts today. Should pause today.
        {
          id: "sub_pause_starts_today",
          customerId: "c3",
          status: "active",
          pauseStartDate: "2026-08-03",
          startDate: "2026-08-01",
          mealPreferences: [{ mealType: "breakfast" }],
        },
      ];

      const { subscriptionRepository } =
        await import("../../firestore/subscriptionRepository");

      // Mock list to respect the 'status' filter exactly as the real code does
      vi.spyOn(subscriptionRepository, "list").mockImplementation(
        async (...queries: any[]) => {
          let statusFilter: string | null = null;
          queries.forEach((q) => {
            if (q.field === "status" && q.op === "==") statusFilter = q.value;
          });
          if (statusFilter) {
            return subscriptions.filter(
              (s) => s.status === statusFilter,
            ) as any[];
          }
          return subscriptions as any[];
        },
      );

      // Mock update to mutate our simulated DB
      vi.spyOn(subscriptionRepository, "update").mockImplementation(
        async (id: string, updates: any) => {
          const idx = subscriptions.findIndex((s) => s.id === id);
          if (idx !== -1) {
            subscriptions[idx] = { ...subscriptions[idx], ...updates };
          }
        },
      );

      // Mock date behavior to be 2026-08-03
      const dateModule = await import("@/shared/lib/date");
      vi.spyOn(dateModule, "getTodayInTimezone").mockReturnValue("2026-08-03");

      // Dependencies for generateDailyOrders
      const { orderRepository } =
        await import("../../firestore/orderRepository");
      const { orderGenerationRunRepository } =
        await import("../../firestore/analyticsRepository");
      const { mealPlanRepository } =
        await import("../../firestore/mealPlanRepository");
      const { userRepository } = await import("../../firestore/userRepository");
      const { deliveryZoneRepository } =
        await import("../../firestore/deliveryZoneRepository");
      const { kitchenRepository } =
        await import("../../firestore/kitchenRepository");

      vi.spyOn(orderGenerationRunRepository, "getById").mockResolvedValue(null);
      vi.spyOn(orderGenerationRunRepository, "create").mockResolvedValue(
        "run1",
      );
      vi.spyOn(orderGenerationRunRepository, "update").mockResolvedValue();
      vi.spyOn(mealPlanRepository, "list").mockResolvedValue([]);
      vi.spyOn(userRepository, "list").mockResolvedValue([]);
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([]);
      vi.spyOn(kitchenRepository, "list").mockResolvedValue([]);
      vi.spyOn(orderRepository, "list").mockResolvedValue([] as any);

      const { getDoc } = await import("firebase/firestore");
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
        data: () => ({}),
      } as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchSet = vi.fn();
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({
        set: batchSet,
        update: vi.fn(),
        commit: batchCommit,
        delete: vi.fn(),
      } as any);

      // --- EXECUTE ORCHESTRATION ---

      // 1. Process Scheduled Pauses (Should mutate the DB)
      const { automationService } =
        await import("../../firestore/automationService");
      await automationService.processScheduledPauses();

      // Verify DB mutations
      const sub1 = subscriptions.find((s) => s.id === "sub_resumed_yesterday");
      expect(sub1.status).toBe("active"); // It resumed!

      const sub2 = subscriptions.find((s) => s.id === "sub_pause_ends_today");
      expect(sub2.status).toBe("paused"); // It's still paused.

      const sub3 = subscriptions.find((s) => s.id === "sub_pause_starts_today");
      expect(sub3.status).toBe("paused"); // It just paused.

      // 2. Generate Orders (Should fetch from the mutated DB)
      const count = await orderService.generateBreakfastOrders("2026-08-03");

      // Only sub_resumed_yesterday is 'active' now.
      expect(count.generated).toBe(1);
      expect(count.failed).toBe(0);
      expect(batchSet).toHaveBeenCalledTimes(1);

      const createdOrder = batchSet.mock.calls[0][1];
      expect(createdOrder.subscriptionId).toBe("sub_resumed_yesterday");
    });
  });

  describe("updateOrderStatus", () => {
    it("throws if orderId or status missing", async () => {
      await expect(
        orderService.updateOrderStatus("", "delivered"),
      ).rejects.toThrow("Order ID and Status are required.");
    });

    it("throws if order not found", async () => {
      vi.spyOn(orderRepository, "getById").mockResolvedValue(null);
      await expect(
        orderService.updateOrderStatus("ord1", "delivered"),
      ).rejects.toThrow("Order with ID ord1 not found.");
    });

    it("returns early if already in target status (idempotency)", async () => {
      vi.spyOn(orderRepository, "getById").mockResolvedValue({
        id: "ord1",
        status: "delivered",
      } as any);
      vi.spyOn(orderRepository, "update").mockResolvedValue();

      await orderService.updateOrderStatus("ord1", "delivered");

      expect(orderRepository.update).not.toHaveBeenCalled();
    });

    it("updates status correctly", async () => {
      vi.spyOn(orderRepository, "getById").mockResolvedValue({
        id: "ord1",
        status: "scheduled",
      } as any);
      vi.spyOn(orderRepository, "update").mockResolvedValue();

      await orderService.updateOrderStatus("ord1", "delivered");

      expect(orderRepository.update).toHaveBeenCalledWith(
        "ord1",
        expect.objectContaining({ status: "delivered" }),
      );
    });
  });

  describe("syncCustomerActiveOrders", () => {
    it("syncs active orders with new delivery partner and zone", async () => {
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        { id: "ord1", status: "scheduled" },
        { id: "ord2", status: "out_for_delivery" },
      ] as any);

      const { deliveryZoneRepository } =
        await import("../../firestore/deliveryZoneRepository");
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
        { id: "z1", name: "Zone 1" } as any,
      ]);
      const { userRepository } = await import("../../firestore/userRepository");
      vi.spyOn(userRepository, "list").mockResolvedValue([
        {
          id: "p1",
          fullName: "Partner 1",
          phone: "123",
          isActive: true,
          isAvailable: true,
          zoneIds: ["z1"],
          role: "delivery_partner",
        } as any,
      ]);
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        deliveryPartnerId: "p1",
        zoneId: "z1",
      } as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      const batchUpdate = vi.fn();
      vi.mocked(writeBatch).mockReturnValue({
        update: batchUpdate,
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.syncCustomerActiveOrders("c1");

      expect(batchUpdate).toHaveBeenCalledTimes(1);
      expect(batchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          deliveryPartnerId: "p1",
          driverName: "Partner 1",
          driverPhone: "123",
          zoneId: "z1",
          zoneName: "Zone 1",
        }),
      );
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it("does nothing if no active orders to sync", async () => {
      vi.spyOn(orderRepository, "list").mockResolvedValue([]);

      const { deliveryZoneRepository } =
        await import("../../firestore/deliveryZoneRepository");
      vi.spyOn(deliveryZoneRepository, "list").mockResolvedValue([
        { id: "z1", name: "Zone 1" } as any,
      ]);
      const { userRepository } = await import("../../firestore/userRepository");
      vi.spyOn(userRepository, "list").mockResolvedValue([
        {
          id: "p1",
          fullName: "Partner 1",
          phone: "123",
          isActive: true,
          isAvailable: true,
          zoneIds: ["z1"],
          role: "delivery_partner",
        } as any,
      ]);
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        id: "c1",
        deliveryPartnerId: "p1",
        zoneId: "z1",
      } as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({ commit: batchCommit } as any);

      await orderService.syncCustomerActiveOrders("c1");
      expect(batchCommit).toHaveBeenCalledTimes(0);
    });
  });

  describe("cancelOrdersForSkipDay", () => {
    it("cancels orders if they are not locked by kitchen", async () => {
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        { id: "ord1", kitchenStatus: "pending", mealType: "lunch", price: 60 },
        { id: "ord2", kitchenStatus: undefined, mealType: "lunch", price: 60 },
      ] as any);
      const { subscriptionRepository } =
        await import("../../firestore/subscriptionRepository");
      vi.spyOn(subscriptionRepository, "getById").mockResolvedValue({
        id: "sub1",
        quantity: 1,
        pricingMatrixSnapshot: {
          basic: {
            breakfast: 60,
            lunch: 65,
            dinner: 65,
            breakfast_lunch: 115,
            lunch_dinner: 115,
            breakfast_dinner: 115,
            breakfast_lunch_dinner: 159,
          },
        },
      } as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      const batchUpdate = vi.fn();
      vi.mocked(writeBatch).mockReturnValue({
        update: batchUpdate,
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.cancelOrdersForSkipDay("sub1", "c1", "2026-08-01", [
        "lunch",
      ]);

      expect(batchUpdate).toHaveBeenCalledTimes(2);
      expect(batchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "cancelled" }),
      );
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it("throws error if any order is locked by kitchen", async () => {
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        { id: "ord1", kitchenStatus: "pending", mealType: "lunch" },
        { id: "ord2", kitchenStatus: "packing", mealType: "lunch" },
      ] as any);

      await expect(
        orderService.cancelOrdersForSkipDay("sub1", "c1", "2026-08-01", [
          "lunch",
        ]),
      ).rejects.toThrow(
        "Order is already being prepared by the kitchen and cannot be cancelled.",
      );
    });

    it("does not dispatch privileged notifications directly from the customer client path", async () => {
      vi.spyOn(orderRepository, "list").mockResolvedValue([
        { id: "ord1", kitchenStatus: "pending", mealType: "lunch" },
      ] as any);

      const { writeBatch } = await import("firebase/firestore");
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({
        update: vi.fn(),
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.cancelOrdersForSkipDay("sub1", "c1", "2026-08-01", [
        "lunch",
      ]);

      expect(batchCommit).toHaveBeenCalled();
    });
  });

  describe("createOrderObject", () => {
    it("generates a well-formed order object with basic fallback logic", () => {
      const sub = {
        id: "sub123",
        customerId: "cust123",
        planId: "plan123",
        planTier: "standard",
        quantity: 1,
        pricePerDaySnapshot: 150,
        mealPreferences: [{ mealType: "lunch" }],
      } as any;

      const pref = { mealType: "lunch", selectedOptionId: "opt1" } as any;

      const customerMap = new Map([
        [
          "cust123",
          {
            id: "cust123",
            fullName: "John Doe",
            phone: "1234567890",
            addresses: [
              {
                id: "addr1",
                line1: "123 Main St",
                city: "Mysuru",
                pincode: "570001",
              },
            ],
            defaultAddressId: "addr1",
          },
        ],
      ]);

      const partnerMap = new Map();
      const zoneMap = new Map([
        ["zone1", { id: "zone1", name: "North", kitchenId: "k1" }],
      ]);
      const activePartners = [
        { id: "p1", isAvailable: true, zoneIds: ["zone1"], shifts: ["lunch"] },
      ] as any[];
      const allZones = [{ id: "zone1", pincodes: ["570001"] }] as any[];
      const mealPlans = [
        {
          id: "plan123",
          name: "Test Plan",
          mealSlots: [
            { mealType: "lunch", options: [{ id: "opt1", label: "Veg Meal" }] },
          ],
        },
      ] as any[];
      const workloadMap = new Map();

      const order = (orderService as any).buildOrderSnapshot(
        sub,
        pref,
        "lunch",
        "2026-08-01",
        customerMap,
        partnerMap,
        zoneMap,
        activePartners,
        allZones,
        mealPlans,
        workloadMap,
        "k1",
      );

      expect(order).toBeDefined();
      expect(order.id).toBe("ord_sub123_2026-08-01_lunch");
      expect(order.customerId).toBe("cust123");
      expect(order.customerName).toBe("John Doe");
      expect(order.zoneName).toBe("North");
      expect(order.zoneId).toBe("zone1");
      expect(order.deliveryPartnerId).toBe("p1");
      expect(order.kitchenId).toBe("k1");
      expect(order.mealName).toBe("Veg Meal");
      expect(order.price).toBe(150); // Since 150 * 1 / 1
      expect(workloadMap.get("p1")).toBe(1);
    });
  });
});
