import { describe, it, expect, vi, beforeEach } from "vitest";
import { automationService } from "../automationService";
import { subscriptionRepository } from "../subscriptionRepository";

vi.mock("../subscriptionRepository", () => ({
  subscriptionRepository: {
    list: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock("../notificationService", () => ({
  notifySubscriptionExpired: vi.fn(),
  notifySubscriptionRenewalReminder: vi.fn(),
}));

describe("automationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processScheduledPauses", () => {
    it("uses dateOverride to pause an active subscription whose pauseStartDate matches", async () => {
      vi.mocked(subscriptionRepository.list).mockImplementation(async () => {
        return [
          {
            id: "sub-1",
            customerId: "cust-1",
            status: "active",
            pauseStartDate: "2026-09-20",
            pauseEndDate: "2026-09-25",
          },
        ] as any;
      });

      await automationService.processScheduledPauses("2026-09-20");

      expect(subscriptionRepository.update).toHaveBeenCalledWith("sub-1", {
        status: "paused",
      });
    });

    it("uses dateOverride to resume a paused subscription whose pauseEndDate has passed", async () => {
      vi.mocked(subscriptionRepository.list).mockImplementation(async () => {
        return [
          {
            id: "sub-2",
            customerId: "cust-2",
            status: "paused",
            pauseStartDate: "2026-09-10",
            pauseEndDate: "2026-09-19",
          },
        ] as any;
      });

      await automationService.processScheduledPauses("2026-09-20");

      expect(subscriptionRepository.update).toHaveBeenCalledWith("sub-2", {
        status: "active",
        pauseStartDate: null,
        pauseEndDate: null,
      });
    });
  });

  describe("checkSubscriptionExpiry", () => {
    it("uses dateOverride to send renewal reminders for subscriptions expiring tomorrow relative to override", async () => {
      const { notifySubscriptionRenewalReminder } = await import("../notificationService");

      vi.mocked(subscriptionRepository.list).mockResolvedValue([
        {
          id: "sub-3",
          customerId: "cust-3",
          status: "active",
          endDate: "2026-09-21",
          autoRenew: false,
        } as any,
      ]);

      // When checking on 2026-09-20, endDate 2026-09-21 is tomorrow (1 day)
      await automationService.checkSubscriptionExpiry("2026-09-20");

      expect(notifySubscriptionRenewalReminder).toHaveBeenCalledWith(
        "cust-3",
        "sub-3",
        1,
        "2026-09-21",
      );
    });
  });
});
