// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';
import { orderService } from '@/shared/services/business/orderService';
import { billingService } from '@/shared/services/business/billingService';
import { format } from 'date-fns';

async function runDailyTasks() {
  try {
    console.log('--- Starting Daily Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Processing Daily Billing...');
    const { getTodayIST } = await import('@/shared/utils/dateUtils');
    const todayStr = getTodayIST();
    const billingRes = await billingService.processDailyBilling(todayStr);
    console.log(`Billing: Processed ${billingRes.processed}, Errors ${billingRes.errors}`);

    console.log('2. Generating Today\'s Orders...');
    const orderRes = await orderService.generateDailyOrders();
    console.log(orderRes.message);

    console.log('3. Generating Daily Summary (Sales, Kitchen, Delivery)...');
    await automationService.generateDailySummary();

    console.log('4. Checking for expiring subscriptions...');
    await automationService.checkSubscriptionExpiry();

    console.log('5. Processing scheduled pauses and resumes...');
    await automationService.processScheduledPauses();

    console.log('6. Processing pending unskip requests...');
    await automationService.processUnskipRequests();

    console.log('--- Daily Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Daily Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runDailyTasks();
