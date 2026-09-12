// env.ts MUST be first — maps process.env VITE_* into import.meta.env
// before Firebase (or any module that reads import.meta.env) is imported.
import './env';
import { getTodayInTimezone } from '@/shared/lib/date';
import { authenticateForAutomation } from './auth';
import { automationService } from '@/shared/services/firestore/automationService';
import { orderService } from '@/shared/services/business/orderService';
import { billingService } from '@/shared/services/business/billingService';

async function runDailyTasks() {
  let hasErrors = false;
  const errors: Error[] = [];

  try {
    console.log('--- Starting Daily Automation Tasks ---');
    await authenticateForAutomation();

    console.log('1. Processing Daily Billing...');
    const todayStr = getTodayInTimezone();
    try {
      const billingRes = await billingService.processDailyBilling(todayStr);
      console.log(`Billing: Processed ${billingRes.processed}, Errors ${billingRes.errors}`);
      if (billingRes.success === false) {
        errors.push(new Error('Daily billing failed.'));
        hasErrors = true;
      }
    } catch (e) {
      console.error('Error in Daily Billing:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

    console.log('2. Processing scheduled pauses and resumes...');
    try {
      await automationService.processScheduledPauses();
    } catch (e) {
      console.error('Error in Pauses/Resumes:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

    console.log('3. Generating Today\'s Orders...');
    try {
      const orderRes = await orderService.generateDailyOrders();
      console.log(orderRes.message);
      if (orderRes.success === false) {
        errors.push(new Error(`Order generation failed: ${orderRes.message}`));
        hasErrors = true;
      }
    } catch (e) {
      console.error('Error in Order Generation:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

    console.log('4. Generating Daily Summary (Sales, Kitchen, Delivery)...');
    try {
      await automationService.generateDailySummary();
    } catch (e) {
      console.error('Error in Daily Summary:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

    console.log('5. Checking for expiring subscriptions...');
    try {
      await automationService.checkSubscriptionExpiry();
    } catch (e) {
      console.error('Error in Subscription Expiry:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

    console.log('6. Processing pending unskip requests...');
    try {
      await automationService.processUnskipRequests();
    } catch (e) {
      console.error('Error in Unskip Requests:', e);
      errors.push(e as Error);
      hasErrors = true;
    }

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
    process.exit(1);
  }
}

runDailyTasks();
