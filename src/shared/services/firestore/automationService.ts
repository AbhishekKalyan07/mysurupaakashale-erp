import {
  Timestamp,
  runTransaction,
  doc,
  where,
  getDocs,
  collection,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { sanitizeSpreadsheetValue } from "@/shared/utils/spreadsheet";
import { orderRepository } from "./orderRepository";
import { subscriptionRepository } from "./subscriptionRepository";
import {
  analyticsRepository,
  orderGenerationRunRepository,
} from "./analyticsRepository";
import { userRepository } from "./userRepository";
import {
  notifySubscriptionExpired,
  notifySubscriptionRenewalReminder,
} from "./notificationService";
import type { DailySummary, ManualPayment } from "@/shared/types";
import { addDays, subDays, format } from "date-fns";
import { getTodayInTimezone, getHourInTimezone } from "@/shared/lib/date";

export interface DatabaseBackupResult {
  timestamp: string;
  filename: string;
  collections: Record<string, number>;
  totalDocuments: number;
  jsonString: string;
  backupData: Record<string, any[]>;
}

export interface MonthlyExcelResult {
  timestamp: string;
  filename: string;
  buffer: ArrayBuffer;
}

export interface ScreenshotExportFilter {
  startDate?: string;
  endDate?: string;
  specificDate?: string;
  days?: number;
}

export interface ScreenshotExportFile {
  filename: string;
  buffer: Uint8Array | Buffer;
  paymentId: string;
  customerId: string;
  date: string;
  customerName: string;
  displayId: string;
}

export interface ScreenshotExportResult {
  files: ScreenshotExportFile[];
  total: number;
}

export interface ScreenshotZipResult {
  filename: string;
  blob?: Blob;
  buffer?: Buffer;
  count: number;
}

export class AutomationService {
  /**
   * Generate daily sales and operational summary
   */
  async generateDailySummary(dateOverride?: string) {
    const today = dateOverride || getTodayInTimezone();

    const todayOrders = await orderRepository.getByDate(today);
    const allSubs = await subscriptionRepository.list(
      where("status", "in", ["active", "paused"]),
    );

    // Fetch payments for today bounded strictly by IST day
    const { paymentRepository } = await import("./paymentRepository");
    const startOfDay = new Date(`${today}T00:00:00.000+05:30`);
    const nextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const todayPayments = await paymentRepository.list(
      where("createdAt", ">=", startOfDay),
      where("createdAt", "<", nextDay),
    );

    let totalRevenue = 0,
      cashPayments = 0,
      onlinePayments = 0,
      pendingPayments = 0,
      refundedPayments = 0;
    let verifiedRevenue = 0,
      pendingRevenue = 0,
      rejectedRevenue = 0;
    const methodDistribution: Record<string, number> = {};

    (todayPayments || []).forEach((p) => {
      const amt = p.amount;
      if (p.status === "verified") {
        totalRevenue += amt;
        verifiedRevenue += amt;
        if (p.paymentMethod === "cash") cashPayments += amt;
        else onlinePayments += amt;
        methodDistribution[p.paymentMethod] =
          (methodDistribution[p.paymentMethod] || 0) + amt;
      } else if (p.status === "pending") {
        pendingPayments += amt;
        pendingRevenue += amt;
      } else if (p.status === "rejected") {
        rejectedRevenue += amt;
      } else if (p.status === "refunded") {
        refundedPayments += amt;
      }
    });

    const planDistribution: Record<string, number> = {};
    let activeSubscriptions = 0;
    allSubs.forEach((s) => {
      if (s.status === "active") activeSubscriptions++;
      if (s.status === "active" || s.status === "paused") {
        planDistribution[s.planTier] = (planDistribution[s.planTier] || 0) + 1;
      }
    });

    let breakfastCount = 0,
      lunchCount = 0,
      dinnerCount = 0;
    let completedOrders = 0,
      pendingOrders = 0,
      kitchenPreparedToday = 0,
      kitchenPendingToday = 0;
    const deliveryByArea: Record<string, number> = {};
    const partnerCount: Record<string, number> = {};
    const peakHourCount: Record<string, number> = {};

    for (const o of todayOrders) {
      if (o.status !== "cancelled" && o.status !== "skipped") {
        if (o.mealType === "breakfast") breakfastCount++;
        if (o.mealType === "lunch") lunchCount++;
        if (o.mealType === "dinner") dinnerCount++;

        if (o.status === "delivered") {
          completedOrders++;
          if (o.zoneId)
            deliveryByArea[o.zoneId] = (deliveryByArea[o.zoneId] || 0) + 1;
          if (o.deliveryPartnerId)
            partnerCount[o.deliveryPartnerId] =
              (partnerCount[o.deliveryPartnerId] || 0) + 1;
        } else if (
          [
            "scheduled",
            "preparing",
            "packing",
            "packed",
            "ready_for_pickup",
            "out_for_delivery",
          ].includes(o.status)
        ) {
          pendingOrders++;
        }

        if (
          ["ready_for_pickup", "out_for_delivery", "delivered"].includes(
            o.status,
          )
        ) {
          kitchenPreparedToday++;
        } else if (
          ["scheduled", "preparing", "packing", "packed"].includes(o.status)
        ) {
          kitchenPendingToday++;
        }

        if (o.createdAt) {
          const orderDate = (o.createdAt as any).toDate
            ? (o.createdAt as any).toDate()
            : new Date((o.createdAt as any).seconds * 1000);
          const hr = getHourInTimezone(orderDate);
          peakHourCount[hr.toString()] =
            (peakHourCount[hr.toString()] || 0) + 1;
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
      activeCustomers: new Set(allSubs.map((s) => s.customerId)).size,
      newCustomers: 0, // Would need user account creation date
      activeSubscriptions,
      breakfastCount,
      lunchCount,
      dinnerCount,
      totalDeliveries: todayOrders.length,
      completedDeliveries: todayOrders.filter((o) => o.status === "delivered")
        .length,
      failedDeliveries: todayOrders.filter(
        (o) => o.status === "failed_delivery",
      ).length,

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
  async checkSubscriptionExpiry(dateOverride?: string) {
    const baseDate = dateOverride
      ? new Date(`${dateOverride}T00:00:00+05:30`)
      : new Date();
    const today = dateOverride || getTodayInTimezone();
    const tomorrow = getTodayInTimezone("Asia/Kolkata", addDays(baseDate, 1));
    const in3Days = getTodayInTimezone("Asia/Kolkata", addDays(baseDate, 3));
    const in7Days = getTodayInTimezone("Asia/Kolkata", addDays(baseDate, 7));

    const allSubs = await subscriptionRepository.list(
      where("status", "==", "active"),
    );

    // Create notifications for expiring subscriptions
    // Notification creation is handled by admin functions or manually inserting into `notifications` collection
    const results = await Promise.allSettled(
      allSubs.map(async (sub) => {
        if (!sub.endDate) return;

        let reminderType = null;
        if (sub.endDate < today) reminderType = "expired";
        else if (sub.endDate === tomorrow) reminderType = "tomorrow";
        else if (sub.endDate === in3Days) reminderType = "3_days";
        else if (sub.endDate === in7Days) reminderType = "7_days";

        if (reminderType) {
          console.log(
            `Subscription ${sub.id} for customer ${sub.customerId} is expiring: ${reminderType}`,
          );

          if (reminderType === "expired") {
            // Subscriptions with auto-renewal enabled must NOT be marked expired here;
            // billingService auto-renews them at cycle end. Only expire if autoRenew is false.
            if (!sub.autoRenew) {
              const wasUpdated = await runTransaction(db, async (transaction) => {
                const subRef = doc(db, "subscriptions", sub.id);
                const subSnap = await transaction.get(subRef);
                if (subSnap.exists() && subSnap.data().status === "active") {
                  transaction.update(subRef, { status: "expired" });
                  return true;
                }
                return false;
              });

              if (wasUpdated) {
                await notifySubscriptionExpired(sub.customerId, sub.id);
              }
            } else {
              console.log(
                `[automationService] Subscription ${sub.id} is past endDate but has autoRenew enabled. Leaving active for billingService auto-renewal.`,
              );
            }
          } else if (!sub.autoRenew) {
            const daysMap: Record<string, number> = {
              tomorrow: 1,
              "3_days": 3,
              "7_days": 7,
            };
            await notifySubscriptionRenewalReminder(
              sub.customerId,
              sub.id,
              daysMap[reminderType] ?? 1,
              sub.endDate!,
            );
          }
        }
      }),
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(
        `[automationService] checkSubscriptionExpiry completed with ${failures.length} failures.`,
        failures,
      );
    }
  }

  /**
   * Process Pending Unskip Requests
   */
  async processUnskipRequests() {
    console.log("Processing pending unskip requests...");
    const { getDocs, query, collection, where } =
      await import("firebase/firestore");
    const { db } = await import("@/shared/lib/firebase");
    const { orderService } =
      await import("@/shared/services/business/orderService");

    // Only process 'pending' requests.
    const requestsQuery = query(
      collection(db, "unskipRequests"),
      where("status", "==", "pending"),
    );
    const snapshot = await getDocs(requestsQuery);

    const { updateDoc } = await import("firebase/firestore");

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      try {
        await orderService.restoreOrdersForUnskipDay(
          data.customerId,
          data.subscriptionId,
          data.date,
          data.mealTypes,
          true, // generateMissing: securely generate any missing orders
        );
        await updateDoc(docSnap.ref, { status: "processed" });
        console.log(
          `[automationService] Successfully processed unskip request ${docSnap.id}`,
        );
      } catch (err) {
        console.error(
          `[automationService] Failed to process unskip request ${docSnap.id}:`,
          err,
        );
      }
    }
  }

  /**
   * Process Scheduled Pauses and Resumes
   */
  async processScheduledPauses(dateOverride?: string) {
    console.log("Processing scheduled pauses and resumes...");
    const today = dateOverride || getTodayInTimezone();

    const activeSubs = await subscriptionRepository.list(
      where("status", "==", "active"),
    );
    const pausedSubs = await subscriptionRepository.list(
      where("status", "==", "paused"),
    );
    const subsToCheck = [...activeSubs, ...pausedSubs];

    for (const sub of subsToCheck) {
      try {
        if (
          sub.status === "active" &&
          sub.pauseStartDate &&
          sub.pauseStartDate <= today
        ) {
          if (sub.pauseEndDate && sub.pauseEndDate < today) {
            await subscriptionRepository.update(sub.id, {
              pauseStartDate: null,
              pauseEndDate: null,
            });
            console.log(
              `[automationService] Cleared outdated pause schedule for subscription ${sub.id}`,
            );
          } else {
            await subscriptionRepository.update(sub.id, { status: "paused" });
            console.log(`[automationService] Auto-paused subscription ${sub.id}`);
          }
        } else if (
          sub.status === "paused" &&
          sub.pauseEndDate &&
          sub.pauseEndDate < today
        ) {
          await subscriptionRepository.update(sub.id, {
            status: "active",
            pauseStartDate: null,
            pauseEndDate: null,
          });
          console.log(`[automationService] Auto-resumed subscription ${sub.id}`);
        }
      } catch (subErr) {
        console.error(
          `[automationService] Failed to process scheduled pause/resume for subscription ${sub.id}:`,
          subErr,
        );
      }
    }
  }

  /**
   * Database Backup Export
   * Compiles canonical Firestore collections and returns structured metadata and JSON string.
   * Zero-dependency on Firebase Cloud Storage (Spark plan compatible).
   */
  async exportDatabaseBackup(): Promise<DatabaseBackupResult> {
    console.log("Starting database backup...");
    const now = new Date();
    const timestamp = `${getTodayInTimezone("Asia/Kolkata", now)}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
    const backupData: Record<string, any[]> = {};
    const counts: Record<string, number> = {};

    // List of core collections to back up
    const collections = [
      "users",
      "mealPlans",
      "dailyMenus",
      "kitchens",
      "deliveryZones",
      "subscriptions",
      "orders",
      "payments",
      "settings",
    ];

    let totalDocs = 0;
    for (const coll of collections) {
      const snap = await getDocs(collection(db, coll));
      const docs = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      backupData[coll] = docs;
      counts[coll] = docs.length;
      totalDocs += docs.length;
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const filename = `firestore_backup_${timestamp}.json`;

    console.log(
      `Database backup prepared: ${totalDocs} documents across ${collections.length} collections (${filename})`,
    );

    return {
      timestamp,
      filename,
      collections: counts,
      totalDocuments: totalDocs,
      jsonString,
      backupData,
    };
  }

  /**
   * Monthly Excel Export
   * Supports targetMonth (YYYY-MM). If omitted and executed in early days of month (<=5),
   * automatically targets the completed previous month.
   * All queries are strictly bounded to protect Firebase Spark plan quota.
   */
  async generateMonthlyExcel(targetMonth?: string): Promise<MonthlyExcelResult> {
    console.log("Generating Monthly Excel Export...");
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();

    const todayStr = getTodayInTimezone("Asia/Kolkata", new Date());
    let monthStr = targetMonth;
    if (monthStr) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
        throw new Error(
          `Invalid targetMonth format: "${monthStr}". Expected YYYY-MM (01-12).`,
        );
      }
    } else {
      const day = parseInt(todayStr.substring(8, 10), 10);
      if (day <= 5) {
        // If run within the first 5 days of a month, export the previous completed month
        const [year, month] = todayStr.substring(0, 7).split("-").map(Number);
        const prevDate = new Date(year, month - 2, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = String(prevDate.getMonth() + 1).padStart(2, "0");
        monthStr = `${prevYear}-${prevMonth}`;
      } else {
        monthStr = todayStr.substring(0, 7);
      }
    }

    const [yearNum, monthNum] = monthStr.split("-").map(Number);
    const lastDayDate = new Date(yearNum, monthNum, 0);
    const lastDayStr = String(lastDayDate.getDate()).padStart(2, "0");

    const monthStart = `${monthStr}-01`;
    const monthEnd = `${monthStr}-${lastDayStr}`;

    // Customers sheet
    const customersSheet = workbook.addWorksheet("Customers");
    customersSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 25 },
      { header: "Phone", key: "phone", width: 15 },
    ];
    const users = await userRepository.list(where("role", "==", "customer"));
    users.forEach((u: any) =>
      customersSheet.addRow({
        id: u.id,
        name: sanitizeSpreadsheetValue(`${u.firstName || u.name} ${u.lastName || ""}`.trim()),
        email: u.email,
        phone: u.phone,
      }),
    );

    // Orders sheet - scoped strictly to target month
    const ordersSheet = workbook.addWorksheet("Orders");
    ordersSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Meal Type", key: "mealType", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Price", key: "price", width: 10 },
    ];
    const orders = await orderRepository.list(
      where("date", ">=", monthStart),
      where("date", "<=", monthEnd),
    );
    orders.forEach((o) =>
      ordersSheet.addRow({
        id: o.id,
        date: o.date,
        mealType: o.mealType,
        status: o.status,
        price: o.price,
      }),
    );

    // Subscriptions sheet
    const subsSheet = workbook.addWorksheet("Subscriptions");
    subsSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Customer ID", key: "customerId", width: 20 },
      { header: "Plan Tier", key: "planTier", width: 15 },
      { header: "Status", key: "status", width: 15 },
    ];
    const subs = await subscriptionRepository.list();
    subs.forEach((s) =>
      subsSheet.addRow({
        id: s.id,
        customerId: s.customerId,
        planTier: s.planTier,
        status: s.status,
      }),
    );

    // Payments sheet - scoped strictly to target month in IST
    const { paymentRepository } = await import("./paymentRepository");
    const paymentsSheet = workbook.addWorksheet("Payments");
    paymentsSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Customer ID", key: "customerId", width: 20 },
      { header: "Amount", key: "amount", width: 10 },
      { header: "Status", key: "status", width: 15 },
      { header: "Date", key: "date", width: 25 },
    ];
    const startPaymentDate = new Date(`${monthStart}T00:00:00.000+05:30`);
    const nextMonthDate = new Date(yearNum, monthNum, 1);
    const nextMonthYear = nextMonthDate.getFullYear();
    const nextMonthStr = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
    const nextMonthStartDate = new Date(
      `${nextMonthYear}-${nextMonthStr}-01T00:00:00.000+05:30`,
    );
    const payments = await paymentRepository.list(
      where("createdAt", ">=", startPaymentDate),
      where("createdAt", "<", nextMonthStartDate),
    );
    payments.forEach((p) =>
      paymentsSheet.addRow({
        id: p.id,
        customerId: p.customerId,
        amount: p.amount,
        status: p.status,
        date: p.createdAt,
      }),
    );

    // Revenue, Kitchen, Delivery from Analytics - scoped to target month
    const analytics = await analyticsRepository.list(
      where("date", ">=", monthStart),
      where("date", "<=", monthEnd),
    );
    const monthAnalytics = analytics.filter((a) =>
      a.date.startsWith(monthStr),
    );

    const revenueSheet = workbook.addWorksheet("Revenue");
    revenueSheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Revenue", key: "rev", width: 15 },
      { header: "Cash", key: "cash", width: 15 },
      { header: "Online", key: "online", width: 15 },
    ];
    monthAnalytics.forEach((a) =>
      revenueSheet.addRow({
        date: a.date,
        rev: a.totalRevenue,
        cash: a.cashPayments,
        online: a.onlinePayments,
      }),
    );

    const kitchenSheet = workbook.addWorksheet("Kitchen Reports");
    kitchenSheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Breakfast", key: "b", width: 10 },
      { header: "Lunch", key: "l", width: 10 },
      { header: "Dinner", key: "d", width: 10 },
    ];
    monthAnalytics.forEach((a) =>
      kitchenSheet.addRow({
        date: a.date,
        b: a.breakfastCount,
        l: a.lunchCount,
        d: a.dinnerCount,
      }),
    );

    const deliverySheet = workbook.addWorksheet("Delivery Reports");
    deliverySheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Total", key: "t", width: 10 },
      { header: "Completed", key: "c", width: 10 },
      { header: "Failed", key: "f", width: 10 },
    ];
    monthAnalytics.forEach((a) =>
      deliverySheet.addRow({
        date: a.date,
        t: a.totalDeliveries,
        c: a.completedDeliveries,
        f: a.failedDeliveries,
      }),
    );

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = monthStr;
    const filename = `monthly_export_${timestamp}.xlsx`;
    console.log(`Monthly Excel Export generated (${filename})`);

    return {
      timestamp,
      filename,
      buffer,
    };
  }

  /**
   * Log Cleanup
   */
  async cleanupOldLogs(retentionDays: number = 90) {
    console.log(`Starting log cleanup (retention: ${retentionDays} days)...`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = getTodayInTimezone("Asia/Kolkata", cutoffDate);

    // 1. Clean up old OrderGenerationRuns (which use ISODateString for date)
    const oldRuns = await orderGenerationRunRepository.list(
      where("date", "<", cutoffDateStr),
    );
    let deletedRuns = 0;
    for (const run of oldRuns) {
      await orderGenerationRunRepository.delete(run.id);
      deletedRuns++;
    }

    // 2. Clean up old analytics (which use ISODateString for date)
    const oldAnalytics = await analyticsRepository.list(
      where("date", "<", cutoffDateStr),
    );
    let deletedAnalytics = 0;
    for (const a of oldAnalytics) {
      await analyticsRepository.delete(a.id);
      deletedAnalytics++;
    }

    // 3. Clean up Audit Logs
    const { Timestamp } = await import("firebase/firestore");
    const fbCutoffTimestamp = Timestamp.fromDate(cutoffDate);

    const { BaseRepository, createConverter } =
      await import("./BaseRepository");
    const auditRepo = new BaseRepository<any>(
      db,
      "auditLogs",
      createConverter<any>(),
    );
    const oldAuditLogs = await auditRepo.list(
      where("timestamp", "<", fbCutoffTimestamp),
    );
    let deletedAudit = 0;
    for (const log of oldAuditLogs) {
      await auditRepo.delete(log.id);
      deletedAudit++;
    }

    console.log(
      `Log cleanup complete. Deleted ${deletedRuns} runs, ${deletedAnalytics} analytics, ${deletedAudit} audit logs.`,
    );
  }

  /**
   * Generates a collision-free filename for a payment screenshot:
   * Format: {CustomerID}_{CustomerName}_{Date}.jpg
   * Example: CUST-042_RameshKumar_2026-09-12.jpg
   */
  buildScreenshotFileName(
    payment: ManualPayment,
    userMap?: Map<string, any>,
    usedNames?: Set<string>,
  ): string {
    const user = userMap?.get(payment.customerId);
    const displayId =
      user?.displayId ||
      (user?.id ? `CUST-${user.id.slice(0, 6).toUpperCase()}` : (payment.customerId || "CUST-UNKNOWN"));

    // Clean name: alphanumeric + underscores only
    const rawName =
      payment.customerName ||
      user?.name ||
      `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
      "Customer";
    const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, "") || "Customer";

    // Date
    let dateStr = payment.paymentDate;
    if (!dateStr && payment.createdAt) {
      try {
        const d =
          typeof payment.createdAt.toDate === "function"
            ? payment.createdAt.toDate()
            : new Date(payment.createdAt as any);
        dateStr = format(d, "yyyy-MM-dd");
      } catch {
        dateStr = getTodayInTimezone();
      }
    }
    if (!dateStr) dateStr = getTodayInTimezone();

    const baseName = `${displayId}_${cleanName}_${dateStr}`;
    let filename = `${baseName}.jpg`;

    if (usedNames) {
      let counter = 2;
      while (usedNames.has(filename)) {
        filename = `${baseName}_${counter}.jpg`;
        counter++;
      }
      usedNames.add(filename);
    }

    return filename;
  }

  /**
   * Export payment screenshots based on filter options.
   * Resolves customer names and IDs, decodes base64 to binary buffers.
   */
  async exportPaymentScreenshots(
    filter: ScreenshotExportFilter = { days: 90 },
  ): Promise<ScreenshotExportResult> {
    console.log("[automationService] Exporting payment screenshots with filter:", filter);
    const { paymentRepository } = await import("./paymentRepository");
    let allPayments: ManualPayment[] = [];

    if (filter.specificDate) {
      allPayments = await paymentRepository.list(
        where("paymentDate", "==", filter.specificDate),
      );
    } else if (filter.startDate && filter.endDate) {
      allPayments = await paymentRepository.list(
        where("paymentDate", ">=", filter.startDate),
        where("paymentDate", "<=", filter.endDate),
      );
    } else {
      const days = filter.days ?? 90;
      const cutoffDate = subDays(new Date(), days);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
      allPayments = await paymentRepository.list(
        where("createdAt", ">=", cutoffTimestamp),
      );
    }

    // Filter payments that have an inline screenshot data URI
    const paymentsWithScreenshots = allPayments.filter(
      (p) =>
        p.screenshotUrl &&
        typeof p.screenshotUrl === "string" &&
        p.screenshotUrl.startsWith("data:image/"),
    );

    // Pre-fetch unique customers to resolve names & display IDs
    const uniqueCustomerIds = [
      ...new Set(paymentsWithScreenshots.map((p) => p.customerId).filter(Boolean)),
    ];
    const userMap = new Map<string, any>();
    await Promise.all(
      uniqueCustomerIds.map(async (cid) => {
        try {
          const u = await userRepository.getById(cid);
          if (u) userMap.set(cid, u);
        } catch (err) {
          console.warn(`[automationService] Failed to fetch customer ${cid}:`, err);
        }
      }),
    );

    const usedNames = new Set<string>();
    const files: ScreenshotExportFile[] = [];

    for (const p of paymentsWithScreenshots) {
      try {
        const matches = p.screenshotUrl!.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
        const base64Data = matches ? matches[1] : p.screenshotUrl!.split(",")[1];
        if (!base64Data) continue;

        let buffer: Uint8Array | Buffer;
        if (typeof Buffer !== "undefined") {
          buffer = Buffer.from(base64Data, "base64");
        } else {
          const binaryStr = atob(base64Data);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let j = 0; j < len; j++) {
            bytes[j] = binaryStr.charCodeAt(j);
          }
          buffer = bytes;
        }

        const user = userMap.get(p.customerId);
        const filename = this.buildScreenshotFileName(p, userMap, usedNames);

        files.push({
          filename,
          buffer,
          paymentId: p.id,
          customerId: p.customerId,
          date: p.paymentDate || "",
          customerName: p.customerName || user?.name || "Customer",
          displayId: user?.displayId || p.customerId,
        });
      } catch (err) {
        console.error(`[automationService] Failed to decode screenshot for payment ${p.id}:`, err);
      }
    }

    console.log(`[automationService] Extracted ${files.length} screenshot files.`);
    return { files, total: files.length };
  }

  /**
   * Bundles exported payment screenshots into a ZIP archive.
   * Returns a downloadable Blob in the browser or Buffer in Node.
   */
  async exportPaymentScreenshotsZip(
    filter: ScreenshotExportFilter = { days: 90 },
  ): Promise<ScreenshotZipResult> {
    const { files } = await this.exportPaymentScreenshots(filter);
    const JSZipModule = await import("jszip");
    const JSZip = (JSZipModule as any).default || JSZipModule;
    const zip = new JSZip();

    for (const f of files) {
      zip.file(f.filename, f.buffer);
    }

    let nameSuffix = "export";
    if (filter.specificDate) {
      nameSuffix = filter.specificDate;
    } else if (filter.startDate && filter.endDate) {
      nameSuffix = `${filter.startDate}_to_${filter.endDate}`;
    } else if (filter.days) {
      nameSuffix = `last_${filter.days}_days`;
    }
    const filename = `mysuru_receipts_${nameSuffix}.zip`;

    if (typeof window !== "undefined") {
      const blob = await zip.generateAsync({ type: "blob" });
      return { filename, blob, count: files.length };
    } else {
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      return { filename, buffer, count: files.length };
    }
  }

  /**
   * Prunes screenshotUrl from payments older than retentionDays (default: 90 days)
   * ONLY if status is 'verified' or 'rejected'.
   * Never prunes unverified ('pending') payments!
   */
  async pruneOldPaymentScreenshots(
    retentionDays: number = 90,
  ): Promise<{ prunedCount: number }> {
    console.log(`[automationService] Pruning payment screenshots older than ${retentionDays} days...`);
    const cutoffDate = subDays(new Date(), retentionDays);
    const fbCutoffTimestamp = Timestamp.fromDate(cutoffDate);

    const { paymentRepository } = await import("./paymentRepository");
    const oldPayments = await paymentRepository.list(
      where("createdAt", "<", fbCutoffTimestamp),
    );

    // Only prune if status is verified or rejected AND screenshotUrl is present
    const eligibleToPrune = oldPayments.filter(
      (p) =>
        (p.status === "verified" || p.status === "rejected") &&
        Boolean(p.screenshotUrl),
    );

    console.log(
      `[automationService] Found ${eligibleToPrune.length} verified/rejected payments eligible for screenshot pruning.`,
    );

    let prunedCount = 0;
    const BATCH_SIZE = 400;
    for (let i = 0; i < eligibleToPrune.length; i += BATCH_SIZE) {
      const chunk = eligibleToPrune.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const p of chunk) {
        const ref = doc(db, "payments", p.id);
        batch.update(ref, {
          screenshotUrl: null,
          screenshotPrunedAt: serverTimestamp(),
        });
        prunedCount++;
      }

      await batch.commit();
    }

    console.log(`[automationService] Successfully pruned ${prunedCount} payment screenshots.`);
    return { prunedCount };
  }
}

export const automationService = new AutomationService();
