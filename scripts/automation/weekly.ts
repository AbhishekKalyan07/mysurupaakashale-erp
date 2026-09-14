// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';

async function runWeeklyTasks() {
  try {
    console.log('--- Starting Weekly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Exporting weekly database backup...');
    const result = await automationService.exportDatabaseBackup();

    const backupDir = path.resolve(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filePath = path.join(backupDir, result.filename);
    fs.writeFileSync(filePath, result.jsonString, 'utf-8');

    const stats = fs.statSync(filePath);
    console.log(
      `Weekly backup saved to ${filePath} (${(stats.size / 1024).toFixed(2)} KB, ${result.totalDocuments} total documents)`
    );

    console.log('--- Weekly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Weekly Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runWeeklyTasks();
