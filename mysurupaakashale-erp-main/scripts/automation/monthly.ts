// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';

async function runMonthlyTasks() {
  try {
    console.log('--- Starting Monthly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Exporting Database Backup...');
    await automationService.exportDatabaseBackup();

    console.log('2. Generating Monthly Excel Export...');
    await automationService.generateMonthlyExcel();

    console.log('3. Cleaning up old logs (older than 90 days)...');
    await automationService.cleanupOldLogs(90);

    console.log('--- Monthly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Monthly Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runMonthlyTasks();
