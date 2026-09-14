import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {
  backendBackupService,
  type ExportDatabaseBackupResult,
} from "../services/backupService";

/**
 * Orchestrator function for weekly database backup.
 * Exported separately so it can be directly invoked and tested
 * without requiring Cloud Scheduler trigger emulation.
 */
export async function runWeeklyBackup(
  timestampOverride?: string,
): Promise<ExportDatabaseBackupResult> {
  logger.info(
    `[WeeklyBackup] Starting trusted weekly backup execution${
      timestampOverride ? ` with override: ${timestampOverride}` : ""
    }...`,
  );

  try {
    const result = await backendBackupService.exportDatabaseBackup(timestampOverride);
    logger.info(
      `[WeeklyBackup] Successfully completed weekly database backup to ${result.destination} (${result.totalDocuments} docs, ${result.sizeBytes} bytes) in ${result.durationMs}ms`,
    );
    return result;
  } catch (err) {
    logger.error("[WeeklyBackup] Weekly database backup failed:", err);
    throw err;
  }
}

/**
 * Scheduled Cloud Function (v2):
 * Runs at 00:00 IST every Sunday via Cloud Scheduler.
 */
export const scheduledWeeklyBackup = onSchedule(
  {
    schedule: "0 0 * * 0",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "256MiB",
    timeoutSeconds: 180,
  },
  async (_event) => {
    await runWeeklyBackup();
  },
);
