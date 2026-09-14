process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-test";
import { vi, describe, it, expect, afterEach, beforeAll } from "vitest";
import { initTestApp, getFirestore, getStorage } from "../../functions/src/test-init";
import ExcelJS from "exceljs";


initTestApp();
const db = getFirestore();


import {
  backendReportService,
  getPreviousMonth,
  getMonthBoundaries,
  sanitizeSpreadsheetValue as backendSanitizer,
} from "../../functions/src/services/reportService";
import { sanitizeSpreadsheetValue as clientSanitizer } from "../../src/shared/utils/spreadsheet";
import {
  backendCleanupService,
  getCleanupCutoff,
  Timestamp,
} from "../../functions/src/services/cleanupService";
import { backendBackupService } from "../../functions/src/services/backupService";
import { runMonthlyMaintenance } from "../../functions/src/scheduled/monthlyMaintenance";


describe("trusted backend monthly maintenance", () => {
  const testRunId = `test_mm_${Date.now()}`;
  const bucketName = "demo-test.appspot.com";
  const storageBucket = getStorage().bucket(bucketName);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("A. Previous-Month & Month Boundary Resolution", () => {
    it("correctly resolves previous month across standard, 30/31-day, leap year, and year transitions", () => {
      // 1. Year boundary: Jan 1 2027 -> Dec 2026
      const jan2027 = new Date("2027-01-01T00:00:00.000Z");
      expect(getPreviousMonth(jan2027, "Asia/Kolkata")).toEqual({
        year: 2026,
        month: 12,
        monthString: "2026-12",
      });

      // 2. Standard boundary: Oct 1 2026 -> Sep 2026 (30-day month)
      const oct2026 = new Date("2026-10-01T00:00:00.000Z");
      expect(getPreviousMonth(oct2026, "Asia/Kolkata")).toEqual({
        year: 2026,
        month: 9,
        monthString: "2026-09",
      });

      // 3. Post-February boundary: Mar 1 2026 -> Feb 2026 (28 days)
      const mar2026 = new Date("2026-03-01T00:00:00.000Z");
      expect(getPreviousMonth(mar2026, "Asia/Kolkata")).toEqual({
        year: 2026,
        month: 2,
        monthString: "2026-02",
      });

      // 4. Leap-year February: Mar 1 2024 -> Feb 2024 (29 days)
      const mar2024 = new Date("2024-03-01T00:00:00.000Z");
      expect(getPreviousMonth(mar2024, "Asia/Kolkata")).toEqual({
        year: 2024,
        month: 2,
        monthString: "2024-02",
      });

      // 5. Post-31-day month: Aug 1 2026 -> Jul 2026
      const aug2026 = new Date("2026-08-01T00:00:00.000Z");
      expect(getPreviousMonth(aug2026, "Asia/Kolkata")).toEqual({
        year: 2026,
        month: 7,
        monthString: "2026-07",
      });
    });

    it("calculates accurate month boundary strings and timestamps", () => {
      const b9 = getMonthBoundaries("2026-09");
      expect(b9.startDateStr).toBe("2026-09-01");
      expect(b9.nextMonthDateStr).toBe("2026-10-01");

      const b12 = getMonthBoundaries("2026-12");
      expect(b12.startDateStr).toBe("2026-12-01");
      expect(b12.nextMonthDateStr).toBe("2027-01-01");

      expect(() => getMonthBoundaries("invalid")).toThrow(/Invalid targetMonth/);
    });
  });

  describe("B. Monthly Excel Report & Sheet Parity", () => {
    const targetMonth = "2026-08";

    it("generates all 7 canonical sheets with exact column headers and accurate data filtering", async () => {
      // 1. Seed Customer
      const custId = `${testRunId}_cust`;
      await db.collection("users").doc(custId).set({
        role: "customer",
        firstName: "Ramesh",
        lastName: "Babu",
        email: "ramesh@example.com",
        phone: "9876543210",
      });

      // 2. Seed Orders (Target month vs Out-of-bounds month)
      const inMonthOrderId = `${testRunId}_ord_in`;
      const outMonthOrderId = `${testRunId}_ord_out`;

      await db.collection("orders").doc(inMonthOrderId).set({
        date: "2026-08-15",
        mealType: "lunch",
        status: "delivered",
        price: 150,
      });
      await db.collection("orders").doc(outMonthOrderId).set({
        date: "2026-09-05", // September (excluded)
        mealType: "dinner",
        status: "delivered",
        price: 200,
      });

      // 3. Seed Subscription
      const subId = `${testRunId}_sub`;
      await db.collection("subscriptions").doc(subId).set({
        customerId: custId,
        planTier: "premium",
        status: "active",
      });

      // 4. Seed Payments (In month vs Out of month)
      const inPayId = `${testRunId}_pay_in`;
      const outPayId = `${testRunId}_pay_out`;

      await db.collection("payments").doc(inPayId).set({
        customerId: custId,
        amount: 3000,
        status: "verified",
        date: "2026-08-10",
        createdAt: new Date("2026-08-10T10:00:00.000Z"),
      });
      await db.collection("payments").doc(outPayId).set({
        customerId: custId,
        amount: 4000,
        status: "verified",
        date: "2026-09-02",
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
      });

      // 5. Seed Analytics for target month
      const analyticsId = `${testRunId}_analytics_2026-08-15`;
      await db.collection("analytics").doc(analyticsId).set({
        date: "2026-08-15",
        totalRevenue: 5000,
        cashPayments: 1000,
        onlinePayments: 4000,
        breakfastCount: 20,
        lunchCount: 30,
        dinnerCount: 25,
        totalDeliveries: 75,
        completedDeliveries: 70,
        failedDeliveries: 5,
      });

      // Run Excel generation
      const result = await backendReportService.generateMonthlyExcel(targetMonth);
      expect(result.success).toBe(true);
      expect(result.destination).toBe(`reports/monthly_export_${targetMonth}.xlsx`);
      expect(result.targetMonth).toBe(targetMonth);

      // Download and parse workbook with ExcelJS
      const file = storageBucket.file(result.destination);
      const [buffer] = await file.download();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // -----------------------------------------------------------------
      // Check 1: Customers sheet
      // -----------------------------------------------------------------
      const custSheet = workbook.getWorksheet("Customers");
      expect(custSheet).toBeDefined();
      expect(custSheet?.getRow(1).getCell(1).value).toBe("ID");
      expect(custSheet?.getRow(1).getCell(2).value).toBe("Name");
      expect(custSheet?.getRow(1).getCell(3).value).toBe("Email");
      expect(custSheet?.getRow(1).getCell(4).value).toBe("Phone");

      let foundCustomer = false;
      const custRowCount = custSheet?.rowCount ?? 0;
      for (let r = 2; r <= custRowCount; r++) {
        const row = custSheet?.getRow(r);
        if (row && row.getCell(1).value === custId) {
          foundCustomer = true;
          expect(row.getCell(2).value).toBe("Ramesh Babu");
          expect(row.getCell(3).value).toBe("ramesh@example.com");
          expect(row.getCell(4).value).toBe("9876543210");
        }
      }
      expect(foundCustomer).toBe(true);

      // -----------------------------------------------------------------
      // Check 2: Orders sheet (Month Isolation)
      // -----------------------------------------------------------------
      const ordSheet = workbook.getWorksheet("Orders");
      expect(ordSheet).toBeDefined();
      expect(ordSheet?.getRow(1).getCell(1).value).toBe("ID");
      expect(ordSheet?.getRow(1).getCell(2).value).toBe("Date");
      expect(ordSheet?.getRow(1).getCell(3).value).toBe("Meal Type");
      expect(ordSheet?.getRow(1).getCell(4).value).toBe("Status");
      expect(ordSheet?.getRow(1).getCell(5).value).toBe("Price");

      let foundInOrder = false;
      let foundOutOrder = false;
      const ordRowCount = ordSheet?.rowCount ?? 0;
      for (let r = 2; r <= ordRowCount; r++) {
        const row = ordSheet?.getRow(r);
        if (row) {
          if (row.getCell(1).value === inMonthOrderId) foundInOrder = true;
          if (row.getCell(1).value === outMonthOrderId) foundOutOrder = true;
        }
      }
      expect(foundInOrder).toBe(true);
      expect(foundOutOrder).toBe(false); // Verified: out-of-month order excluded

      // -----------------------------------------------------------------
      // Check 3: Subscriptions sheet
      // -----------------------------------------------------------------
      const subSheet = workbook.getWorksheet("Subscriptions");
      expect(subSheet).toBeDefined();
      expect(subSheet?.getRow(1).getCell(1).value).toBe("ID");
      expect(subSheet?.getRow(1).getCell(2).value).toBe("Customer ID");
      expect(subSheet?.getRow(1).getCell(3).value).toBe("Plan Tier");
      expect(subSheet?.getRow(1).getCell(4).value).toBe("Status");

      let foundSub = false;
      const subRowCount = subSheet?.rowCount ?? 0;
      for (let r = 2; r <= subRowCount; r++) {
        const row = subSheet?.getRow(r);
        if (row && row.getCell(1).value === subId) {
          foundSub = true;
          expect(row.getCell(2).value).toBe(custId);
          expect(row.getCell(3).value).toBe("premium");
          expect(row.getCell(4).value).toBe("active");
        }
      }
      expect(foundSub).toBe(true);

      // -----------------------------------------------------------------
      // Check 4: Payments sheet (Month Isolation)
      // -----------------------------------------------------------------
      const paySheet = workbook.getWorksheet("Payments");
      expect(paySheet).toBeDefined();
      expect(paySheet?.getRow(1).getCell(1).value).toBe("ID");
      expect(paySheet?.getRow(1).getCell(2).value).toBe("Customer ID");
      expect(paySheet?.getRow(1).getCell(3).value).toBe("Amount");
      expect(paySheet?.getRow(1).getCell(4).value).toBe("Status");
      expect(paySheet?.getRow(1).getCell(5).value).toBe("Date");

      let foundInPay = false;
      let foundOutPay = false;
      const payRowCount = paySheet?.rowCount ?? 0;
      for (let r = 2; r <= payRowCount; r++) {
        const row = paySheet?.getRow(r);
        if (row) {
          if (row.getCell(1).value === inPayId) foundInPay = true;
          if (row.getCell(1).value === outPayId) foundOutPay = true;
        }
      }
      expect(foundInPay).toBe(true);
      expect(foundOutPay).toBe(false); // Verified: out-of-month payment excluded

      // -----------------------------------------------------------------
      // Check 5: Revenue sheet
      // -----------------------------------------------------------------
      const revSheet = workbook.getWorksheet("Revenue");
      expect(revSheet).toBeDefined();
      expect(revSheet?.getRow(1).getCell(1).value).toBe("Date");
      expect(revSheet?.getRow(1).getCell(2).value).toBe("Revenue");
      expect(revSheet?.getRow(1).getCell(3).value).toBe("Cash");
      expect(revSheet?.getRow(1).getCell(4).value).toBe("Online");

      // -----------------------------------------------------------------
      // Check 6: Kitchen Reports sheet
      // -----------------------------------------------------------------
      const kitchenSheet = workbook.getWorksheet("Kitchen Reports");
      expect(kitchenSheet).toBeDefined();
      expect(kitchenSheet?.getRow(1).getCell(1).value).toBe("Date");
      expect(kitchenSheet?.getRow(1).getCell(2).value).toBe("Breakfast");
      expect(kitchenSheet?.getRow(1).getCell(3).value).toBe("Lunch");
      expect(kitchenSheet?.getRow(1).getCell(4).value).toBe("Dinner");

      // -----------------------------------------------------------------
      // Check 7: Delivery Reports sheet
      // -----------------------------------------------------------------
      const delSheet = workbook.getWorksheet("Delivery Reports");
      expect(delSheet).toBeDefined();
      expect(delSheet?.getRow(1).getCell(1).value).toBe("Date");
      expect(delSheet?.getRow(1).getCell(2).value).toBe("Total");
      expect(delSheet?.getRow(1).getCell(3).value).toBe("Completed");
      expect(delSheet?.getRow(1).getCell(4).value).toBe("Failed");
    });

    it("sanitizes user-controlled formula injection strings while preserving numeric/date types", async () => {
      // Verify parity between backend and client sanitizers
      const dangerousInputs = [
        "=SUM(A1:B10)",
        "+cmd|' /C calc'!A0",
        "-1234@calc",
        "@SUM(1,2)",
        "   =DANGEROUS",
      ];
      for (const input of dangerousInputs) {
        const backendOut = backendSanitizer(input);
        const clientOut = clientSanitizer(input);
        expect(backendOut).toBe(clientOut);
        expect(backendOut.startsWith("'")).toBe(true);
      }

      // Safe values preserved without single quote
      expect(backendSanitizer(12345)).toBe(12345);
      expect(backendSanitizer(true)).toBe(true);
      expect(backendSanitizer(null)).toBeNull();
      expect(backendSanitizer("Safe String")).toBe("Safe String");
    });
  });

  describe("C. 90-Day Retention Cleanup & Batch Operations", () => {
    it("deletes records strictly older than 90 days across collections while preserving newer and boundary records", async () => {
      const fixedNow = new Date("2026-09-14T00:00:00.000Z");
      const { cutoffDateStr } = getCleanupCutoff(90, fixedNow, "Asia/Kolkata"); // 90 days before fixedNow (2026-06-16)

      const oldDate = "2026-06-10"; // < cutoff (older than 90 days -> delete)
      const boundaryDate = cutoffDateStr; // == cutoff (exactly 90 days old -> preserve)
      const newDate = "2026-07-01"; // > cutoff (newer -> preserve)

      // 1. Seed OrderGenerationRuns
      const oldRunId = `${testRunId}_run_old`;
      const boundRunId = `${testRunId}_run_bound`;
      const newRunId = `${testRunId}_run_new`;

      await db.collection("orderGenerationRuns").doc(oldRunId).set({ date: oldDate });
      await db.collection("orderGenerationRuns").doc(boundRunId).set({ date: boundaryDate });
      await db.collection("orderGenerationRuns").doc(newRunId).set({ date: newDate });

      // 2. Seed Analytics
      const oldAnalyticsId = `${testRunId}_an_old`;
      const boundAnalyticsId = `${testRunId}_an_bound`;
      const newAnalyticsId = `${testRunId}_an_new`;

      await db.collection("analytics").doc(oldAnalyticsId).set({ date: oldDate, totalRevenue: 100 });
      await db.collection("analytics").doc(boundAnalyticsId).set({ date: boundaryDate, totalRevenue: 200 });
      await db.collection("analytics").doc(newAnalyticsId).set({ date: newDate, totalRevenue: 300 });

      // 3. Seed AuditLogs (Timestamp)
      const oldAuditId = `${testRunId}_audit_old`;
      const newAuditId = `${testRunId}_audit_new`;

      const oldTimestamp = new Date(fixedNow.getTime() - 95 * 86400000);
      const newTimestamp = new Date(fixedNow.getTime() - 40 * 86400000);

      await db.collection("auditLogs").doc(oldAuditId).set({
        action: "UPDATE",
        timestamp: Timestamp.fromDate(oldTimestamp),
      });
      await db.collection("auditLogs").doc(newAuditId).set({
        action: "UPDATE",
        timestamp: Timestamp.fromDate(newTimestamp),
      });

      // Execute cleanup
      const result = await backendCleanupService.cleanupOldLogs(90, fixedNow);
      expect(result.success).toBe(true);
      expect(result.deletedRuns).toBeGreaterThanOrEqual(1);
      expect(result.deletedAnalytics).toBeGreaterThanOrEqual(1);
      expect(result.deletedAuditLogs).toBeGreaterThanOrEqual(1);

      // Verify deletions:
      // Old records must be deleted
      const oldRunSnap = await db.collection("orderGenerationRuns").doc(oldRunId).get();
      expect(oldRunSnap.exists).toBe(false);

      const oldAnalyticsSnap = await db.collection("analytics").doc(oldAnalyticsId).get();
      expect(oldAnalyticsSnap.exists).toBe(false);

      const oldAuditSnap = await db.collection("auditLogs").doc(oldAuditId).get();
      expect(oldAuditSnap.exists).toBe(false);

      // Boundary and newer records must be preserved
      const boundRunSnap = await db.collection("orderGenerationRuns").doc(boundRunId).get();
      expect(boundRunSnap.exists).toBe(true);

      const newRunSnap = await db.collection("orderGenerationRuns").doc(newRunId).get();
      expect(newRunSnap.exists).toBe(true);

      const boundAnalyticsSnap = await db.collection("analytics").doc(boundAnalyticsId).get();
      expect(boundAnalyticsSnap.exists).toBe(true);

      const newAuditSnap = await db.collection("auditLogs").doc(newAuditId).get();
      expect(newAuditSnap.exists).toBe(true);
    });

    it("handles records with missing timestamp/date safely without deleting them", async () => {
      const missingDateId = `${testRunId}_missing_date`;
      await db.collection("orderGenerationRuns").doc(missingDateId).set({
        status: "completed",
        // date intentionally omitted
      });

      await backendCleanupService.cleanupOldLogs(90);

      // Must NOT be deleted because < query operator does not match missing fields
      const snap = await db.collection("orderGenerationRuns").doc(missingDateId).get();
      expect(snap.exists).toBe(true);
    });
  });

  describe("D. Pipeline Orchestration, Error Propagation & Retry Safety", () => {
    it("executes all 3 stages in order (backup -> report -> cleanup) and returns structured result", async () => {
      const executionOrder: string[] = [];

      vi.spyOn(backendBackupService, "exportDatabaseBackup").mockImplementation(async () => {
        executionOrder.push("backup");
        return {
          success: true,
          destination: "backups/test.json",
          timestamp: "test",
          collections: {},
          totalDocuments: 10,
          sizeBytes: 500,
          durationMs: 10,
        };
      });

      vi.spyOn(backendReportService, "generateMonthlyExcel").mockImplementation(async () => {
        executionOrder.push("report");
        return {
          success: true,
          destination: "reports/test.xlsx",
          targetMonth: "2026-08",
          sheets: { customers: 1, orders: 1, subscriptions: 1, payments: 1, revenue: 1, kitchen: 1, delivery: 1 },
          sizeBytes: 1000,
          durationMs: 20,
        };
      });

      vi.spyOn(backendCleanupService, "cleanupOldLogs").mockImplementation(async () => {
        executionOrder.push("cleanup");
        return {
          success: true,
          deletedRuns: 1,
          deletedAnalytics: 1,
          deletedAuditLogs: 1,
          totalDeleted: 3,
          cutoffDateStr: "2026-06-16",
          durationMs: 15,
        };
      });

      const result = await runMonthlyMaintenance({ targetMonth: "2026-08" });

      expect(executionOrder).toEqual(["backup", "report", "cleanup"]);
      expect(result.targetMonth).toBe("2026-08");
      expect(result.stages.backup.success).toBe(true);
      expect(result.stages.report.success).toBe(true);
      expect(result.stages.cleanup.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("fails fast and propagates error if backup stage fails", async () => {
      vi.spyOn(backendBackupService, "exportDatabaseBackup").mockRejectedValueOnce(
        new Error("Storage service unavailable during backup"),
      );

      await expect(
        runMonthlyMaintenance({ targetMonth: "2026-08" }),
      ).rejects.toThrow("Storage service unavailable during backup");
    });

    it("fails fast and propagates error if Excel report stage fails", async () => {
      vi.spyOn(backendBackupService, "exportDatabaseBackup").mockResolvedValueOnce({
        success: true,
        destination: "backups/test.json",
        timestamp: "test",
        collections: {},
        totalDocuments: 0,
        sizeBytes: 0,
        durationMs: 0,
      });

      vi.spyOn(backendReportService, "generateMonthlyExcel").mockRejectedValueOnce(
        new Error("Workbook serialization failure"),
      );

      await expect(
        runMonthlyMaintenance({ targetMonth: "2026-08" }),
      ).rejects.toThrow("Workbook serialization failure");
    });

    it("repeated executions for the same target month write deterministic valid outputs without side effects", async () => {
      const targetMonth = "2026-07";
      const timestampOverride = `${testRunId}_repeat_safe`;

      // 1. First run
      const res1 = await runMonthlyMaintenance({
        targetMonth,
        timestampOverride,
        retentionDays: 90,
      });
      expect(res1.stages.report.destination).toBe(`reports/monthly_export_${targetMonth}.xlsx`);

      // 2. Second run (retry)
      const res2 = await runMonthlyMaintenance({
        targetMonth,
        timestampOverride,
        retentionDays: 90,
      });
      expect(res2.stages.report.destination).toBe(res1.stages.report.destination);

      // Verify that the Excel workbook in storage is intact and valid
      const file = storageBucket.file(res2.stages.report.destination);
      const [buffer] = await file.download();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBe(7);
    });
  });
});
