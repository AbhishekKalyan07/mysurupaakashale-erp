import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderDiagnosticService } from "../orderDiagnosticService";
import { orderRepository } from "../../firestore/orderRepository";
import { subscriptionRepository } from "../../firestore/subscriptionRepository";
import { holidayRepository } from "../../firestore/holidayRepository";
import { userRepository } from "../../firestore/userRepository";
import { orderService } from "../orderService";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
}));

vi.mock("@/shared/services/firestore/orderRepository", () => ({
  orderRepository: {
    list: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    list: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/holidayRepository", () => ({
  holidayRepository: {
    isHoliday: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    logFailure: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/userRepository", () => ({
  userRepository: {
    getByIds: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/deliveryZoneRepository", () => ({
  deliveryZoneRepository: {
    list: vi.fn().mockResolvedValue([
      { id: "zone-1", name: "Zone 1", kitchenId: "kitchen-1", pincodes: ["570001"], isActive: true },
    ]),
  },
}));

vi.mock("../orderService", () => ({
  orderService: {
    generateOrdersForSubscription: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  }),
  where: vi.fn((field, op, value) => ({ field, op, value })),
}));

describe("OrderDiagnosticService", () => {
  let service: OrderDiagnosticService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderDiagnosticService();
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
  });

  it("detects Sunday as a weekly holiday and skips generation", async () => {
    // 2026-09-20 is Sunday
    const result = await service.diagnoseAndRemediate("2026-09-20");

    expect(result.status).toBe("sunday_holiday");
    expect(result.summaryText).toContain("Sunday is a weekly holiday");
    expect(result.autoHealedCount).toBe(0);
    expect(orderRepository.list).not.toHaveBeenCalled();
  });

  it("detects scheduled official holidays", async () => {
    // 2026-09-21 is Monday
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(true);

    const result = await service.diagnoseAndRemediate("2026-09-21");

    expect(result.status).toBe("official_holiday");
    expect(result.summaryText).toContain("Scheduled holiday");
    expect(result.autoHealedCount).toBe(0);
  });

  it("reports when there are no active subscriptions in the system", async () => {
    // 2026-09-21 is Monday
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    vi.mocked(orderRepository.list).mockResolvedValue([]);
    vi.mocked(subscriptionRepository.list).mockResolvedValue([]);

    const result = await service.diagnoseAndRemediate("2026-09-21");

    expect(result.status).toBe("no_active_subscriptions");
    expect(result.summaryText).toContain("No active");
  });

  it("identifies paused subscriptions and customer cancellations without regenerating", async () => {
    const monday = "2026-09-21";
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);

    // One cancelled order exists
    vi.mocked(orderRepository.list).mockResolvedValue([
      {
        id: "ord_cancel_1",
        customerId: "cust_1",
        customerName: "Ramesh",
        status: "cancelled",
        mealType: "lunch",
        date: monday,
      } as any,
    ]);

    // Active sub exists but customer is paused on this date
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") {
        return [
          {
            id: "sub_1",
            customerId: "cust_1",
            status: "active",
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            pauseStartDate: "2026-09-20",
            pauseEndDate: "2026-09-25",
            mealPreferences: [{ mealType: "lunch" }],
          } as any,
        ];
      }
      return [];
    });

    vi.mocked(userRepository.getByIds).mockResolvedValue([
      { id: "cust_1", fullName: "Ramesh Kumar" } as any,
    ]);

    const result = await service.diagnoseAndRemediate(monday);

    expect(result.status).toBe("all_paused_or_skipped");
    expect(result.pausedCustomers).toHaveLength(1);
    expect(result.pausedCustomers[0].customerName).toBe("Ramesh Kumar");
    expect(result.cancelledOrders).toHaveLength(1);
    expect(result.cancelledOrders[0].orderId).toBe("ord_cancel_1");
    expect(result.autoHealedCount).toBe(0);
    expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
  });

  it("identifies future subscriptions when start date is ahead", async () => {
    const monday = "2026-09-21";
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    vi.mocked(orderRepository.list).mockResolvedValue([]);

    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") {
        return [
          {
            id: "sub_future",
            customerId: "cust_future",
            status: "active",
            startDate: "2026-10-01", // in future
            endDate: "2026-10-31",
            mealPreferences: [{ mealType: "lunch" }],
          } as any,
        ];
      }
      return [];
    });

    vi.mocked(userRepository.getByIds).mockResolvedValue([
      { id: "cust_future", fullName: "Future Subscriber" } as any,
    ]);

    const result = await service.diagnoseAndRemediate(monday);

    expect(result.status).toBe("future_only");
    expect(result.futureSubscribers).toHaveLength(1);
    expect(result.futureSubscribers[0].startDate).toBe("2026-10-01");
    expect(result.autoHealedCount).toBe(0);
  });

  it("auto-heals missing orders for valid active subscriptions", async () => {
    const monday = "2026-09-21";
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    // Zero existing orders
    vi.mocked(orderRepository.list).mockResolvedValue([]);

    // One active subscription that is valid today
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") {
        return [
          {
            id: "sub_valid",
            customerId: "cust_valid",
            status: "active",
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            mealPreferences: [{ mealType: "lunch" }, { mealType: "dinner" }],
          } as any,
        ];
      }
      return [];
    });

    vi.mocked(userRepository.getByIds).mockResolvedValue([
      { id: "cust_valid", fullName: "Valid Active Customer" } as any,
    ]);

    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(undefined as any);

    const result = await service.diagnoseAndRemediate(monday);

    expect(result.status).toBe("auto_healed");
    expect(result.autoHealedCount).toBe(2);
    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_valid" }),
      monday,
      expect.arrayContaining(["lunch", "dinner"]),
    );
  });

  it("does not treat an active subscription with stale pauseStartDate and null pauseEndDate as paused, and auto-heals orders", async () => {
    const monday = "2026-09-21";
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
    vi.mocked(orderRepository.list).mockResolvedValue([]);

    // Subscription status is "active", but has an old pauseStartDate with no pauseEndDate
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") {
        return [
          {
            id: "sub_stale_pause",
            customerId: "cust_stale",
            status: "active",
            startDate: "2026-08-01",
            endDate: "2026-10-31",
            pauseStartDate: "2026-08-10",
            pauseEndDate: null,
            mealPreferences: [{ mealType: "lunch" }],
          } as any,
        ];
      }
      return [];
    });

    vi.mocked(userRepository.getByIds).mockResolvedValue([
      { id: "cust_stale", fullName: "Stale Pause Customer" } as any,
    ]);

    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(1 as any);

    const result = await service.diagnoseAndRemediate(monday);

    expect(result.status).toBe("auto_healed");
    expect(result.pausedCustomers).toHaveLength(0);
    expect(result.autoHealedCount).toBe(1);
    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_stale_pause" }),
      monday,
      ["lunch"],
    );
  });

  it("auto-heals orders when an order exists in cancelled status and no customer skip record is found", async () => {
    const monday = "2026-09-21";
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);

    // Existing order is cancelled, but no skip record exists in customerSkips
    vi.mocked(orderRepository.list).mockResolvedValue([
      {
        id: "ord_sub_active_2026-09-21_lunch",
        subscriptionId: "sub_active",
        customerId: "cust_active",
        customerName: "Active Customer",
        status: "cancelled",
        mealType: "lunch",
        date: monday,
      } as any,
    ]);

    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") {
        return [
          {
            id: "sub_active",
            customerId: "cust_active",
            status: "active",
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            mealPreferences: [{ mealType: "lunch" }],
          } as any,
        ];
      }
      return [];
    });

    vi.mocked(userRepository.getByIds).mockResolvedValue([
      { id: "cust_active", fullName: "Active Customer" } as any,
    ]);

    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(1 as any);

    const result = await service.diagnoseAndRemediate(monday);

    // Should NOT be stuck in all_paused_or_skipped; should be auto-healed!
    expect(result.status).toBe("auto_healed");
    expect(result.autoHealedCount).toBe(1);
    expect(result.cancelledOrders).toHaveLength(0); // Healed order filtered from cancelled
    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_active" }),
      monday,
      ["lunch"],
    );
  });
});
