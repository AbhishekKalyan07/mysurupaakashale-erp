import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderService } from "../orderService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "system", role: "system" } },
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    doc: vi.fn((_db, collection, id) => ({ collection, id })),
    serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP"),
    where: vi.fn(),
  };
});

vi.mock("@/shared/services/business/operationalSettingsService", () => ({
  operationalSettingsService: {
    getOperationalSettings: vi.fn().mockResolvedValue({
      cutoffs: { breakfast: "20:00", lunch: "07:00", dinner: "14:00" },
      deliveryWindows: {
        breakfast: { start: "07:30", end: "09:00" },
        lunch: { start: "12:30", end: "14:00" },
        dinner: { start: "19:30", end: "21:00" },
      },
    }),
    getDeliveryWindowSync: vi.fn().mockReturnValue({ start: "12:30", end: "14:00" }),
    isAfterCutoff: vi.fn().mockReturnValue(false),
    getCutoffTime: vi.fn().mockReturnValue("20:00"),
  },
  DEFAULT_CUTOFFS: { breakfast: "20:00", lunch: "07:00", dinner: "14:00" },
  DEFAULT_DELIVERY_WINDOWS: {
    breakfast: { start: "07:30", end: "09:00" },
    lunch: { start: "12:30", end: "14:00" },
    dinner: { start: "19:30", end: "21:00" },
  },
}));

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    logFailure: vi.fn().mockResolvedValue("mock-failure-id"),
  },
}));

vi.mock("@/shared/services/firestore/kitchenRepository", () => ({
  kitchenRepository: {
    list: vi.fn().mockResolvedValue([{ id: "kitchen-1" }]),
    getById: vi.fn().mockResolvedValue({ id: "kitchen-1" }),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    list: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/analyticsRepository", () => ({
  orderGenerationRunRepository: {
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue("mock-run-id"),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/services/firestore/deliveryZoneRepository", () => ({
  deliveryZoneRepository: {
    list: vi.fn().mockResolvedValue([
      { id: "zone-1", name: "Zone 1", kitchenId: "kitchen-1", pincodes: ["570001"], isActive: true },
    ]),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn().mockResolvedValue("mock-audit-id"),
  },
}));

vi.mock("@/shared/services/firestore/notificationService", () => ({
  notificationService: {
    notifyOrderGeneratedCustomer: vi.fn().mockResolvedValue(undefined),
    notifyOrderGeneratedDriver: vi.fn().mockResolvedValue(undefined),
    notifyAdminAlert: vi.fn().mockResolvedValue(undefined),
  },
  notifyOrderGeneratedCustomer: vi.fn().mockResolvedValue(undefined),
  notifyOrderGeneratedDriver: vi.fn().mockResolvedValue(undefined),
  notifyDailyOrdersGenerated: vi.fn().mockResolvedValue(undefined),
  notifyAdminAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue({
      id: "cust-1",
      name: "Test Customer",
      role: "customer",
      addresses: [{ id: "addr-1", pincode: "570001" }],
    }),
    getByIds: vi.fn().mockResolvedValue([
      {
        id: "cust-1",
        name: "Test Customer",
        role: "customer",
        addresses: [{ id: "addr-1", pincode: "570001" }],
      },
    ]),
  },
}));

vi.mock("@/shared/services/firestore/customerAddressRepository", () => ({
  customerAddressRepository: {
    getById: vi.fn().mockResolvedValue({ id: "addr-1", pincode: "570001" }),
  },
}));

vi.mock("@/shared/services/firestore/holidayRepository", () => ({
  holidayRepository: {
    isHoliday: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue("mock-order-id"),
  },
}));

vi.mock("@/shared/services/firestore/mealPlanRepository", () => ({
  mealPlanRepository: {
    list: vi.fn().mockResolvedValue([
      { id: "plan-1", name: "Standard Lunch", mealTypes: ["lunch"] },
    ]),
  },
}));

vi.mock("@/shared/services/firestore/dailyMenuRepository", () => ({
  dailyMenuRepository: {
    getPublishedByDate: vi.fn().mockResolvedValue(null),
  },
}));

describe("Bug 4: Order Generation Background Task Settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSub = {
    id: "sub-bg-1",
    customerId: "cust-1",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    mealPreferences: [{ mealType: "lunch", selectedOptionId: "opt1" }],
    zoneId: "zone-1",
    kitchenId: "kitchen-1",
    deliveryAddressId: "addr-1",
  } as any;

  it("Scenario A: All background audit tasks are settled before generateMealOrders returns", async () => {
    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub]);

    const result = await (orderService as any).generateMealOrders("2026-09-20", "lunch");

    expect(result.generated).toBe(1);
    expect(auditRepository.logAction).toHaveBeenCalledWith(
      "orders_generated",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "2026-09-20_lunch",
      "system",
      expect.objectContaining({
        count: 1,
        date: "2026-09-20",
        mealType: "lunch",
      }),
    );
  });

  it("Scenario B & D: When a non-critical notification fails, orders still generate successfully", async () => {
    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub]);
    vi.mocked(auditRepository.logAction).mockRejectedValueOnce(new Error("Audit network blip"));

    // Function must not crash; background promise rejection is caught and logged
    const result = await (orderService as any).generateMealOrders("2026-09-20", "lunch");

    expect(result.generated).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("Scenario E: Unassigned orders trigger admin alert with human-readable notification message without raw ID", async () => {
    vi.mocked(subscriptionRepository.list).mockResolvedValue([
      {
        ...mockSub,
        id: "sub-uuid-abc-123",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ]);
    const { userRepository } = await import("@/shared/services/firestore/userRepository");
    vi.mocked(userRepository.list).mockImplementation(async () => {
      return [{ id: "admin-1", role: "admin" } as any];
    });
    vi.mocked(userRepository.getByIds).mockResolvedValue([
      {
        id: "cust-1",
        fullName: "Rahul Kumar",
        displayId: "MP-001",
        role: "customer",
      } as any,
    ]);

    const notifMod = await import("@/shared/services/firestore/notificationService");

    await (orderService as any).generateMealOrders("2026-10-05", "lunch");

    expect(notifMod.notifyAdminAlert).toHaveBeenCalledWith(
      ["admin-1"],
      "Delivery Assignment Failed",
      expect.stringContaining("Order for Rahul Kumar (MP-001) — Lunch on 5 Oct 2026"),
    );
    const lastCall = vi.mocked(notifMod.notifyAdminAlert).mock.calls.find(
      (call) => call[1] === "Delivery Assignment Failed",
    );
    expect(lastCall).toBeDefined();
    expect(lastCall![2]).not.toContain("ord_");
    expect(lastCall![2]).not.toContain("sub-uuid-abc-123");
  });
});
