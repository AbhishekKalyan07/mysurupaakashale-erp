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

describe("Bug 2: Order Diagnostic Read-Only Verification", () => {
  let service: OrderDiagnosticService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderDiagnosticService();
    vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);
  });

  const activeSub = {
    id: "sub_active_1",
    customerId: "cust_1",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    mealPreferences: [{ mealType: "lunch" }],
  };

  it("Scenario A: diagnose() does NOT generate orders even when active subscriptions have missing orders", async () => {
    const monday = "2026-09-21";
    // 0 orders exist for this date
    vi.mocked(orderRepository.list).mockResolvedValue([]);
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") return [activeSub as any];
      return [];
    });
    vi.mocked(userRepository.getByIds).mockResolvedValue([]);

    const result = await service.diagnose(monday);

    expect(result.status).toBe("fault_detected");
    expect(result.autoHealedCount).toBe(0);
    // Crucial check: orderService.generateOrdersForSubscription must NOT be called in read-only mode!
    expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
  });

  it("Scenario B: selecting a future date in diagnose() performs ZERO writes and creates no orders", async () => {
    const futureDate = "2026-09-28";
    vi.mocked(orderRepository.list).mockResolvedValue([]);
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") return [activeSub as any];
      return [];
    });

    const result = await service.diagnose(futureDate);

    expect(result.autoHealedCount).toBe(0);
    expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
  });

  it("Scenario C: selecting a past date in diagnose() performs ZERO writes and creates no orders", async () => {
    const pastDate = "2026-09-07";
    vi.mocked(orderRepository.list).mockResolvedValue([]);
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") return [activeSub as any];
      return [];
    });

    const result = await service.diagnose(pastDate);

    expect(result.autoHealedCount).toBe(0);
    expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
  });

  it("Scenario D: existing orders remain completely untouched during diagnose()", async () => {
    const testDate = "2026-09-21";
    const existingOrder = {
      id: "ord_sub_active_1_2026-09-21_lunch",
      subscriptionId: "sub_active_1",
      customerId: "cust_1",
      date: testDate,
      mealType: "lunch",
      status: "scheduled",
    };
    vi.mocked(orderRepository.list).mockResolvedValue([existingOrder as any]);
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") return [activeSub as any];
      return [];
    });

    const result = await service.diagnose(testDate);

    expect(result.status).toBe("healthy");
    expect(result.scheduledCount).toBe(1);
    expect(result.autoHealedCount).toBe(0);
    expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
  });

  it("Scenario E: explicit autoRemediate: true generates missing orders when authorized", async () => {
    const testDate = "2026-09-21";
    vi.mocked(orderRepository.list)
      .mockResolvedValueOnce([]) // Initial check: 0 orders
      .mockResolvedValueOnce([ // Verification check: order created
        {
          id: "ord_sub_active_1_2026-09-21_lunch",
          subscriptionId: "sub_active_1",
          date: testDate,
          mealType: "lunch",
        } as any,
      ]);
    vi.mocked(subscriptionRepository.list).mockImplementation(async (...args: any[]) => {
      const q = args[0];
      if (q.value === "active") return [activeSub as any];
      return [];
    });
    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(1 as any);

    const result = await service.diagnoseAndRemediate(testDate, { autoRemediate: true });

    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
      activeSub,
      testDate,
      ["lunch"],
    );
    expect(result.autoHealedCount).toBe(1);
    expect(result.status).toBe("auto_healed");
  });
});
