import { failureQueueRepository, type FailureQueueRecord } from "@/shared/services/firestore/failureQueueRepository";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { orderService } from "@/shared/services/business/orderService";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import type { MealType } from "@/shared/types";

export interface FailureQueueActor {
  uid: string;
  role: string;
  name?: string;
}

export class FailureQueueService {
  async listFailures(
    filterStatus?: "pending" | "resolved" | "ignored",
  ): Promise<FailureQueueRecord[]> {
    const records = await failureQueueRepository.listAll(filterStatus);
    // Sort newest first
    return records.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
  }

  async getFailureById(id: string): Promise<FailureQueueRecord | null> {
    return failureQueueRepository.getById(id);
  }

  async retryFailure(
    failureId: string,
    actor: FailureQueueActor,
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== "admin") {
      throw new Error("Unauthorized: Only Admins can retry failure queue incidents");
    }

    const record = await failureQueueRepository.getById(failureId);
    if (!record) {
      throw new Error(`Incident ${failureId} not found`);
    }

    if (record.status === "resolved") {
      throw new Error("Incident is already marked resolved. Cannot reprocess resolved incidents.");
    }

    await failureQueueRepository.recordRetry(failureId);

    if (record.subscriptionId && record.mealType && record.date) {
      const sub = await subscriptionRepository.getById(record.subscriptionId);
      if (!sub) {
        throw new Error(`Subscription ${record.subscriptionId} not found in database`);
      }

      await orderService.generateOrdersForSubscription(
        sub,
        record.date,
        [record.mealType as MealType],
      );

      await failureQueueRepository.updateStatus(failureId, "resolved", actor.uid);

      await auditRepository.logAction(
        "failure_queue_resolved",
        actor.uid,
        actor.role,
        actor.name || "Admin",
        failureId,
        "failureQueue",
        {
          action: "retry_and_resolve",
          date: record.date,
          mealType: record.mealType,
          subscriptionId: record.subscriptionId,
          customerId: record.customerId,
        },
      );

      return {
        success: true,
        message: `Successfully regenerated ${record.mealType} order for subscription ${record.subscriptionId}.`,
      };
    }

    throw new Error("Automated retry is not supported for this incident type. Please resolve manually.");
  }

  async resolveFailure(
    failureId: string,
    actor: FailureQueueActor,
    reason?: string,
  ): Promise<void> {
    if (actor.role !== "admin") {
      throw new Error("Unauthorized: Only Admins can resolve failure queue incidents");
    }

    const record = await failureQueueRepository.getById(failureId);
    if (!record) {
      throw new Error(`Incident ${failureId} not found`);
    }

    if (record.status === "resolved") {
      throw new Error("Incident is already marked resolved.");
    }

    await failureQueueRepository.updateStatus(failureId, "resolved", actor.uid);

    await auditRepository.logAction(
      "failure_queue_resolved",
      actor.uid,
      actor.role,
      actor.name || "Admin",
      failureId,
      "failureQueue",
      {
        reason: reason || "Manual admin resolution",
        previousStatus: record.status,
        customerId: record.customerId,
        subscriptionId: record.subscriptionId,
      },
    );
  }

  async ignoreFailure(
    failureId: string,
    actor: FailureQueueActor,
    reason?: string,
  ): Promise<void> {
    if (actor.role !== "admin") {
      throw new Error("Unauthorized: Only Admins can ignore failure queue incidents");
    }

    const record = await failureQueueRepository.getById(failureId);
    if (!record) {
      throw new Error(`Incident ${failureId} not found`);
    }

    await failureQueueRepository.updateStatus(failureId, "ignored", actor.uid);

    await auditRepository.logAction(
      "failure_queue_ignored",
      actor.uid,
      actor.role,
      actor.name || "Admin",
      failureId,
      "failureQueue",
      {
        reason: reason || "Admin marked as ignored/unactionable",
        previousStatus: record.status,
        customerId: record.customerId,
        subscriptionId: record.subscriptionId,
      },
    );
  }
}

export const failureQueueService = new FailureQueueService();
