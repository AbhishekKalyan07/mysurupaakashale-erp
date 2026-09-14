import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";

export { Timestamp };

export interface CleanupLogsResult {
  success: boolean;
  deletedRuns: number;
  deletedAnalytics: number;
  deletedAuditLogs: number;
  totalDeleted: number;
  cutoffDateStr: string;
  durationMs: number;
}

const getAdminApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      projectId:
        process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test",
    });
  }
  return getApps()[0];
};

/**
 * Calculates cutoff date and date string for log retention in Asia/Kolkata.
 */
export function getCleanupCutoff(
  retentionDays: number = 90,
  referenceDate: Date = new Date(),
  timezone: string = "Asia/Kolkata",
): { cutoffDate: Date; cutoffDateStr: string } {
  // Use exact millisecond subtraction for retention days
  const cutoffDate = new Date(referenceDate.getTime() - retentionDays * 86400000);
  const cutoffDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(cutoffDate);

  return { cutoffDate, cutoffDateStr };
}

export class BackendCleanupService {
  getDb() {
    return getFirestore(getAdminApp());
  }

  /**
   * Cleans up logs older than retentionDays (default 90) across:
   * 1. orderGenerationRuns (date < cutoffDateStr)
   * 2. analytics (date < cutoffDateStr)
   * 3. auditLogs (timestamp < cutoffTimestamp)
   *
   * Executes batched deletions in safe chunks of up to 400 documents
   * until all matching records are removed.
   */
  async cleanupOldLogs(
    retentionDays: number = 90,
    referenceDate?: Date,
  ): Promise<CleanupLogsResult> {
    const startTime = Date.now();
    const { cutoffDate, cutoffDateStr } = getCleanupCutoff(
      retentionDays,
      referenceDate || new Date(),
    );
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

    logger.info(
      `[cleanupService] Starting 90-day retention cleanup (cutoff: ${cutoffDateStr})...`,
    );

    const db = this.getDb();
    const BATCH_SIZE = 400;

    // Helper to delete a collection in batches using a given query constraint
    const deleteMatchingDocsInBatches = async (
      collectionName: string,
      field: string,
      op: "<",
      value: any,
    ): Promise<number> => {
      let totalDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        const snap = await db
          .collection(collectionName)
          .where(field, op, value)
          .limit(BATCH_SIZE)
          .get();

        if (snap.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        snap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
        totalDeleted += snap.docs.length;

        logger.info(
          `[cleanupService] Deleted batch of ${snap.docs.length} records from ${collectionName} (cumulative: ${totalDeleted}).`,
        );

        if (snap.docs.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      return totalDeleted;
    };

    try {
      // 1. Clean orderGenerationRuns
      logger.info("[cleanupService] Cleaning orderGenerationRuns...");
      const deletedRuns = await deleteMatchingDocsInBatches(
        "orderGenerationRuns",
        "date",
        "<",
        cutoffDateStr,
      );

      // 2. Clean analytics
      logger.info("[cleanupService] Cleaning analytics summaries...");
      const deletedAnalytics = await deleteMatchingDocsInBatches(
        "analytics",
        "date",
        "<",
        cutoffDateStr,
      );

      // 3. Clean auditLogs
      logger.info("[cleanupService] Cleaning auditLogs...");
      const deletedAuditLogs = await deleteMatchingDocsInBatches(
        "auditLogs",
        "timestamp",
        "<",
        cutoffTimestamp,
      );

      const totalDeleted = deletedRuns + deletedAnalytics + deletedAuditLogs;
      const durationMs = Date.now() - startTime;

      logger.info(
        `[cleanupService] Retention cleanup complete in ${durationMs}ms: deleted ${deletedRuns} runs, ${deletedAnalytics} analytics, ${deletedAuditLogs} audit logs (total: ${totalDeleted}).`,
      );

      return {
        success: true,
        deletedRuns,
        deletedAnalytics,
        deletedAuditLogs,
        totalDeleted,
        cutoffDateStr,
        durationMs,
      };
    } catch (err) {
      logger.error("[cleanupService] Log cleanup failed:", err);
      throw err;
    }
  }
}

export const backendCleanupService = new BackendCleanupService();
