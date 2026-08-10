import { Timestamp } from 'firebase/firestore';
import { where, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { orderRepository } from './orderRepository';
import { subscriptionRepository } from './subscriptionRepository';
import { analyticsRepository, orderGenerationRunRepository } from './analyticsRepository';
import { userRepository } from './userRepository';
import { notifySubscriptionExpired, notifySubscriptionRenewalReminder } from './notificationService';
import type { DailySummary } from '@/shared/types';
import { addDays } from 'date-fns';
import { getTodayInTimezone } from '@/shared/lib/date';

export class AutomationService {
  /**
   * Generate daily sales and operational summary
   */
  async generateDailySummary(dateOverride?: string) {
    const today = dateOverride || getTodayInTimezone();
    
    // 1. Fetch today's orders
    const todayOrders = await orderRepository.getByDate(today);
    
    // 2. Fetch payments (for simplicity, we assume payments have createdAt == today or we just fetch all and filter)
    // To make it efficient, we query payments by status and created date if possible.
    // For now, we'll just aggregate from the orders or fetch active subscriptions.
    const allSubs = await subscriptionRepository.list(where('status', '==', 'active'));
    
    let breakfastCount = 0;
    let lunchCount = 0;
    let dinnerCount = 0;
    
    for (const order of todayOrders) {
      if (order.status !== 'cancelled' && order.status !== 'skipped') {
        if (order.mealType === 'breakfast') breakfastCount++;
        if (order.mealType === 'lunch') lunchCount++;
        if (order.mealType === 'dinner') dinnerCount++;
      }
    }

    const summary: DailySummary = {
      id: `summary_${today}`,
      date: today,
      totalRevenue: 0, // This would be calculated from today's successful payments
      cashPayments: 0,
      onlinePayments: 0,
      pendingPayments: 0,
      refundedPayments: 0,
      activeCustomers: new Set(allSubs.map(s => s.customerId)).size,
      newCustomers: 0, // Would need user account creation date
      activeSubscriptions: allSubs.length,
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalDeliveries: todayOrders.length,
      completedDeliveries: todayOrders.filter(o => o.status === 'delivered').length,
      failedDeliveries: todayOrders.filter(o => o.status === 'failed_delivery').length,
      createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
    };

    await analyticsRepository.create(summary, summary.id);
    console.log(`Generated daily summary for ${today}.`);
    return summary;
  }

  /**
   * Subscription Expiry Reminders
   */
  async checkSubscriptionExpiry() {
    const today = getTodayInTimezone();
    const tomorrow = getTodayInTimezone('Asia/Kolkata', addDays(new Date(), 1));
    const in3Days = getTodayInTimezone('Asia/Kolkata', addDays(new Date(), 3));
    const in7Days = getTodayInTimezone('Asia/Kolkata', addDays(new Date(), 7));

    const allSubs = await subscriptionRepository.list(where('status', '==', 'active'));
    
    // Create notifications for expiring subscriptions
    // Notification creation is handled by admin functions or manually inserting into `notifications` collection
    for (const sub of allSubs) {
      if (!sub.endDate) continue;

      let reminderType = null;
      if (sub.endDate < today) reminderType = 'expired';
      else if (sub.endDate === tomorrow) reminderType = 'tomorrow';
      else if (sub.endDate === in3Days) reminderType = '3_days';
      else if (sub.endDate === in7Days) reminderType = '7_days';

      if (reminderType) {
        console.log(`Subscription ${sub.id} for customer ${sub.customerId} is expiring: ${reminderType}`);
        // Notify the customer — fire-and-forget so expiry check loop isn't blocked.
        if (reminderType === 'expired') {
          notifySubscriptionExpired(sub.customerId, sub.id)
            .catch((err) => console.error(`[automationService] expiry notification failed for ${sub.id}:`, err));
        } else {
          const daysMap: Record<string, number> = { tomorrow: 1, '3_days': 3, '7_days': 7 };
          notifySubscriptionRenewalReminder(
            sub.customerId,
            sub.id,
            daysMap[reminderType] ?? 1,
            sub.endDate!,
          ).catch((err) => console.error(`[automationService] renewal notification failed for ${sub.id}:`, err));
        }
      }
    }
  }

  /**
   * Process Scheduled Pauses and Resumes
   */
  async processScheduledPauses() {
    console.log("Processing scheduled pauses and resumes...");
    const today = getTodayInTimezone();
    
    const activeSubs = await subscriptionRepository.list(where('status', '==', 'active'));
    const pausedSubs = await subscriptionRepository.list(where('status', '==', 'paused'));
    const subsToCheck = [...activeSubs, ...pausedSubs];

    for (const sub of subsToCheck) {
      if (sub.status === 'active' && sub.pauseStartDate && sub.pauseStartDate <= today) {
        if (sub.pauseEndDate && sub.pauseEndDate < today) {
          await subscriptionRepository.update(sub.id, {
            pauseStartDate: null,
            pauseEndDate: null,
          });
          console.log(`[automationService] Cleared outdated pause schedule for subscription ${sub.id}`);
        } else {
          await subscriptionRepository.update(sub.id, { status: 'paused' });
          console.log(`[automationService] Auto-paused subscription ${sub.id}`);
        }
      } else if (sub.status === 'paused' && sub.pauseEndDate && sub.pauseEndDate < today) {
        await subscriptionRepository.update(sub.id, { 
          status: 'active',
          pauseStartDate: null,
          pauseEndDate: null,
        });
        console.log(`[automationService] Auto-resumed subscription ${sub.id}`);
      }
    }
  }

  /**
   * Database Backup (Monthly or Weekly)
   */
  async exportDatabaseBackup() {
    console.log("Starting database backup...");
    const now = new Date();
    const timestamp = `${getTodayInTimezone('Asia/Kolkata', now)}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
    const backupData: Record<string, any> = {};

    // List of core collections to back up
    const collections = ['users', 'mealPlans', 'dailyMenus', 'kitchens', 'deliveryZones', 'subscriptions', 'orders', 'payments', 'settings'];

    for (const coll of collections) {
      const snap = await getDocs(collection(db, coll));
      backupData[coll] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const jsonString = JSON.stringify(backupData);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Upload to Firebase Storage
    const { storage } = await import('@/shared/lib/firebase');
    const { ref, uploadBytes } = await import('firebase/storage');
    
    const backupRef = ref(storage, `backups/firestore_backup_${timestamp}.json`);
    await uploadBytes(backupRef, blob);
    console.log(`Database backup uploaded to backups/firestore_backup_${timestamp}.json`);
  }

  /**
   * Monthly Excel Export
   */
  async generateMonthlyExcel() {
    console.log("Generating Monthly Excel Export...");
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // Customers sheet
    const customersSheet = workbook.addWorksheet('Customers');
    customersSheet.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
    ];
    const users = await userRepository.list(where('role', '==', 'customer'));
    users.forEach((u: any) => customersSheet.addRow({ id: u.id, name: `${u.firstName || u.name} ${u.lastName || ''}`.trim(), email: u.email, phone: u.phone }));

    // Orders sheet
    const ordersSheet = workbook.addWorksheet('Orders');
    ordersSheet.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Meal Type', key: 'mealType', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Price', key: 'price', width: 10 },
    ];
    // In a real app we would query for the current month. For demo, we just get recent.
    const orders = await orderRepository.list();
    orders.forEach(o => ordersSheet.addRow({ id: o.id, date: o.date, mealType: o.mealType, status: o.status, price: o.price }));

    // Subscriptions sheet
    const subsSheet = workbook.addWorksheet('Subscriptions');
    subsSheet.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Customer ID', key: 'customerId', width: 20 },
      { header: 'Plan Tier', key: 'planTier', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
    ];
    const subs = await subscriptionRepository.list();
    subs.forEach(s => subsSheet.addRow({ id: s.id, customerId: s.customerId, planTier: s.planTier, status: s.status }));

    // Payments sheet
    const { paymentRepository } = await import('./paymentRepository');
    const paymentsSheet = workbook.addWorksheet('Payments');
    paymentsSheet.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Customer ID', key: 'customerId', width: 20 },
      { header: 'Amount', key: 'amount', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Date', key: 'date', width: 25 },
    ];
    const payments = await paymentRepository.list();
    payments.forEach(p => paymentsSheet.addRow({ id: p.id, customerId: p.customerId, amount: p.amount, status: p.status, date: p.createdAt }));

    // Revenue, Kitchen, Delivery from Analytics
    const currMonthStr = getTodayInTimezone('Asia/Kolkata', new Date()).substring(0, 7);
    const analytics = await analyticsRepository.list();
    // Filter for current month using JS since date format is yyyy-MM-dd
    const monthAnalytics = analytics.filter(a => a.date.startsWith(currMonthStr));
    
    const revenueSheet = workbook.addWorksheet('Revenue');
    revenueSheet.columns = [{ header: 'Date', key: 'date', width: 15 }, { header: 'Revenue', key: 'rev', width: 15 }, { header: 'Cash', key: 'cash', width: 15 }, { header: 'Online', key: 'online', width: 15 }];
    monthAnalytics.forEach(a => revenueSheet.addRow({ date: a.date, rev: a.totalRevenue, cash: a.cashPayments, online: a.onlinePayments }));

    const kitchenSheet = workbook.addWorksheet('Kitchen Reports');
    kitchenSheet.columns = [{ header: 'Date', key: 'date', width: 15 }, { header: 'Breakfast', key: 'b', width: 10 }, { header: 'Lunch', key: 'l', width: 10 }, { header: 'Dinner', key: 'd', width: 10 }];
    monthAnalytics.forEach(a => kitchenSheet.addRow({ date: a.date, b: a.breakfastCount, l: a.lunchCount, d: a.dinnerCount }));

    const deliverySheet = workbook.addWorksheet('Delivery Reports');
    deliverySheet.columns = [{ header: 'Date', key: 'date', width: 15 }, { header: 'Total', key: 't', width: 10 }, { header: 'Completed', key: 'c', width: 10 }, { header: 'Failed', key: 'f', width: 10 }];
    monthAnalytics.forEach(a => deliverySheet.addRow({ date: a.date, t: a.totalDeliveries, c: a.completedDeliveries, f: a.failedDeliveries }));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const timestamp = getTodayInTimezone('Asia/Kolkata', new Date()).substring(0, 7);
    const { storage } = await import('@/shared/lib/firebase');
    const { ref, uploadBytes } = await import('firebase/storage');
    
    const excelRef = ref(storage, `reports/monthly_export_${timestamp}.xlsx`);
    await uploadBytes(excelRef, blob);
    console.log(`Monthly Excel Export uploaded to reports/monthly_export_${timestamp}.xlsx`);
  }

  /**
   * Log Cleanup
   */
  async cleanupOldLogs(retentionDays: number = 90) {
    console.log(`Starting log cleanup (retention: ${retentionDays} days)...`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = getTodayInTimezone('Asia/Kolkata', cutoffDate);

    // 1. Clean up old OrderGenerationRuns (which use ISODateString for date)
    const oldRuns = await orderGenerationRunRepository.list(where('date', '<', cutoffDateStr));
    let deletedRuns = 0;
    for (const run of oldRuns) {
      await orderGenerationRunRepository.delete(run.id);
      deletedRuns++;
    }

    // 2. Clean up old analytics (which use ISODateString for date)
    const oldAnalytics = await analyticsRepository.list(where('date', '<', cutoffDateStr));
    let deletedAnalytics = 0;
    for (const a of oldAnalytics) {
      await analyticsRepository.delete(a.id);
      deletedAnalytics++;
    }

    // 3. Clean up Audit Logs
    const { Timestamp } = await import('firebase/firestore');
    const fbCutoffTimestamp = Timestamp.fromDate(cutoffDate);

    const { BaseRepository, createConverter } = await import('./BaseRepository');
    const auditRepo = new BaseRepository<any>(db, 'auditLogs', createConverter<any>());
    const oldAuditLogs = await auditRepo.list(where('createdAt', '<', fbCutoffTimestamp));
    let deletedAudit = 0;
    for (const log of oldAuditLogs) {
      await auditRepo.delete(log.id);
      deletedAudit++;
    }

    console.log(`Log cleanup complete. Deleted ${deletedRuns} runs, ${deletedAnalytics} analytics, ${deletedAudit} audit logs.`);
  }
}

export const automationService = new AutomationService();
