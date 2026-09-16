// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';

async function runMonthlyTasks() {
  try {
    console.log('--- Starting Monthly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Exporting Database Backup...');
    const backupResult = await automationService.exportDatabaseBackup();
    const backupDir = path.resolve(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, backupResult.filename);
    fs.writeFileSync(backupPath, backupResult.jsonString, 'utf-8');
    const backupStats = fs.statSync(backupPath);
    console.log(
      `Monthly backup saved to ${backupPath} (${(backupStats.size / 1024).toFixed(2)} KB, ${backupResult.totalDocuments} total documents)`
    );

    console.log('2. Generating Monthly Excel Export...');
    const targetMonth = process.env.TARGET_MONTH || undefined;
    const excelResult = await automationService.generateMonthlyExcel(targetMonth);
    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = path.join(reportsDir, excelResult.filename);
    fs.writeFileSync(reportPath, Buffer.from(excelResult.buffer));
    const reportStats = fs.statSync(reportPath);
    console.log(
      `Monthly Excel report saved to ${reportPath} (${(reportStats.size / 1024).toFixed(2)} KB)`
    );

    console.log('3. Exporting 90-Day Payment Receipts (ZIP)...');
    const zipResult = await automationService.exportPaymentScreenshotsZip({ days: 90 });
    if (zipResult.buffer) {
      const zipPath = path.join(reportsDir, zipResult.filename);
      fs.writeFileSync(zipPath, zipResult.buffer);
      const zipStats = fs.statSync(zipPath);
      console.log(
        `Payment receipts archive saved to ${zipPath} (${(zipStats.size / 1024).toFixed(2)} KB, ${zipResult.count} receipts)`
      );
    }

    console.log('4. Pruning verified/rejected payment screenshots older than 90 days...');
    const pruneResult = await automationService.pruneOldPaymentScreenshots(90);
    console.log(`Pruned ${pruneResult.prunedCount} old screenshots from Firestore.`);

    console.log('5. Cleaning up old logs (older than 90 days)...');
    await automationService.cleanupOldLogs(90);

    console.log('--- Monthly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Monthly Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runMonthlyTasks();
