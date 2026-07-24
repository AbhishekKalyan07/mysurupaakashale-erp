// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import { authenticateForAutomation } from './auth';
// import { automationService } from '@/shared/services/firestore/automationService';

async function runWeeklyTasks() {
  try {
    console.log('--- Starting Weekly Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Generating Weekly Reports...');
    // We can reuse the monthly logic or just log for now
    console.log('Weekly logic completed.');

    console.log('--- Weekly Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Weekly Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runWeeklyTasks();
