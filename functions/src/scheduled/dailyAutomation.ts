import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { orderService, getTodayInTimezone } from "../orders";
import { billingService } from "../billing";
import {
  backendAutomationService,
  type ScheduledPausesResult,
  type ProcessUnskipsResult,
  type CheckExpiryResult,
} from "../services/automationService";

export interface DailyAutomationResult {
  date: string;
  stages: {
    pauses: ScheduledPausesResult;
    unskips: ProcessUnskipsResult;
    orders: { success: boolean; message: string; ordersGenerated: number };
    billing: { processed: number; errors: number };
    expiry: CheckExpiryResult;
    summary: { id: string; totalRevenue: number; totalDeliveries: number };
  };
  durationMs: number;
}

/**
 * Orchestrator function for daily automation.
 * Exported separately so it can be directly tested and invoked in tests/scripts
 * without requiring Cloud Scheduler trigger emulation.
 */
export async function runDailyAutomation(dateOverride?: string): Promise<DailyAutomationResult> {
  const startTime = Date.now();
  const today = dateOverride || getTodayInTimezone();
  logger.info(`[DailyAutomation] Starting trusted daily automation pipeline for ${today}`);

  // Stage 1: Process scheduled pauses and resumes
  // Ensures subscriptions pausing today do not generate orders, and resumed subscriptions do.
  logger.info("[DailyAutomation] Stage 1: Processing scheduled pauses and resumes...");
  const pauses = await backendAutomationService.processScheduledPauses(today);
  logger.info(
    `[DailyAutomation] Stage 1 Complete: paused ${pauses.pausedCount}, resumed ${pauses.resumedCount}, cleared ${pauses.clearedCount}`,
  );

  // Stage 2: Process pending unskip requests
  // Restores/regenerates orders for customers who submitted unskips before cutoff.
  logger.info("[DailyAutomation] Stage 2: Processing pending unskip requests...");
  const unskips = await backendAutomationService.processUnskipRequests();
  logger.info(
    `[DailyAutomation] Stage 2 Complete: processed ${unskips.processedCount}, failed ${unskips.failedCount}`,
  );

  // Stage 3: Generate daily orders
  // Generates breakfast, lunch, and dinner orders (skips Sundays and active holidays).
  logger.info("[DailyAutomation] Stage 3: Generating today's orders...");
  const orders = await orderService.generateDailyOrders(today);
  logger.info(`[DailyAutomation] Stage 3 Complete: ${orders.message}`);
  if (!orders.success) {
    logger.error(`[DailyAutomation] Daily order generation reported failure: ${orders.message}`);
    throw new Error(`Daily order generation failed: ${orders.message}`);
  }

  // Stage 4: Process daily billing
  // Closes ended subscription cycles and creates invoices idempotently.
  logger.info("[DailyAutomation] Stage 4: Processing daily billing...");
  const billing = await billingService.processDailyBilling(today);
  logger.info(
    `[DailyAutomation] Stage 4 Complete: processed ${billing.processed}, errors ${billing.errors}`,
  );
  if (billing.errors > 0) {
    logger.warn(`[DailyAutomation] Daily billing completed with ${billing.errors} error(s)`);
  }

  // Stage 5: Check subscription expiry & renewal reminders
  // Marks expired subscriptions and sends renewal reminders.
  logger.info("[DailyAutomation] Stage 5: Checking subscription expiry and renewal reminders...");
  const expiry = await backendAutomationService.checkSubscriptionExpiry(today);
  logger.info(
    `[DailyAutomation] Stage 5 Complete: expired ${expiry.expiredCount}, reminders ${expiry.remindersCount}`,
  );

  // Stage 6: Generate daily analytics summary
  // Aggregates orders, meal distribution, delivery, and payments into analytics/summary_${today}.
  logger.info("[DailyAutomation] Stage 6: Generating daily analytics summary...");
  const summary = await backendAutomationService.generateDailySummary(today);
  logger.info(`[DailyAutomation] Stage 6 Complete: Summary generated (${summary.id})`);

  const durationMs = Date.now() - startTime;
  logger.info(`[DailyAutomation] Pipeline completed successfully in ${durationMs}ms`);

  return {
    date: today,
    stages: {
      pauses,
      unskips,
      orders,
      billing,
      expiry,
      summary: {
        id: summary.id,
        totalRevenue: summary.totalRevenue,
        totalDeliveries: summary.totalDeliveries,
      },
    },
    durationMs,
  };
}

/**
 * Scheduled Cloud Function (v2):
 * Runs at 00:00 IST every day via Cloud Scheduler.
 */
export const scheduledDailyAutomation = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async (_event) => {
    await runDailyAutomation();
  },
);
