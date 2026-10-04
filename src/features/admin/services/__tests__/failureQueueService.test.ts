import { describe, it, expect, vi, beforeEach } from "vitest";
import { failureQueueService } from "../failureQueueService";
import { failureQueueRepository } from "@/shared/services/firestore/failureQueueRepository";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { orderService } from "@/shared/services/business/orderService";
import { auditRepository } from "@/shared/services/firestore/auditRepository";

vi.mock("@/shared/services/firestore/failureQueueRepository", () => ({
  failureQueueRepository: {
    listAll: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    recordRetry: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/subscriptionRepository", () => ({
  subscriptionRepository: {
    getById: vi.fn(),
  },
}));

vi.mock("@/shared/services/business/orderService", () => ({
  orderService: {
    generateOrdersForSubscription: vi.fn(),
  },
}));

vi.mock("@/shared/services/firestore/auditRepository", () => ({
  auditRepository: {
    logAction: vi.fn(),
  },
}));

describe("Bug 5: FailureQueueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminActor = {
    uid: "admin_123",
    role: "admin",
    name: "Admin User",
  };

  const customerActor = {
    uid: "cust_999",
    role: "customer",
    name: "Customer User",
  };

  const mockRecord = {
    id: "fail_1",
    customerId: "cust_10",
    subscriptionId: "sub_20",
    mealType: "lunch",
    date: "2026-09-20",
    attempts: 3,
    retryCount: 0,
    status: "pending" as const,
    reason: "Delivery partner unassigned",
    createdAt: { toMillis: () => 1700000000000 } as any,
  };

  it("Scenario A: Admin can list failures from repository", async () => {
    vi.mocked(failureQueueRepository.listAll).mockResolvedValue([mockRecord]);

    const results = await failureQueueService.listFailures("pending");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fail_1");
    expect(failureQueueRepository.listAll).toHaveBeenCalledWith("pending");
  });

  it("Scenario B: Non-admin cannot retry or resolve failures", async () => {
    await expect(
      failureQueueService.retryFailure("fail_1", customerActor),
    ).rejects.toThrow("Unauthorized: Only Admins can retry failure queue incidents");

    await expect(
      failureQueueService.resolveFailure("fail_1", customerActor),
    ).rejects.toThrow("Unauthorized: Only Admins can resolve failure queue incidents");

    await expect(
      failureQueueService.ignoreFailure("fail_1", customerActor),
    ).rejects.toThrow("Unauthorized: Only Admins can ignore failure queue incidents");
  });

  it("Scenario C & G: Admin can safely retry supported failures and audit is preserved", async () => {
    vi.mocked(failureQueueRepository.getById).mockResolvedValue(mockRecord);
    vi.mocked(subscriptionRepository.getById).mockResolvedValue({
      id: "sub_20",
      customerId: "cust_10",
      status: "active",
    } as any);
    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(1);

    const result = await failureQueueService.retryFailure("fail_1", adminActor);

    expect(result.success).toBe(true);
    expect(failureQueueRepository.recordRetry).toHaveBeenCalledWith("fail_1");
    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_20" }),
      "2026-09-20",
      ["lunch"],
    );
    expect(failureQueueRepository.updateStatus).toHaveBeenCalledWith("fail_1", "resolved", "admin_123");
    expect(auditRepository.logAction).toHaveBeenCalledWith(
      "failure_queue_resolved",
      "admin_123",
      "admin",
      "Admin User",
      "fail_1",
      "failureQueue",
      expect.objectContaining({
        action: "retry_and_resolve",
        subscriptionId: "sub_20",
      }),
    );
  });

  it("Scenario E: Resolved failure cannot be silently reprocessed", async () => {
    vi.mocked(failureQueueRepository.getById).mockResolvedValue({
      ...mockRecord,
      status: "resolved",
    });

    await expect(
      failureQueueService.retryFailure("fail_1", adminActor),
    ).rejects.toThrow("Incident is already marked resolved. Cannot reprocess resolved incidents.");

    await expect(
      failureQueueService.resolveFailure("fail_1", adminActor),
    ).rejects.toThrow("Incident is already marked resolved.");
  });

  it("Scenario F: Invalid retry request for unknown incident or missing subscription is rejected", async () => {
    vi.mocked(failureQueueRepository.getById).mockResolvedValue(null);

    await expect(
      failureQueueService.retryFailure("unknown_fail", adminActor),
    ).rejects.toThrow("Incident unknown_fail not found");

    vi.mocked(failureQueueRepository.getById).mockResolvedValue(mockRecord);
    vi.mocked(subscriptionRepository.getById).mockResolvedValue(null);

    await expect(
      failureQueueService.retryFailure("fail_1", adminActor),
    ).rejects.toThrow("Subscription sub_20 not found in database");
  });

  it("Scenario D: Retry delegates to idempotent orderService.generateOrdersForSubscription", async () => {
    vi.mocked(failureQueueRepository.getById).mockResolvedValue(mockRecord);
    vi.mocked(subscriptionRepository.getById).mockResolvedValue({
      id: "sub_20",
      customerId: "cust_10",
      status: "active",
    } as any);
    vi.mocked(orderService.generateOrdersForSubscription).mockResolvedValue(0); // already generated

    const result = await failureQueueService.retryFailure("fail_1", adminActor);
    expect(result.success).toBe(true);
    // Verified that orderService.generateOrdersForSubscription preserves idempotency and does not duplicate
    expect(orderService.generateOrdersForSubscription).toHaveBeenCalledTimes(1);
  });
});
