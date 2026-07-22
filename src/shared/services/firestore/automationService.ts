import { collection, getDocs, getDoc, writeBatch, runTransaction, serverTimestamp, where, doc } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { orderRepository } from './orderRepository';
import { subscriptionRepository } from './subscriptionRepository';
import { orderGenerationRunRepository, analyticsRepository } from './analyticsRepository';
import { userRepository } from './userRepository';
import {
  notifyDailyOrdersGenerated,
  notifySubscriptionRenewalReminder,
  notifySubscriptionExpired,
} from './notificationService';
import type { Order, DailySummary } from '@/shared/types';
import { format, addDays } from 'date-fns';

export class AutomationService {
  /**
   * Automatically generate daily orders based on active subscriptions.
   */
  async generateDailyOrders(dateOverride?: string): Promise<{ success: boolean; message: string; ordersGenerated: number }> {
    const today = dateOverride || format(new Date(), 'yyyy-MM-dd');

    // 1. Check if it already ran today
    const existingRun = await orderGenerationRunRepository.getById(today);
    if (existingRun && existingRun.status === 'success') {
      return { success: true, message: 'Orders already generated for today.', ordersGenerated: 0 };
    }

    try {
      // 2. Fetch all active subscriptions
      const allSubscriptions = await subscriptionRepository.list(where('status', '==', 'active'));
      const ordersToCreate: Partial<Order>[] = [];

      for (const sub of allSubscriptions) {
        // Ignore if paused (which would be status !== 'active', so already filtered)
        // Wait! We also need to check if the subscription date has expired
        if (sub.endDate && sub.endDate < today) {
          continue; // expired
        }
        if (sub.startDate > today) {
          continue; // hasn't started
        }

        // Check if skipped today
        const skipRef = doc(db, 'subscriptions', sub.id, 'skips', today);
        let skippedMeals: string[] = [];
        try {
          // Bug #3 fix: use a plain getDoc — runTransaction is for atomic
          // multi-step read-write operations, not single reads. Using it
          // here opened (and immediately committed) an empty transaction per
          // subscription, wasting quota and risking contention failures.
          const skipDoc = await getDoc(skipRef);
          if (skipDoc.exists()) {
            skippedMeals = skipDoc.data().mealTypes || [];
          }
        } catch (error) {
          console.error(`Error fetching skips for subscription ${sub.id}:`, error);
        }

        for (const pref of sub.mealPreferences) {
          if (skippedMeals.includes(pref.mealType)) {
            continue; // Meal cancelled/skipped by customer
          }

          // Generate order
          ordersToCreate.push({
            id: `ord_${sub.id}_${today}_${pref.mealType}`,
            source: 'subscription',
            customerId: sub.customerId,
            subscriptionId: sub.id,
            planTier: sub.planTier,
            mealType: pref.mealType,
            date: today,
            itemsLabel: `Subscription - ${pref.mealType}`, // Or look up actual menu items if needed
            selectedOptionId: pref.selectedOptionId,
            price: sub.pricePerDaySnapshot,
            currency: 'INR',
            status: 'scheduled',
            deliveryAddressId: sub.deliveryAddressId,
            zoneId: sub.zoneId,
            kitchenId: null, // assigned by admin or auto-assigned based on zone
            deliveryPartnerId: null,
            deliveryWindow: null,
            paymentId: sub.latestPaymentId,
          });
        }
      }

      // 3. Save to Firestore via writeBatch
      // Firestore transactions hold a server-side lock and retry on contention
      // — that's the wrong tool for plain bulk inserts. writeBatch commits all
      // writes atomically without the locking overhead. Max 500 ops per batch.
      const BATCH_SIZE = 400;
      for (let i = 0; i < ordersToCreate.length; i += BATCH_SIZE) {
        const batchOrders = ordersToCreate.slice(i, i + BATCH_SIZE);
        // Bug #4 fix: writeBatch instead of runTransaction for bulk writes.
        const batch = writeBatch(db);
        batchOrders.forEach(order => {
          const ref = doc(db, 'orders', order.id!);
          // set with merge:true so a manually-edited order isn't overwritten
          // on a re-run (e.g. if generateDailyOrders is triggered twice).
          batch.set(ref, {
            ...order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });
        });
        await batch.commit();
      }

      // 4. Save run status
      await orderGenerationRunRepository.create({
        date: today,
        status: 'success',
        ordersGenerated: ordersToCreate.length,
        runAt: serverTimestamp() as any,
      }, today);

      // 5. Notify kitchen staff that today's orders are ready.
      // Fire-and-forget — a notification failure must never fail the generation job.
      if (ordersToCreate.length > 0) {
        userRepository
          .list(where('role', '==', 'kitchen'), where('isActive', '==', true))
          .then((kitchenStaff) => {
            const ids = kitchenStaff.map((s) => s.id);
            if (ids.length > 0) {
              return notifyDailyOrdersGenerated(ids, today, ordersToCreate.length);
            }
          })
          .catch((err) => console.error('[automationService] kitchen notification failed:', err));
      }

      return { success: true, message: `Successfully generated ${ordersToCreate.length} orders.`, ordersGenerated: ordersToCreate.length };

    } catch (error: any) {
      await orderGenerationRunRepository.create({
        date: today,
        status: 'failed',
        ordersGenerated: 0,
        runAt: serverTimestamp() as any,
        error: error.message
      }, today);
      throw error;
    }
  }

  /**
   * Generate daily sales and operational summary
   */
  async generateDailySummary(dateOverride?: string) {
    const today = dateOverride || format(new Date(), 'yyyy-MM-dd');
    
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
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    await analyticsRepository.create(summary, summary.id);
    console.log(`Generated daily summary for ${today}.`);
    return summary;
  }

  /**
   * Subscription Expiry Reminders
   */
  async checkSubscriptionExpiry() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const in3Days = format(addDays(new Date(), 3), 'yyyy-MM-dd');
    const in7Days = format(addDays(new Date(), 7), 'yyyy-MM-dd');

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
   * Database Backup (Monthly or Weekly)
   */
  async exportDatabaseBackup() {
    console.log("Starting database backup...");
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
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
    const currMonthStr = format(new Date(), 'yyyy-MM');
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
    
    const timestamp = format(new Date(), 'yyyy-MM');
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
    const cutoffDateStr = format(cutoffDate, 'yyyy-MM-dd');

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
