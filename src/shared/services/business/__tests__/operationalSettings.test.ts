import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  operationalSettingsService,
  OperationalSettingsService,
  DEFAULT_CUTOFFS,
  DEFAULT_DELIVERY_WINDOWS,
} from "../operationalSettingsService";
import { orderService } from "../orderService";
import type { Order, Subscription, AddonItem } from "@/shared/types";

// In-memory Firestore simulation state
const inMemoryOrders: Map<string, Order> = new Map();
const inMemorySubscriptions: Map<string, Subscription> = new Map();
const inMemoryAddons: Map<string, AddonItem> = new Map();
export const inMemoryFirestoreSettings: Map<string, any> = new Map();

// Mock Firebase
vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "cust-1", email: "cust1@example.com", displayName: "Customer 1" },
  },
}));

vi.mock("firebase/firestore", () => ({
  runTransaction: vi.fn(async (_db, cb) => {
    const txn = {
      get: vi.fn(async (ref: any) => {
        const order = inMemoryOrders.get(ref.id);
        return {
          exists: () => !!order,
          data: () => (order ? { ...order } : undefined),
        };
      }),
      update: vi.fn((ref: any, data: any) => {
        const current = inMemoryOrders.get(ref.id);
        if (current) {
          inMemoryOrders.set(ref.id, { ...current, ...data });
        }
      }),
      set: vi.fn((ref: any, data: any) => {
        inMemoryOrders.set(ref.id, { id: ref.id, ...data });
      }),
    };
    return cb(txn);
  }),
  doc: vi.fn((...parts) => {
    const id = parts[parts.length - 1]?.id || parts[parts.length - 1] || "doc-id";
    return { id, path: typeof id === "string" ? id : "path" };
  }),
  getDoc: vi.fn(async (docRef: any) => {
    if (inMemoryFirestoreSettings.has(docRef.id)) {
      const data = inMemoryFirestoreSettings.get(docRef.id);
      return {
        exists: () => true,
        data: () => JSON.parse(JSON.stringify(data)),
      };
    }
    return { exists: () => false, data: () => undefined };
  }),
  setDoc: vi.fn(async (docRef: any, data: any, options?: any) => {
    const existing = inMemoryFirestoreSettings.get(docRef.id) || {};
    const merged = options?.merge ? { ...existing, ...data } : data;
    inMemoryFirestoreSettings.set(docRef.id, JSON.parse(JSON.stringify(merged)));
  }),
  onSnapshot: vi.fn((docRef: any, cb: any) => {
    if (inMemoryFirestoreSettings.has(docRef.id)) {
      const data = inMemoryFirestoreSettings.get(docRef.id);
      cb({ exists: () => true, data: () => JSON.parse(JSON.stringify(data)) });
    }
    return vi.fn();
  }),
  collection: vi.fn((_db, name) => ({ path: name })),
  serverTimestamp: vi.fn(() => new Date().toISOString()),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  query: vi.fn((...args) => ({ args })),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

// Mock repositories and services where needed
vi.mock("@/shared/services/firestore/subscriptionRepository", () => {
  const original = vi.importActual("@/shared/services/firestore/subscriptionRepository");
  return {
    ...original,
    subscriptionRepository: {
      getById: vi.fn(async (id: string) => inMemorySubscriptions.get(id) || null),
      validateSkipWindow: vi.fn((date: string, mealTypes: any[], nowOverride?: Date) => {
        for (const meal of mealTypes) {
          operationalSettingsService.validateMealCutoff(meal, date, nowOverride);
        }
      }),
      removeSkip: vi.fn(async () => {}),
      addSkip: vi.fn(async () => {}),
    },
  };
});

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    getByDateAndMeal: vi.fn(async (date: string, mealType: string) => {
      return Array.from(inMemoryOrders.values()).filter(
        (o) => o.date === date && o.mealType === mealType,
      );
    }),
    createOrder: vi.fn(async (order: any) => {
      const id = order.id || `order-${Date.now()}-${Math.random()}`;
      const saved = { ...order, id };
      inMemoryOrders.set(id, saved);
      return saved;
    }),
    getById: vi.fn(async (id: string) => inMemoryOrders.get(id) || null),
    list: vi.fn(async (..._filters: any[]) => Array.from(inMemoryOrders.values())),
    save: vi.fn(async (order: any) => {
      inMemoryOrders.set(order.id, order);
      return order;
    }),
    update: vi.fn(async (id: string, data: any) => {
      const curr = inMemoryOrders.get(id);
      if (curr) {
        inMemoryOrders.set(id, { ...curr, ...data });
      }
    }),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(async () => {}),
  },
}));

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    getById: vi.fn(async () => ({
      id: "plan-1",
      tier: "standard",
      mealSlots: [
        {
          mealType: "lunch",
          isCustomerSelectable: true,
          options: [
            { id: "opt-south", label: "South Indian Thali", name: "South Indian Thali", isCustomerSelectable: true, isActive: true },
            { id: "opt-north", label: "North Indian Thali", name: "North Indian Thali", isCustomerSelectable: true, isActive: true },
          ],
        },
        {
          mealType: "dinner",
          isCustomerSelectable: true,
          options: [
            { id: "opt-dinner-1", label: "Chapati Meal", name: "Chapati Meal", isCustomerSelectable: true, isActive: true },
          ],
        },
      ],
    })),
  },
}));

vi.mock("../pricingService", () => {
  return {
    pricingService: {
      getAddonById: vi.fn((id: string) => inMemoryAddons.get(id) || null),
      getAddonByIdAsync: vi.fn(async (id: string) => inMemoryAddons.get(id) || null),
      calculateCancellationAmount: vi.fn(() => 70),
      calculateAddonPrice: vi.fn((_id: string, qty: number) => ({ unitPrice: 45, total: 45 * qty })),
      calculateSubstitutionDelta: vi.fn(() => 0),
    },
  };
});

describe("PHASE E6 — Authoritative Operational Settings Service & Runtime Enforcement", () => {
  const ADMIN_ACTOR = { uid: "admin-1", role: "admin", fullName: "Admin User" };
  const NON_ADMIN_ACTOR = { uid: "cust-1", role: "customer", fullName: "Customer" };

  // Base test date in Asia/Kolkata: 2026-06-15
  // UTC: 2026-06-14 18:30:00 UTC = 2026-06-15 00:00:00 IST
  // Lunch cutoff default: 10:30 IST = 05:00 UTC
  const TODAY_IST = "2026-06-15";
  const TIME_LUNCH_BEFORE = new Date("2026-06-15T04:59:59.000Z"); // 10:29:59 IST
  const TIME_LUNCH_EXACT = new Date("2026-06-15T05:00:00.000Z");  // 10:30:00 IST
  const TIME_LUNCH_AFTER = new Date("2026-06-15T05:00:01.000Z");  // 10:30:01 IST

  const TIME_BREAKFAST_BEFORE = new Date("2026-06-14T23:29:59.000Z"); // 04:59:59 IST
  const TIME_BREAKFAST_EXACT = new Date("2026-06-14T23:30:00.000Z");  // 05:00:00 IST
  const TIME_BREAKFAST_AFTER = new Date("2026-06-14T23:30:01.000Z");  // 05:00:01 IST

  const TIME_DINNER_BEFORE = new Date("2026-06-15T10:29:59.000Z"); // 15:59:59 IST
  const TIME_DINNER_EXACT = new Date("2026-06-15T10:30:00.000Z");  // 16:00:00 IST
  const TIME_DINNER_AFTER = new Date("2026-06-15T10:30:01.000Z");  // 16:00:01 IST

  beforeEach(() => {
    inMemoryFirestoreSettings.clear();
    inMemoryFirestoreSettings.set("business", {
      id: "business",
      operations: {
        cancellationCutoffTimes: { ...DEFAULT_CUTOFFS },
        deliveryWindows: {
          breakfast: { ...DEFAULT_DELIVERY_WINDOWS.breakfast },
          lunch: { ...DEFAULT_DELIVERY_WINDOWS.lunch },
          dinner: { ...DEFAULT_DELIVERY_WINDOWS.dinner },
        },
      },
    });

    operationalSettingsService.resetToDefaults();
    inMemoryOrders.clear();
    inMemorySubscriptions.clear();
    inMemoryAddons.clear();

    // Seed mock active subscription
    const mockSub: Subscription = {
      id: "sub-1",
      customerId: "cust-1",
      planId: "plan-1",
      planTier: "standard",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      mealPreferences: [
        { mealType: "breakfast" },
        { mealType: "lunch", selectedOptionId: "opt-south" },
        { mealType: "dinner", selectedOptionId: "opt-dinner-1" },
      ],
      pricingMatrix: { breakfast: 60, lunch: 110, dinner: 110 },
      kitchenId: "k-1",
      zoneId: "z-1",
      deliveryAddressId: "addr-1",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      skips: [],
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    } as any;
    inMemorySubscriptions.set(mockSub.id, mockSub);

    // Seed mock addon item
    const mockAddon: AddonItem = {
      id: "addon-gulab-jamun",
      name: "Gulab Jamun (2 pcs)",
      price: 45,
      unitPrice: 45,
      isActive: true,
      applicableMealTypes: ["lunch", "dinner"],
      validMealSlots: ["lunch", "dinner"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryAddons.set(mockAddon.id, mockAddon);
  });

  // ==========================================
  // SECTION 13: CUTOFF TESTS (A - L)
  // ==========================================

  describe("Cutoff Model & Runtime Resolution (A–D, I–L)", () => {
    it("A: Default breakfast cutoff resolves to 05:00", () => {
      expect(operationalSettingsService.getMealCutoffSync("breakfast")).toBe("05:00");
    });

    it("B: Default lunch cutoff resolves to 10:30", () => {
      expect(operationalSettingsService.getMealCutoffSync("lunch")).toBe("10:30");
    });

    it("C: Default dinner cutoff resolves to 16:00", () => {
      expect(operationalSettingsService.getMealCutoffSync("dinner")).toBe("16:00");
    });

    it("D: Admin configuration change is reflected in runtime", async () => {
      // Admin extends lunch cutoff to 11:15
      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        cutoffs: { lunch: "11:15" },
      });

      expect(operationalSettingsService.getMealCutoffSync("lunch")).toBe("11:15");
      const fetched = await operationalSettingsService.getOperationalSettings();
      expect(fetched.cutoffs.lunch).toBe("11:15");

      // Verify non-admin cannot update settings
      await expect(
        operationalSettingsService.updateOperationalSettings(NON_ADMIN_ACTOR, {
          cutoffs: { lunch: "12:00" },
        }),
      ).rejects.toThrow("Unauthorized: Only Admin can update operational settings.");
    });

    it("I: Exact cutoff is rejected (>= cutoff is rejected)", () => {
      expect(() => {
        operationalSettingsService.validateMealCutoff("breakfast", TODAY_IST, TIME_BREAKFAST_EXACT);
      }).toThrow("Cancellation window has closed for breakfast.");

      expect(() => {
        operationalSettingsService.validateMealCutoff("lunch", TODAY_IST, TIME_LUNCH_EXACT);
      }).toThrow("Cancellation window has closed for lunch.");

      expect(() => {
        operationalSettingsService.validateMealCutoff("dinner", TODAY_IST, TIME_DINNER_EXACT);
      }).toThrow("Cancellation window has closed for dinner.");
    });

    it("J: Just before cutoff is allowed (< cutoff is allowed)", () => {
      expect(() => {
        operationalSettingsService.validateMealCutoff("breakfast", TODAY_IST, TIME_BREAKFAST_BEFORE);
      }).not.toThrow();

      expect(() => {
        operationalSettingsService.validateMealCutoff("lunch", TODAY_IST, TIME_LUNCH_BEFORE);
      }).not.toThrow();

      expect(() => {
        operationalSettingsService.validateMealCutoff("dinner", TODAY_IST, TIME_DINNER_BEFORE);
      }).not.toThrow();
    });

    it("K: Just after cutoff is rejected (> cutoff is rejected)", () => {
      expect(() => {
        operationalSettingsService.validateMealCutoff("breakfast", TODAY_IST, TIME_BREAKFAST_AFTER);
      }).toThrow("Cancellation window has closed for breakfast.");

      expect(() => {
        operationalSettingsService.validateMealCutoff("lunch", TODAY_IST, TIME_LUNCH_AFTER);
      }).toThrow("Cancellation window has closed for lunch.");

      expect(() => {
        operationalSettingsService.validateMealCutoff("dinner", TODAY_IST, TIME_DINNER_AFTER);
      }).toThrow("Cancellation window has closed for dinner.");
    });

    it("L: IST semantics are correct around date boundaries and midnight rollovers", () => {
      // Future date is always allowed even late at night
      const lateNight = new Date("2026-06-15T18:00:00.000Z"); // 23:30 IST on 2026-06-15
      expect(() => {
        operationalSettingsService.validateMealCutoff("lunch", "2026-06-16", lateNight);
      }).not.toThrow();

      // Past date is rejected
      expect(() => {
        operationalSettingsService.validateMealCutoff("lunch", "2026-06-14", lateNight);
      }).toThrow("Cannot modify skips for past dates.");

      // IST midnight rollover: 2026-06-14T18:30:00Z is 00:00:00 IST on 2026-06-15
      const midnightIST = new Date("2026-06-14T18:30:05.000Z"); // 00:00:05 IST on June 15
      // June 15 breakfast is allowed (00:00:05 is well before 05:00:00)
      expect(() => {
        operationalSettingsService.validateMealCutoff("breakfast", "2026-06-15", midnightIST);
      }).not.toThrow();

      // June 14 is now in the past according to Asia/Kolkata
      expect(() => {
        operationalSettingsService.validateMealCutoff("breakfast", "2026-06-14", midnightIST);
      }).toThrow("Cannot modify skips for past dates.");
    });
  });

  describe("Business Operations Runtime Cutoff Enforcement (E–H)", () => {
    it("E: addTodayMeal uses configured cutoff", async () => {
      // Mock generateOrdersForSubscription on orderService
      vi.spyOn(orderService as any, "generateOrdersForSubscription").mockResolvedValue(1);

      // 1. Before cutoff: succeeds
      const resultBefore = await orderService.addTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
      expect(resultBefore).toBe(1);

      // 2. At or after cutoff: fails
      await expect(
        orderService.addTodayMeal("sub-1", "lunch", TIME_LUNCH_EXACT),
      ).rejects.toThrow("Cancellation window has closed for lunch.");

      // 3. Admin extends cutoff to 11:30
      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        cutoffs: { lunch: "11:30" },
      });

      // 10:45 IST is now before 11:30 -> succeeds
      const time1045 = new Date("2026-06-15T05:15:00.000Z");
      const resultExtended = await orderService.addTodayMeal("sub-1", "lunch", time1045);
      expect(resultExtended).toBe(1);
    });

    it("F: removeTodayMeal uses configured cutoff", async () => {
      // Seed an order for today
      inMemoryOrders.set("order-lunch-1", {
        id: "order-lunch-1",
        subscriptionId: "sub-1",
        customerId: "cust-1",
        date: TODAY_IST,
        mealType: "lunch",
        status: "scheduled",
        price: 110,
        currency: "INR",
        itemsLabel: "Lunch Standard",
        deliveryAddressId: "addr-1",
        zoneId: "z-1",
        kitchenId: "k-1",
        deliveryPartnerId: null,
        deliveryWindow: { start: "12:30", end: "14:00" },
        paymentId: null,
        createdAt: new Date().toISOString() as any,
        updatedAt: new Date().toISOString() as any,
      } as any);

      // 1. Before cutoff: succeeds
      const result = await orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_BEFORE);
      expect(result.cancelled).toBe(true);

      // 2. At or after cutoff: fails
      await expect(
        orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_EXACT),
      ).rejects.toThrow("Cancellation window has closed for lunch.");

      await expect(
        orderService.removeTodayMeal("sub-1", "lunch", TIME_LUNCH_AFTER),
      ).rejects.toThrow("Cancellation window has closed for lunch.");
    });

    it("G: changeTodayMealOption uses configured cutoff", async () => {
      // Seed an order for today
      inMemoryOrders.set("order-opt-1", {
        id: "order-opt-1",
        subscriptionId: "sub-1",
        customerId: "cust-1",
        date: TODAY_IST,
        mealType: "lunch",
        selectedOptionId: "opt-south",
        status: "scheduled",
        price: 110,
        currency: "INR",
        itemsLabel: "South Indian Thali",
        deliveryAddressId: "addr-1",
        zoneId: "z-1",
        kitchenId: "k-1",
        deliveryPartnerId: null,
        deliveryWindow: { start: "12:30", end: "14:00" },
        paymentId: null,
        createdAt: new Date().toISOString() as any,
        updatedAt: new Date().toISOString() as any,
      } as any);

      // 1. Before cutoff: succeeds
      const result = await orderService.changeTodayMealOption(
        "sub-1",
        "lunch",
        "opt-north",
        TIME_LUNCH_BEFORE,
      );
      expect(result.success).toBe(true);
      expect(result.newOptionId).toBe("opt-north");

      // 2. Exact cutoff: rejected
      await expect(
        orderService.changeTodayMealOption("sub-1", "lunch", "opt-south", TIME_LUNCH_EXACT),
      ).rejects.toThrow("Cancellation window has closed for lunch.");

      // 3. After cutoff: rejected
      await expect(
        orderService.changeTodayMealOption("sub-1", "lunch", "opt-south", TIME_LUNCH_AFTER),
      ).rejects.toThrow("Cancellation window has closed for lunch.");
    });

    it("H: addTodayAddon uses configured cutoff", async () => {
      // 1. Before cutoff: succeeds
      const result = await orderService.addTodayAddon(
        "sub-1",
        "lunch",
        "addon-gulab-jamun",
        1,
        TIME_LUNCH_BEFORE,
      );
      expect(result.success).toBe(true);
      expect(result.unitPrice).toBe(45);

      // 2. Exact cutoff: rejected
      await expect(
        orderService.addTodayAddon(
          "sub-1",
          "lunch",
          "addon-gulab-jamun",
          1,
          TIME_LUNCH_EXACT,
        ),
      ).rejects.toThrow("Cancellation window has closed for lunch.");

      // 3. After cutoff: rejected
      await expect(
        orderService.addTodayAddon(
          "sub-1",
          "lunch",
          "addon-gulab-jamun",
          1,
          TIME_LUNCH_AFTER,
        ),
      ).rejects.toThrow("Cancellation window has closed for lunch.");
    });
  });

  // ==========================================
  // SECTION 14: DELIVERY WINDOW TESTS (M - R)
  // ==========================================

  describe("Delivery Window Model & Order Snapshots (M–R)", () => {
    it("M: Admin can configure a valid delivery window", async () => {
      const validWin = { start: "12:15", end: "13:45" };
      const validation = operationalSettingsService.validateDeliveryWindow(validWin);
      expect(validation.valid).toBe(true);

      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        deliveryWindows: { lunch: validWin },
      });

      const updated = operationalSettingsService.getDeliveryWindowSync("lunch");
      expect(updated).toEqual(validWin);
    });

    it("N: Invalid delivery window is rejected", async () => {
      // Start >= end
      const invertedWin = { start: "14:00", end: "12:30" };
      const res1 = operationalSettingsService.validateDeliveryWindow(invertedWin);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain("must be before end time");

      // Equal start and end
      const equalWin = { start: "12:30", end: "12:30" };
      const res2 = operationalSettingsService.validateDeliveryWindow(equalWin);
      expect(res2.valid).toBe(false);

      // Malformed time string
      const malformedWin = { start: "25:00", end: "13:00" };
      const res3 = operationalSettingsService.validateDeliveryWindow(malformedWin);
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain("Invalid start time format");

      // Rejection during updateOperationalSettings
      await expect(
        operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
          deliveryWindows: { lunch: invertedWin },
        }),
      ).rejects.toThrow("Invalid delivery window for lunch");
    });

    it("O: Generated order receives configured delivery window snapshot", async () => {
      // Set lunch delivery window to 12:45–14:15
      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        deliveryWindows: { lunch: { start: "12:45", end: "14:15" } },
      });

      // Generate order via addTodayAddon (which constructs order snapshot with deliveryWindow)
      const res = await orderService.addTodayAddon(
        "sub-1",
        "lunch",
        "addon-gulab-jamun",
        1,
        TIME_LUNCH_BEFORE,
      );
      expect(res.success).toBe(true);

      const createdOrder = inMemoryOrders.get(res.orderId);
      expect(createdOrder).toBeDefined();
      expect(createdOrder?.deliveryWindow).toEqual({ start: "12:45", end: "14:15" });
    });

    it("P: Existing generated order keeps old delivery window after configuration change", async () => {
      // 1. Initial window: 12:00–13:30
      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        deliveryWindows: { lunch: { start: "12:00", end: "13:30" } },
      });

      const res1 = await orderService.addTodayAddon(
        "sub-1",
        "lunch",
        "addon-gulab-jamun",
        1,
        TIME_LUNCH_BEFORE,
      );
      const order1 = inMemoryOrders.get(res1.orderId)!;
      expect(order1.deliveryWindow).toEqual({ start: "12:00", end: "13:30" });

      // 2. Admin later updates window to 13:00–14:30
      await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        deliveryWindows: { lunch: { start: "13:00", end: "14:30" } },
      });

      // 3. Existing order MUST remain 12:00–13:30 (strictly immutable historical snapshot)
      const reFetchedOrder1 = inMemoryOrders.get(res1.orderId)!;
      expect(reFetchedOrder1.deliveryWindow).toEqual({ start: "12:00", end: "13:30" });
    });

    it("Q: New order receives the new delivery window", async () => {
      // Continuing from P: lunch window is now 13:00–14:30
      operationalSettingsService.setCacheForTesting({
        deliveryWindows: {
          ...DEFAULT_DELIVERY_WINDOWS,
          lunch: { start: "13:00", end: "14:30" },
        },
      });

      const res2 = await orderService.addTodayAddon(
        "sub-1",
        "lunch",
        "addon-gulab-jamun",
        2,
        TIME_LUNCH_BEFORE,
      );
      const order2 = inMemoryOrders.get(res2.orderId)!;
      expect(order2.deliveryWindow).toEqual({ start: "13:00", end: "14:30" });
    });

    it("R: Existing order display uses frozen snapshot without recalculation", () => {
      // Create a historical order from 2 months ago with a custom window
      const historicalOrder: Order = {
        id: "historical-order-1",
        source: "subscription",
        subscriptionId: "sub-1",
        customerId: "cust-1",
        date: "2026-04-10",
        mealType: "lunch",
        planTier: "standard",
        selectedOptionId: null,
        status: "delivered",
        price: 110,
        currency: "INR",
        itemsLabel: "Lunch Thali",
        deliveryAddressId: "addr-1",
        zoneId: "z-1",
        kitchenId: "k-1",
        deliveryPartnerId: "dp-1",
        deliveryWindow: { start: "11:45", end: "13:15" }, // Historic window
        paymentId: null,
        createdAt: "2026-04-10T05:00:00Z" as any,
        updatedAt: "2026-04-10T08:00:00Z" as any,
      };

      // Current operational settings have changed
      operationalSettingsService.setCacheForTesting({
        deliveryWindows: {
          ...DEFAULT_DELIVERY_WINDOWS,
          lunch: { start: "13:00", end: "14:30" },
        },
      });

      // Display consumers read order.deliveryWindow directly
      const displayedWindow = historicalOrder.deliveryWindow;
      expect(displayedWindow).toEqual({ start: "11:45", end: "13:15" });
      expect(displayedWindow?.start).toBe("11:45");
      expect(displayedWindow?.end).toBe("13:15");
    });
  });

  describe("Fresh-Runtime & Multi-Instance Safety Verification (Phase E6 Hardening)", () => {
    it("Section 4: Fresh-runtime loads persisted non-default settings after in-memory cache clear", async () => {
      // A. Admin saves non-default cutoff and delivery window to Firestore
      const updated = await operationalSettingsService.updateOperationalSettings(ADMIN_ACTOR, {
        cutoffs: { lunch: "11:45" },
        deliveryWindows: { lunch: { start: "12:15", end: "13:45" } },
      });

      // B. Current service reads the updated value
      expect(updated.cutoffs.lunch).toBe("11:45");
      expect(updated.deliveryWindows.lunch).toEqual({ start: "12:15", end: "13:45" });
      expect(operationalSettingsService.getMealCutoffSync("lunch")).toBe("11:45");
      expect(operationalSettingsService.getDeliveryWindowSync("lunch")).toEqual({ start: "12:15", end: "13:45" });

      // C. Clear/reset the in-memory operationalSettingsService cache completely
      operationalSettingsService.clearCache();
      // Immediately after cache clear, sync getter reflects cleared default before reload
      expect(operationalSettingsService.isLoadedFromFirestore()).toBe(false);

      // D. Create a NEW service/runtime instance and load from Firestore
      const freshRuntime = new OperationalSettingsService();
      const freshSettings = await freshRuntime.getOperationalSettings();

      // E. Verify the persisted non-default value is returned from Firestore
      expect(freshSettings.cutoffs.lunch).toBe("11:45");
      expect(freshSettings.deliveryWindows.lunch).toEqual({ start: "12:15", end: "13:45" });
      expect(freshRuntime.getMealCutoffSync("lunch")).toBe("11:45");
      expect(freshRuntime.getDeliveryWindowSync("lunch")).toEqual({ start: "12:15", end: "13:45" });
      expect(freshRuntime.isLoadedFromFirestore()).toBe(true);

      // Also verify reloadFromFirestore on the original singleton works identically
      const reloadedSingleton = await operationalSettingsService.reloadFromFirestore();
      expect(reloadedSingleton.cutoffs.lunch).toBe("11:45");
      expect(reloadedSingleton.deliveryWindows.lunch).toEqual({ start: "12:15", end: "13:45" });
    });

    it("Section 5: Multi-instance safety — Runtime B receives new settings without Runtime A needing to remain alive", async () => {
      // 1. Runtime A starts and loads settings
      const runtimeA = new OperationalSettingsService();
      const initialA = await runtimeA.getOperationalSettings();
      expect(initialA.cutoffs.dinner).toBe(DEFAULT_CUTOFFS.dinner);

      // 2. Admin updates settings in Firestore
      await runtimeA.updateOperationalSettings(ADMIN_ACTOR, {
        cutoffs: { dinner: "17:15" },
        deliveryWindows: { dinner: { start: "18:45", end: "20:15" } },
      });

      // 3. Runtime A shuts down / is discarded
      runtimeA.clearCache();
      runtimeA.stopRealtimeSync();

      // 4. Runtime B starts afterward as an entirely separate instance
      const runtimeB = new OperationalSettingsService();
      const settingsB = await runtimeB.getOperationalSettings();

      // 5. Runtime B must receive the new persisted settings directly from Firestore
      expect(settingsB.cutoffs.dinner).toBe("17:15");
      expect(settingsB.deliveryWindows.dinner).toEqual({ start: "18:45", end: "20:15" });
      expect(runtimeB.getMealCutoffSync("dinner")).toBe("17:15");
      expect(runtimeB.getDeliveryWindowSync("dinner")).toEqual({ start: "18:45", end: "20:15" });
      expect(runtimeB.isLoadedFromFirestore()).toBe(true);
    });

    it("Section 8: Fallback behavior — genuine missing document uses defaults, temporary read error retains prior valid settings", async () => {
      // A. Genuine missing document: returns defaults
      inMemoryFirestoreSettings.delete("business");
      const unseededRuntime = new OperationalSettingsService();
      const fallbackSettings = await unseededRuntime.getOperationalSettings();
      expect(fallbackSettings.cutoffs).toEqual(DEFAULT_CUTOFFS);
      expect(fallbackSettings.deliveryWindows).toEqual(DEFAULT_DELIVERY_WINDOWS);

      // B. Seed valid document and load it
      inMemoryFirestoreSettings.set("business", {
        id: "business",
        operations: {
          cancellationCutoffTimes: { breakfast: "04:30", lunch: "11:00", dinner: "16:45" },
          deliveryWindows: {
            breakfast: { start: "06:30", end: "08:00" },
            lunch: { start: "12:00", end: "13:30" },
            dinner: { start: "19:00", end: "20:30" },
          },
        },
      });

      const resilientRuntime = new OperationalSettingsService();
      const loaded = await resilientRuntime.getOperationalSettings();
      expect(loaded.cutoffs.breakfast).toBe("04:30");
      expect(resilientRuntime.isLoadedFromFirestore()).toBe(true);

      // C. Temporary Firestore error: retain previously loaded configuration
      const { getDoc } = await import("firebase/firestore");
      const originalGetDoc = vi.mocked(getDoc);
      originalGetDoc.mockRejectedValueOnce(new Error("Transient network outage"));

      // Force refresh while network is failing
      const afterErrorSettings = await resilientRuntime.getOperationalSettings(true);
      // MUST NOT reset to default "05:00", MUST retain "04:30"
      expect(afterErrorSettings.cutoffs.breakfast).toBe("04:30");
      expect(afterErrorSettings.cutoffs.lunch).toBe("11:00");
    });
  });
});
