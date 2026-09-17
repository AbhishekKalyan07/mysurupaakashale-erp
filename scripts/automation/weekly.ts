// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTodayInTimezone } from '@/shared/lib/date';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';

function writeGitHubStepSummary(
  todayStr: string,
  backupFilename: string,
  fileSizeKb: string,
  totalDocuments: number,
  success: boolean,
  errorMessage?: string
) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  try {
    const badge = success ? '✅ Completed Successfully' : '❌ Failed';
    let md = `## 📦 Mysuru Paakashale ERP — Weekly Automation Report\n\n`;
    md += `**Execution Date (IST)**: \`${todayStr}\`  \n`;
    md += `**Overall Status**: **${badge}**  \n\n`;
    md += `| Item | Details |\n`;
    md += `| :--- | :--- |\n`;
    md += `| 🗄️ **Backup Archive** | \`${backupFilename}\` |\n`;
    md += `| 📏 **File Size** | ${fileSizeKb} KB |\n`;
    md += `| 📄 **Total Documents** | ${totalDocuments.toLocaleString()} records |\n`;
    md += `| ⏳ **Retention Policy** | 90 Days (Stored in GitHub Artifacts) |\n`;

    if (!success && errorMessage) {
      md += `\n> ❌ **Failure Reason**: ${errorMessage}\n`;
    }

    fs.appendFileSync(summaryPath, md + '\n', 'utf-8');
  } catch (err) {
    console.warn('[Weekly Automation] Failed to write GitHub Step Summary:', err);
  }
}

async function runWeeklyTasks() {
  const todayStr = getTodayInTimezone();
  let backupFilename = 'N/A';
  let fileSizeKb = '0';
  let totalDocuments = 0;

  try {
    console.log('--- Starting Weekly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Exporting weekly database backup...');
    const result = await automationService.exportDatabaseBackup();
    backupFilename = result.filename;
    totalDocuments = result.totalDocuments;

    const backupDir = path.resolve(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filePath = path.join(backupDir, result.filename);
    fs.writeFileSync(filePath, result.jsonString, 'utf-8');

    const stats = fs.statSync(filePath);
    fileSizeKb = (stats.size / 1024).toFixed(2);
    console.log(
      `Weekly backup saved to ${filePath} (${fileSizeKb} KB, ${totalDocuments} total documents)`
    );

    writeGitHubStepSummary(todayStr, backupFilename, fileSizeKb, totalDocuments, true);

    console.log('--- Weekly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Weekly Automation Tasks Failed:', error);
    writeGitHubStepSummary(
      todayStr,
      backupFilename,
      fileSizeKb,
      totalDocuments,
      false,
      String((error as Error)?.message || error)
    );
    process.exit(1);
  }
}

runWeeklyTasks();

