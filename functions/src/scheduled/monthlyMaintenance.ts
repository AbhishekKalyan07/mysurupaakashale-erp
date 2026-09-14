import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {
  backendBackupService,
  type ExportDatabaseBackupResult,
} from "../services/backupService";
import {
  backendReportService,
  getPreviousMonth,
  type GenerateMonthlyExcelResult,
} from "../services/reportService";
import {
  backendCleanupService,
  type CleanupLogsResult,
} from "../services/cleanupService";

export interface MonthlyMaintenanceOptions {
  targetMonth?: string;
  timestampOverride?: string;
  retentionDays?: number;
  referenceDate?: Date;
}

export interface MonthlyMaintenanceResult {
  targetMonth: string;
  stages: {
    backup: ExportDatabaseBackupResult;
    report: GenerateMonthlyExcelResult;
    cleanup: CleanupLogsResult;
  };
  durationMs: number;
}

/**
 * Orchestrator function for monthly maintenance tasks.
 * Exported separately for direct invocation in tests without Cloud Scheduler.
 */
export async function runMonthlyMaintenance(
  options: MonthlyMaintenanceOptions = {},
): Promise<MonthlyMaintenanceResult> {
  const startTime = Date.now();

  const referenceDate = options.referenceDate || new Date();
  const targetMonth =
    options.targetMonth || getPreviousMonth(referenceDate).monthString;

  logger.info(
    `[MonthlyMaintenance] Starting monthly maintenance pipeline for report month: ${targetMonth}...`,
  );

  // Stage 1: Monthly Database Backup (JSON export of canonical collections)
  logger.info("[MonthlyMaintenance] Stage 1: Executing monthly database backup...");
  let backupResult: ExportDatabaseBackupResult;
  try {
    backupResult = await backendBackupService.exportDatabaseBackup(
      options.timestampOverride,
    );
    logger.info(
      `[MonthlyMaintenance] Stage 1 Complete: Backup uploaded to ${backupResult.destination} (${backupResult.totalDocuments} docs, ${backupResult.sizeBytes} bytes) in ${backupResult.durationMs}ms`,
    );
  } catch (err) {
    logger.error("[MonthlyMaintenance] Stage 1 Failed: Database backup failed.", err);
    throw err;
  }

  // Stage 2: Monthly Excel Report (7-sheet financial, operational, and customer report)
  logger.info(`[MonthlyMaintenance] Stage 2: Generating monthly Excel report for ${targetMonth}...`);
  let reportResult: GenerateMonthlyExcelResult;
  try {
    reportResult = await backendReportService.generateMonthlyExcel(targetMonth);
    logger.info(
      `[MonthlyMaintenance] Stage 2 Complete: Excel report uploaded to ${reportResult.destination} (${reportResult.sizeBytes} bytes) in ${reportResult.durationMs}ms`,
    );
  } catch (err) {
    logger.error("[MonthlyMaintenance] Stage 2 Failed: Monthly Excel generation failed.", err);
    throw err;
  }

  // Stage 3: 90-Day Retention Cleanup (orderGenerationRuns, analytics, auditLogs)
  const retentionDays = options.retentionDays !== undefined ? options.retentionDays : 90;
  logger.info(
    `[MonthlyMaintenance] Stage 3: Executing ${retentionDays}-day retention log cleanup...`,
  );
  let cleanupResult: CleanupLogsResult;
  try {
    cleanupResult = await backendCleanupService.cleanupOldLogs(
      retentionDays,
      referenceDate,
    );
    logger.info(
      `[MonthlyMaintenance] Stage 3 Complete: Deleted ${cleanupResult.totalDeleted} records older than ${cleanupResult.cutoffDateStr} in ${cleanupResult.durationMs}ms`,
    );
  } catch (err) {
    logger.error("[MonthlyMaintenance] Stage 3 Failed: Log cleanup failed.", err);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  logger.info(
    `[MonthlyMaintenance] Pipeline completed successfully for month ${targetMonth} in ${durationMs}ms`,
  );

  return {
    targetMonth,
    stages: {
      backup: backupResult,
      report: reportResult,
      cleanup: cleanupResult,
    },
    durationMs,
  };
}

/**
 * Scheduled Cloud Function (v2):
 * Runs at 00:00 IST on the 1st day of every month via Cloud Scheduler.
 */
export const scheduledMonthlyMaintenance = onSchedule(
  {
    schedule: "0 0 1 * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async (_event) => {
    await runMonthlyMaintenance();
  },
);
