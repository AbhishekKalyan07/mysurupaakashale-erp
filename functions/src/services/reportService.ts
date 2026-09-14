import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getApps, initializeApp } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import ExcelJS from "exceljs";

export interface GenerateMonthlyExcelResult {
  success: boolean;
  destination: string;
  targetMonth: string;
  sheets: {
    customers: number;
    orders: number;
    subscriptions: number;
    payments: number;
    revenue: number;
    kitchen: number;
    delivery: number;
  };
  sizeBytes: number;
  durationMs: number;
}

const getAdminApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      projectId:
        process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test",
    });
  }
  return getApps()[0];
};

/**
 * Safely sanitizes a value for export to CSV or Excel to prevent formula injection.
 * Prevents Excel/LibreOffice from executing strings starting with =, +, -, or @
 * by prepending a single quote (which is interpreted as a text-marker).
 * Preserves numbers, dates, booleans, and nulls with native types.
 */
export function sanitizeSpreadsheetValue(val: any): any {
  if (typeof val === "string") {
    if (/^\s*[=+\-@]/.test(val)) {
      return "'" + val;
    }
  }
  return val;
}

/**
 * Calculates the completed previous month in Asia/Kolkata timezone.
 * e.g. at 2026-10-01 00:00 IST -> returns { year: 2026, month: 9, monthString: "2026-09" }
 */
export function getPreviousMonth(
  referenceDate: Date = new Date(),
  timezone: string = "Asia/Kolkata",
): { year: number; month: number; monthString: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(referenceDate);

  const currentYear = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const currentMonth = parseInt(parts.find((p) => p.type === "month")!.value, 10); // 1-12

  let prevYear = currentYear;
  let prevMonth = currentMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const monthString = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return { year: prevYear, month: prevMonth, monthString };
}

/**
 * Calculates start and next month boundary strings and timestamps in Asia/Kolkata.
 */
export function getMonthBoundaries(targetMonth: string): {
  startDateStr: string;
  nextMonthDateStr: string;
  startTsMs: number;
  endTsMs: number;
} {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    throw new Error(
      `Invalid targetMonth "${targetMonth}": must be in YYYY-MM format (e.g. "2026-09")`,
    );
  }

  const [yearStr, monthStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const startDateStr = `${targetMonth}-01`;
  const nextMonthDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // Asia/Kolkata is UTC+05:30 (19800000 ms)
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const startUtc = new Date(Date.UTC(year, month - 1, 1));
  const startTsMs = startUtc.getTime() - IST_OFFSET_MS;

  const endUtc = new Date(Date.UTC(nextYear, nextMonth - 1, 1));
  const endTsMs = endUtc.getTime() - IST_OFFSET_MS;

  return { startDateStr, nextMonthDateStr, startTsMs, endTsMs };
}

export class BackendReportService {
  getDb() {
    return getFirestore(getAdminApp());
  }

  getStorageBucket() {
    const app = getAdminApp();
    const projectId =
      process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT || "demo-test";
    const bucketName =
      process.env.STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      `${projectId}.appspot.com`;

    return getStorage(app).bucket(bucketName);
  }

  /**
   * Generates the 7-sheet monthly Excel workbook for the given target month
   * and uploads it to Cloud Storage at reports/monthly_export_${targetMonth}.xlsx.
   */
  async generateMonthlyExcel(
    monthOverride?: string,
  ): Promise<GenerateMonthlyExcelResult> {
    const startTime = Date.now();
    const targetMonth = monthOverride || getPreviousMonth().monthString;
    const { startDateStr, nextMonthDateStr, startTsMs, endTsMs } = getMonthBoundaries(targetMonth);

    logger.info(`[reportService] Generating monthly Excel export for ${targetMonth}...`);

    const db = this.getDb();

    // 1. Fetch data from Firestore
    const [usersSnap, ordersSnap, subsSnap, paymentsSnap, analyticsSnap] =
      await Promise.all([
        db.collection("users").where("role", "==", "customer").get(),
        db.collection("orders").get(),
        db.collection("subscriptions").get(),
        db.collection("payments").get(),
        db.collection("analytics").get(),
      ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Mysuru Paakashale Trusted Automation";
    workbook.lastModifiedBy = "system";
    workbook.created = new Date();
    workbook.modified = new Date();

    // -------------------------------------------------------------
    // Sheet 1: Customers
    // -------------------------------------------------------------
    const customersSheet = workbook.addWorksheet("Customers");
    customersSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 25 },
      { header: "Phone", key: "phone", width: 15 },
    ];

    let customersCount = 0;
    for (const doc of usersSnap.docs) {
      const u = doc.data();
      const rawName = `${u.firstName || u.name || ""} ${u.lastName || ""}`.trim() || "Customer";
      customersSheet.addRow({
        id: sanitizeSpreadsheetValue(doc.id),
        name: sanitizeSpreadsheetValue(rawName),
        email: sanitizeSpreadsheetValue(u.email || ""),
        phone: sanitizeSpreadsheetValue(u.phone || ""),
      });
      customersCount++;
    }

    // -------------------------------------------------------------
    // Sheet 2: Orders (Filtered for target month)
    // -------------------------------------------------------------
    const ordersSheet = workbook.addWorksheet("Orders");
    ordersSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Meal Type", key: "mealType", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Price", key: "price", width: 10 },
    ];

    let ordersCount = 0;
    for (const doc of ordersSnap.docs) {
      const o = doc.data();
      const orderDate = typeof o.date === "string" ? o.date : "";
      if (orderDate >= startDateStr && orderDate < nextMonthDateStr) {
        ordersSheet.addRow({
          id: sanitizeSpreadsheetValue(doc.id),
          date: sanitizeSpreadsheetValue(orderDate),
          mealType: sanitizeSpreadsheetValue(o.mealType || ""),
          status: sanitizeSpreadsheetValue(o.status || ""),
          price: typeof o.price === "number" ? o.price : typeof o.totalAmount === "number" ? o.totalAmount : 0,
        });
        ordersCount++;
      }
    }

    // -------------------------------------------------------------
    // Sheet 3: Subscriptions
    // -------------------------------------------------------------
    const subsSheet = workbook.addWorksheet("Subscriptions");
    subsSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Customer ID", key: "customerId", width: 20 },
      { header: "Plan Tier", key: "planTier", width: 15 },
      { header: "Status", key: "status", width: 15 },
    ];

    let subsCount = 0;
    for (const doc of subsSnap.docs) {
      const s = doc.data();
      subsSheet.addRow({
        id: sanitizeSpreadsheetValue(doc.id),
        customerId: sanitizeSpreadsheetValue(s.customerId || ""),
        planTier: sanitizeSpreadsheetValue(s.planTier || ""),
        status: sanitizeSpreadsheetValue(s.status || ""),
      });
      subsCount++;
    }

    // -------------------------------------------------------------
    // Sheet 4: Payments (Filtered for target month)
    // -------------------------------------------------------------
    const paymentsSheet = workbook.addWorksheet("Payments");
    paymentsSheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Customer ID", key: "customerId", width: 20 },
      { header: "Amount", key: "amount", width: 10 },
      { header: "Status", key: "status", width: 15 },
      { header: "Date", key: "date", width: 25 },
    ];

    let paymentsCount = 0;
    for (const doc of paymentsSnap.docs) {
      const p = doc.data();
      let matchesMonth = false;
      let dateDisplay = "";

      if (typeof p.date === "string" && p.date.startsWith(targetMonth)) {
        matchesMonth = true;
        dateDisplay = p.date;
      } else if (p.createdAt) {
        const ms =
          typeof p.createdAt.toMillis === "function"
            ? p.createdAt.toMillis()
            : p.createdAt._seconds
            ? p.createdAt._seconds * 1000
            : p.createdAt.seconds
            ? p.createdAt.seconds * 1000
            : new Date(p.createdAt).getTime();

        if (!isNaN(ms) && ms >= startTsMs && ms < endTsMs) {
          matchesMonth = true;
          dateDisplay = new Date(ms).toISOString();
        }
      }

      if (matchesMonth) {
        paymentsSheet.addRow({
          id: sanitizeSpreadsheetValue(doc.id),
          customerId: sanitizeSpreadsheetValue(p.customerId || ""),
          amount: Number(p.amount) || 0,
          status: sanitizeSpreadsheetValue(p.status || ""),
          date: sanitizeSpreadsheetValue(dateDisplay),
        });
        paymentsCount++;
      }
    }

    // -------------------------------------------------------------
    // Sheets 5, 6, 7: Analytics (Revenue, Kitchen, Delivery)
    // -------------------------------------------------------------
    const revenueSheet = workbook.addWorksheet("Revenue");
    revenueSheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Revenue", key: "rev", width: 15 },
      { header: "Cash", key: "cash", width: 15 },
      { header: "Online", key: "online", width: 15 },
    ];

    const kitchenSheet = workbook.addWorksheet("Kitchen Reports");
    kitchenSheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Breakfast", key: "b", width: 10 },
      { header: "Lunch", key: "l", width: 10 },
      { header: "Dinner", key: "d", width: 10 },
    ];

    const deliverySheet = workbook.addWorksheet("Delivery Reports");
    deliverySheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Total", key: "t", width: 10 },
      { header: "Completed", key: "c", width: 10 },
      { header: "Failed", key: "f", width: 10 },
    ];

    let analyticsRowsCount = 0;
    const sortedAnalyticsDocs = analyticsSnap.docs
      .map((d) => d.data())
      .filter((a) => typeof a.date === "string" && a.date.startsWith(targetMonth))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    for (const a of sortedAnalyticsDocs) {
      revenueSheet.addRow({
        date: sanitizeSpreadsheetValue(a.date),
        rev: Number(a.totalRevenue) || 0,
        cash: Number(a.cashPayments) || 0,
        online: Number(a.onlinePayments) || 0,
      });

      kitchenSheet.addRow({
        date: sanitizeSpreadsheetValue(a.date),
        b: Number(a.breakfastCount) || 0,
        l: Number(a.lunchCount) || 0,
        d: Number(a.dinnerCount) || 0,
      });

      deliverySheet.addRow({
        date: sanitizeSpreadsheetValue(a.date),
        t: Number(a.totalDeliveries) || 0,
        c: Number(a.completedDeliveries) || 0,
        f: Number(a.failedDeliveries) || 0,
      });

      analyticsRowsCount++;
    }

    // 2. Generate complete in-memory buffer
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const sizeBytes = buffer.byteLength;

    // 3. Upload to Cloud Storage
    const destination = `reports/monthly_export_${targetMonth}.xlsx`;
    logger.info(`[reportService] Uploading monthly report (${sizeBytes} bytes) to ${destination}...`);

    const bucket = this.getStorageBucket();
    const file = bucket.file(destination);

    await file.save(buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      resumable: false,
      metadata: {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        metadata: {
          reportMonth: targetMonth,
          sizeBytes: sizeBytes.toString(),
          customersCount: customersCount.toString(),
          ordersCount: ordersCount.toString(),
          paymentsCount: paymentsCount.toString(),
        },
      },
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      `[reportService] Monthly Excel Export uploaded to ${destination} in ${durationMs}ms`,
    );

    return {
      success: true,
      destination,
      targetMonth,
      sheets: {
        customers: customersCount,
        orders: ordersCount,
        subscriptions: subsCount,
        payments: paymentsCount,
        revenue: analyticsRowsCount,
        kitchen: analyticsRowsCount,
        delivery: analyticsRowsCount,
      },
      sizeBytes,
      durationMs,
    };
  }
}

export const backendReportService = new BackendReportService();
