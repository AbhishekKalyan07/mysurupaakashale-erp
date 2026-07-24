// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';
import { orderService } from '@/shared/services/business/orderService';

async function runDailyTasks() {
  try {
    console.log('--- Starting Daily Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Generating Today\'s Orders...');
    const orderRes = await orderService.generateDailyOrders();
    console.log(orderRes.message);

    console.log('2. Generating Daily Summary (Sales, Kitchen, Delivery)...');
    await automationService.generateDailySummary();

    console.log('3. Checking Subscription Expiries...');
    await automationService.checkSubscriptionExpiry();

    console.log('--- Daily Automation Tasks Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Daily Automation Tasks Failed:', error);
    process.exit(1);
  }
}

runDailyTasks();
