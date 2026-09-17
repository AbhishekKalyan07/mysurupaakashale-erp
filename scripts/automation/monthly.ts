// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTodayInTimezone } from '@/shared/lib/date';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';

function writeGitHubStepSummary(data: {
  todayStr: string;
  targetMonth: string;
  backupFilename: string;
  backupSizeKb: string;
  backupDocs: number;
  excelFilename: string;
  excelSizeKb: string;
  receiptsFilename: string;
  receiptsCount: number;
  receiptsSizeKb: string;
  prunedScreenshots: number;
  success: boolean;
  errorMessage?: string;
}) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  try {
    const badge = data.success ? '✅ Completed Successfully' : '❌ Failed';
    let md = `## 🗓️ Mysuru Paakashale ERP — Monthly Maintenance Report\n\n`;
    md += `**Execution Date (IST)**: \`${data.todayStr}\`  \n`;
    md += `**Target Reporting Month**: \`${data.targetMonth}\`  \n`;
    md += `**Overall Status**: **${badge}**  \n\n`;
    md += `| Category | Metric | Details |\n`;
    md += `| :--- | :--- | :--- |\n`;
    md += `| 🗄️ **Database Backup** | Archive Snapshot | \`${data.backupFilename}\` (${data.backupSizeKb} KB, ${data.backupDocs.toLocaleString()} documents) |\n`;
    md += `| 📊 **Excel Accounting Export** | Workbook File | \`${data.excelFilename}\` (${data.excelSizeKb} KB) |\n`;
    md += `| 🧾 **Payment Receipts Archive** | ZIP Package | \`${data.receiptsFilename}\` (${data.receiptsCount} receipts, ${data.receiptsSizeKb} KB) |\n`;
    md += `| 🧹 **Data Pruning (90+ Days)** | Screenshots Cleaned | ${data.prunedScreenshots.toLocaleString()} verified/rejected images pruned |\n`;
    md += `| 📜 **Audit & System Logs** | Retention Maintenance | Logs older than 90 days pruned from Firestore |\n`;

    if (!data.success && data.errorMessage) {
      md += `\n> ❌ **Failure Reason**: ${data.errorMessage}\n`;
    }

    fs.appendFileSync(summaryPath, md + '\n', 'utf-8');
  } catch (err) {
    console.warn('[Monthly Automation] Failed to write GitHub Step Summary:', err);
  }
}

async function runMonthlyTasks() {
  const todayStr = getTodayInTimezone();
  const targetMonth = process.env.TARGET_MONTH?.trim() || 'Auto-detected (previous month)';
  let backupFilename = 'N/A';
  let backupSizeKb = '0';
  let backupDocs = 0;
  let excelFilename = 'N/A';
  let excelSizeKb = '0';
  let receiptsFilename = 'N/A';
  let receiptsCount = 0;
  let receiptsSizeKb = '0';
  let prunedScreenshots = 0;

  try {
    console.log('--- Starting Monthly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Exporting Database Backup...');
    const backupResult = await automationService.exportDatabaseBackup();
    backupFilename = backupResult.filename;
    backupDocs = backupResult.totalDocuments;

    const backupDir = path.resolve(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, backupResult.filename);
    fs.writeFileSync(backupPath, backupResult.jsonString, 'utf-8');
    const backupStats = fs.statSync(backupPath);
    backupSizeKb = (backupStats.size / 1024).toFixed(2);
    console.log(
      `Monthly backup saved to ${backupPath} (${backupSizeKb} KB, ${backupDocs} total documents)`
    );

    console.log('2. Generating Monthly Excel Export...');
    const excelTargetMonth = process.env.TARGET_MONTH?.trim() || undefined;
    const excelResult = await automationService.generateMonthlyExcel(excelTargetMonth);
    excelFilename = excelResult.filename;

    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = path.join(reportsDir, excelResult.filename);
    fs.writeFileSync(reportPath, Buffer.from(excelResult.buffer));
    const reportStats = fs.statSync(reportPath);
    excelSizeKb = (reportStats.size / 1024).toFixed(2);
    console.log(
      `Monthly Excel report saved to ${reportPath} (${excelSizeKb} KB)`
    );

    console.log('3. Exporting 90-Day Payment Receipts (ZIP)...');
    const zipResult = await automationService.exportPaymentScreenshotsZip({ days: 90 });
    receiptsFilename = zipResult.filename;
    receiptsCount = zipResult.count;
    if (zipResult.buffer) {
      const zipPath = path.join(reportsDir, zipResult.filename);
      fs.writeFileSync(zipPath, zipResult.buffer);
      const zipStats = fs.statSync(zipPath);
      receiptsSizeKb = (zipStats.size / 1024).toFixed(2);
      console.log(
        `Payment receipts archive saved to ${zipPath} (${receiptsSizeKb} KB, ${receiptsCount} receipts)`
      );
    }

    console.log('4. Pruning verified/rejected payment screenshots older than 90 days...');
    const pruneResult = await automationService.pruneOldPaymentScreenshots(90);
    prunedScreenshots = pruneResult.prunedCount;
    console.log(`Pruned ${prunedScreenshots} old screenshots from Firestore.`);

    console.log('5. Cleaning up old logs (older than 90 days)...');
    await automationService.cleanupOldLogs(90);

    writeGitHubStepSummary({
      todayStr,
      targetMonth: excelTargetMonth || 'Auto-detected (previous month)',
      backupFilename,
      backupSizeKb,
      backupDocs,
      excelFilename,
      excelSizeKb,
      receiptsFilename,
      receiptsCount,
      receiptsSizeKb,
      prunedScreenshots,
      success: true,
    });

    console.log('--- Monthly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Monthly Automation Tasks Failed:', error);
    writeGitHubStepSummary({
      todayStr,
      targetMonth,
      backupFilename,
      backupSizeKb,
      backupDocs,
      excelFilename,
      excelSizeKb,
      receiptsFilename,
      receiptsCount,
      receiptsSizeKb,
      prunedScreenshots,
      success: false,
      errorMessage: String((error as Error)?.message || error),
    });
    process.exit(1);
  }
}

runMonthlyTasks();

