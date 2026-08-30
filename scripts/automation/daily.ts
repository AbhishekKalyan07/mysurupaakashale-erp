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

    console.log('1. Generating Today\'s Orders...');
    const orderRes = await orderService.generateDailyOrders();
    console.log(orderRes.message);

    console.log('2. Generating Daily Summary (Sales, Kitchen, Delivery)...');
    await automationService.generateDailySummary();

    console.log('2. Checking for expiring subscriptions...');
    await automationService.checkSubscriptionExpiry();

    console.log('3. Processing scheduled pauses and resumes...');
    await automationService.processScheduledPauses();

    console.log('4. Processing pending unskip requests...');
    await automationService.processUnskipRequests();

    console.log('5. Processing Daily Billing...');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const billingRes = await billingService.processDailyBilling(todayStr);
    console.log(`Billing: Processed ${billingRes.processed}, Errors ${billingRes.errors}`);

    console.log('--- Daily Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Daily Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runDailyTasks();
