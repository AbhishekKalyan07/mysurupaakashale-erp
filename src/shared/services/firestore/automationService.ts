import { Timestamp, runTransaction, doc, where, getDocs, collection, serverTimestamp } from 'firebase/firestore';
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
    
    const todayOrders = await orderRepository.getByDate(today);
    const allSubs = await subscriptionRepository.list(where('status', 'in', ['active', 'paused']));
    
    // Fetch payments for today
    const { paymentRepository } = await import('./paymentRepository');
    const todayPayments = await paymentRepository.list(
      where('createdAt', '>=', new Date(`${today}T00:00:00.000Z`))
    );
    
    let totalRevenue = 0, cashPayments = 0, onlinePayments = 0, pendingPayments = 0, refundedPayments = 0;
    let verifiedRevenue = 0, pendingRevenue = 0, rejectedRevenue = 0;
    const methodDistribution: Record<string, number> = {};
    
    todayPayments.forEach(p => {
      const amt = p.amount;
      if (p.status === 'verified') {
        totalRevenue += amt;
        verifiedRevenue += amt;
        if (p.paymentMethod === 'cash') cashPayments += amt;
        else onlinePayments += amt;
        methodDistribution[p.paymentMethod] = (methodDistribution[p.paymentMethod] || 0) + amt;
      } else if (p.status === 'pending') {
        pendingPayments += amt;
        pendingRevenue += amt;
      } else if (p.status === 'rejected') {
        rejectedRevenue += amt;
      } else if (p.status === 'refunded') {
        refundedPayments += amt;
      }
    });

    const planDistribution: Record<string, number> = {};
    let activeSubscriptions = 0;
    allSubs.forEach(s => {
      if (s.status === 'active') activeSubscriptions++;
      if (s.status === 'active' || s.status === 'paused') {
        planDistribution[s.planTier] = (planDistribution[s.planTier] || 0) + 1;
      }
    });
    
    let breakfastCount = 0, lunchCount = 0, dinnerCount = 0;
    let completedOrders = 0, pendingOrders = 0, kitchenPreparedToday = 0, kitchenPendingToday = 0;
    const deliveryByArea: Record<string, number> = {};
    const partnerCount: Record<string, number> = {};
    const peakHourCount: Record<string, number> = {};
    
    for (const o of todayOrders) {
      if (o.status !== 'cancelled' && o.status !== 'skipped') {
        if (o.mealType === 'breakfast') breakfastCount++;
        if (o.mealType === 'lunch') lunchCount++;
        if (o.mealType === 'dinner') dinnerCount++;
        
        if (o.status === 'delivered') {
          completedOrders++;
          if (o.zoneId) deliveryByArea[o.zoneId] = (deliveryByArea[o.zoneId] || 0) + 1;
          if (o.deliveryPartnerId) partnerCount[o.deliveryPartnerId] = (partnerCount[o.deliveryPartnerId] || 0) + 1;
        } else if (['scheduled', 'preparing', 'packing', 'packed', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)) {
          pendingOrders++;
        }
        
        if (['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(o.status)) {
          kitchenPreparedToday++;
        } else if (['scheduled', 'preparing', 'packing', 'packed'].includes(o.status)) {
          kitchenPendingToday++;
        }
        
        if (o.createdAt) {
          const hr = (o.createdAt as any).toDate ? (o.createdAt as any).toDate().getHours() : new Date((o.createdAt as any).seconds * 1000).getHours();
          peakHourCount[hr.toString()] = (peakHourCount[hr.toString()] || 0) + 1;
        }
      }
    }

    const summary: DailySummary = {
      id: `summary_${today}`,
      date: today,
      totalRevenue,
      cashPayments,
      onlinePayments,
      pendingPayments,
      refundedPayments,
      activeCustomers: new Set(allSubs.map(s => s.customerId)).size,
      newCustomers: 0, // Would need user account creation date
      activeSubscriptions,
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalDeliveries: todayOrders.length,
      completedDeliveries: todayOrders.filter(o => o.status === 'delivered').length,
      failedDeliveries: todayOrders.filter(o => o.status === 'failed_delivery').length,
      
      planDistribution,
      deliveryByArea,
      methodDistribution,
      partnerCount,
      peakHourCount,
      verifiedRevenue,
      pendingRevenue,
      rejectedRevenue,
      completedOrders,
      pendingOrders,
      kitchenPreparedToday,
      kitchenPendingToday,
      
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
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
    const results = await Promise.allSettled(allSubs.map(async (sub) => {
      if (!sub.endDate) return;

      let reminderType = null;
      if (sub.endDate < today) reminderType = 'expired';
      else if (sub.endDate === tomorrow) reminderType = 'tomorrow';
      else if (sub.endDate === in3Days) reminderType = '3_days';
      else if (sub.endDate === in7Days) reminderType = '7_days';

      if (reminderType) {
        console.log(`Subscription ${sub.id} for customer ${sub.customerId} is expiring: ${reminderType}`);
        
        if (reminderType === 'expired') {
          const wasUpdated = await runTransaction(db, async (transaction) => {
            const subRef = doc(db, 'subscriptions', sub.id);
            const subSnap = await transaction.get(subRef);
            if (subSnap.exists() && subSnap.data().status === 'active') {
              transaction.update(subRef, { status: 'expired' });
              return true;
            }
            return false;
          });
          
          if (wasUpdated) {
            await notifySubscriptionExpired(sub.customerId, sub.id);
          }
        } else {
          const daysMap: Record<string, number> = { tomorrow: 1, '3_days': 3, '7_days': 7 };
          await notifySubscriptionRenewalReminder(
            sub.customerId,
            sub.id,
            daysMap[reminderType] ?? 1,
            sub.endDate!,
          );
        }
      }
    }));

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[automationService] checkSubscriptionExpiry completed with ${failures.length} failures.`, failures);
    }
  }

  /**
   * Process Pending Unskip Requests
   */
  async processUnskipRequests() {
    console.log("Processing pending unskip requests...");
    const { getDocs, query, collection, where } = await import('firebase/firestore');
    const { db } = await import('@/shared/lib/firebase');
    const { orderService } = await import('@/shared/services/business/orderService');

    // Only process 'pending' requests.
    const requestsQuery = query(collection(db, 'unskipRequests'), where('status', '==', 'pending'));
    const snapshot = await getDocs(requestsQuery);

    const { updateDoc } = await import('firebase/firestore');

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      try {
        await orderService.restoreOrdersForUnskipDay(
          data.customerId,
          data.subscriptionId,
          data.date,
          data.mealTypes,
          true // generateMissing: securely generate any missing orders
        );
        await updateDoc(docSnap.ref, { status: 'processed' });
        console.log(`[automationService] Successfully processed unskip request ${docSnap.id}`);
      } catch (err) {
        console.error(`[automationService] Failed to process unskip request ${docSnap.id}:`, err);
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
    const oldAuditLogs = await auditRepo.list(where('timestamp', '<', fbCutoffTimestamp));
    let deletedAudit = 0;
    for (const log of oldAuditLogs) {
      await auditRepo.delete(log.id);
      deletedAudit++;
    }

    console.log(`Log cleanup complete. Deleted ${deletedRuns} runs, ${deletedAnalytics} analytics, ${deletedAudit} audit logs.`);
  }
}

export const automationService = new AutomationService();
