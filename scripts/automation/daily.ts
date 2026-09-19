import './env';
import * as fs from 'fs';
import { getTodayInTimezone } from '@/shared/lib/date';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';
import { orderService } from '@/shared/services/business/orderService';
import { billingService } from '@/shared/services/business/billingService';

interface TaskMetric {
  name: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  details: string;
}

function writeGitHubStepSummary(today: string, metrics: TaskMetric[], hasErrors: boolean) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  try {
    const hasWarnings = metrics.some((m) => m.status === 'WARNING');
    const badge = hasErrors
      ? '❌ Failed'
      : hasWarnings
        ? '⚠️ Completed with Quarantined Warnings'
        : '✅ Completed Successfully';

    let md = `## 🚀 Mysuru Paakashale ERP — Daily Automation Report\n\n`;
    md += `**Execution Date (IST)**: \`${today}\`  \n`;
    md += `**Overall Status**: **${badge}**  \n\n`;
    md += `| Task | Status | Details |\n`;
    md += `| :--- | :---: | :--- |\n`;

    for (const m of metrics) {
      const statusIcon =
        m.status === 'SUCCESS' ? '✅ Success' : m.status === 'WARNING' ? '⚠️ Warning' : '❌ Failed';
      md += `| ${m.name} | ${statusIcon} | ${m.details} |\n`;
    }

    if (hasWarnings) {
      md += `\n> ℹ️ **Notice on Quarantined Items**: Quarantined items have been isolated and recorded in the \`failureQueue\` for admin resolution on the **Admin Failure Queue** dashboard, ensuring that order fulfillment and daily kitchen production are not interrupted.\n`;
    }

    fs.appendFileSync(summaryPath, md + '\n', 'utf-8');
  } catch (err) {
    console.warn('[Daily Automation] Failed to write GitHub Step Summary:', err);
  }
}

async function runDailyTasks() {
  let hasErrors = false;
  const errors: Error[] = [];
  const metrics: TaskMetric[] = [];
  let todayStr = getTodayInTimezone();
  if (process.env.TARGET_DATE) {
    const rawTarget = process.env.TARGET_DATE.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawTarget)) {
      console.error(`[Daily Automation] Invalid TARGET_DATE format: "${rawTarget}". Expected YYYY-MM-DD.`);
      process.exit(1);
    }
    todayStr = rawTarget;
    console.log(`[Daily Automation] Using manual TARGET_DATE override: ${todayStr}`);
  }

  try {
    console.log('--- Starting Daily Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Processing Daily Billing...');
    try {
      const billingRes = await billingService.processDailyBilling(todayStr);
      console.log(
        `Billing: Processed ${billingRes.processed}, Errors ${billingRes.errors}` +
        (billingRes.quarantined ? `, Quarantined ${billingRes.quarantined}` : '')
      );
      if (billingRes.quarantined && billingRes.quarantined > 0) {
        console.warn(
          `[Daily Automation] Quarantined ${billingRes.quarantined} billing failures (Logged in failureQueue for admin resolution)`
        );
      }
      if (billingRes.success === false) {
        errors.push(new Error('Daily billing failed.'));
        hasErrors = true;
        metrics.push({
          name: '💳 Daily Billing',
          status: 'FAILED',
          details: `Processed: ${billingRes.processed}, Errors: ${billingRes.errors}`,
        });
      } else {
        metrics.push({
          name: '💳 Daily Billing',
          status: billingRes.quarantined > 0 ? 'WARNING' : 'SUCCESS',
          details: `Processed: ${billingRes.processed}, Quarantined: ${billingRes.quarantined || 0}`,
        });
      }
    } catch (e) {
      console.error('Error in Daily Billing:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '💳 Daily Billing',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    console.log(`2. Processing scheduled pauses and resumes for ${todayStr}...`);
    try {
      await automationService.processScheduledPauses(todayStr);
      metrics.push({
        name: '⏸️ Pauses & Resumes',
        status: 'SUCCESS',
        details: 'Scheduled pauses and resumes updated',
      });
    } catch (e) {
      console.error('Error in Pauses/Resumes:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '⏸️ Pauses & Resumes',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    console.log(`3. Processing pending unskip requests...`);
    try {
      await automationService.processUnskipRequests();
      metrics.push({
        name: '↩️ Unskip Requests',
        status: 'SUCCESS',
        details: 'Pending unskip requests processed',
      });
    } catch (e) {
      console.error('Error in Unskip Requests:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '↩️ Unskip Requests',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    console.log(`4. Generating Orders for ${todayStr}...`);
    try {
      const orderRes = await orderService.generateDailyOrders(todayStr);
      console.log(orderRes.message);
      if (orderRes.success === false) {
        console.warn(
          `[Daily Automation] Quarantined order generation failures: ${orderRes.message} (Logged in failureQueue for admin resolution)`
        );
        metrics.push({
          name: '🍳 Today\'s Orders',
          status: 'WARNING',
          details: orderRes.message,
        });
      } else {
        const detailMsg =
          orderRes.unassignedOrders && orderRes.unassignedOrders > 0
            ? `${orderRes.message} ⚠️ (${orderRes.unassignedOrders} unassigned delivery partner)`
            : orderRes.message;
        if (orderRes.unassignedOrders && orderRes.unassignedOrders > 0) {
          console.warn(
            `[Daily Automation] ${orderRes.unassignedOrders} orders have no assigned delivery partner for ${todayStr}. Check Admin Orders page.`
          );
        }
        metrics.push({
          name: '🍳 Today\'s Orders',
          status:
            orderRes.unassignedOrders && orderRes.unassignedOrders > 0
              ? 'WARNING'
              : 'SUCCESS',
          details: detailMsg,
        });
      }
    } catch (e) {
      console.error('Error in Order Generation:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '🍳 Today\'s Orders',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    console.log(`5. Generating Daily Summary (Sales, Kitchen, Delivery) for ${todayStr}...`);
    try {
      await automationService.generateDailySummary(todayStr);
      metrics.push({
        name: '📊 Daily Summary',
        status: 'SUCCESS',
        details: `Summary generated for ${todayStr}`,
      });
    } catch (e) {
      console.error('Error in Daily Summary:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '📊 Daily Summary',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    console.log(`6. Checking for expiring subscriptions for ${todayStr}...`);
    try {
      await automationService.checkSubscriptionExpiry(todayStr);
      metrics.push({
        name: '⏳ Subscription Expiry',
        status: 'SUCCESS',
        details: 'Expiry notifications and state transitions evaluated',
      });
    } catch (e) {
      console.error('Error in Subscription Expiry:', e);
      errors.push(e as Error);
      hasErrors = true;
      metrics.push({
        name: '⏳ Subscription Expiry',
        status: 'FAILED',
        details: String((e as Error)?.message || e),
      });
    }

    writeGitHubStepSummary(todayStr, metrics, hasErrors);

    if (hasErrors) {
      console.error('--- Daily Automation Tasks Completed With Errors ---');
      errors.forEach(e => console.error(e.message || e));
      process.exit(1);
    } else {
      console.log('--- Daily Automation Tasks Completed Successfully ---');
      process.exit(0);
    }
  } catch (error) {
    console.error('Daily Automation Tasks Setup Failed:', error);
    writeGitHubStepSummary(
      todayStr,
      [{ name: '⚙️ Automation Setup', status: 'FAILED', details: String((error as Error)?.message || error) }],
      true
    );
    process.exit(1);
  }
}

runDailyTasks();
