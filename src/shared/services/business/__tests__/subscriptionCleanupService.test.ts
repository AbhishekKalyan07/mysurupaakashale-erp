import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscriptionCleanupService } from "../subscriptionCleanupService";
import { subscriptionRepository } from "../../firestore/subscriptionRepository";
import { userRepository } from "../../firestore/userRepository";

vi.mock("@/shared/lib/firebase", () => ({
  db: {
    app: { options: { projectId: "mysuru-paakashale-erp" } },
  },
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: vi.fn((db, path, ...segments) => ({ db, path, segments })),
    doc: vi.fn((db, path, id) => ({ db, path, id })),
    query: vi.fn((col, ...filters) => ({ ...col, filters })),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "admin", isActive: true, customer: 1 }),
    }),
  };
});

describe("Remediated Subscription Cleanup Audit Service Tests", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.VITE_FIREBASE_PROJECT_ID = "mysuru-paakashale-erp";
    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockReset().mockResolvedValue({ size: 0, docs: [] } as any);
    vi.mocked(firestore.getDoc).mockReset().mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "admin", isActive: true, customer: 1 }),
    } as any);
  });

  // 1. Invoice/history query failure aborts audit or marks it failed
  it("1. aborts audit or marks it failed when historical invoice query throws an error", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_orphan_1",
        customerId: "cust_missing_1",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
      const path = q?.path || q?.segments?.[0] || "";
      if (path === "invoices") {
        throw new Error("Firestore index or permission error reading invoices");
      }
      return { size: 0, docs: [] } as any;
    });

    // In default strict mode: throws safety abort
    await expect(
      subscriptionCleanupService.auditOrphanSubscriptions({
        targetProjectId: "mysuru-paakashale-erp",
        strictAbortOnError: true,
      }),
    ).rejects.toThrow("Safety abort: Failed to query invoices");

    // In non-strict mode: marks record AUDIT_FAILED with historyVerified: false
    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
      strictAbortOnError: false,
    });

    expect(report.totals.auditFailures).toBe(1);
    expect(report.details[0].classification).toBe("AUDIT_FAILED");
    expect(report.details[0].historyVerified).toBe(false);
    expect(report.details[0].proposedAction).toBe("RETAIN_FOR_AUDIT");
    expect(report.orphanFindings).toEqual([]);
  });

  // 2. An order/history query failure cannot create a deletion candidate
  it("2. never classifies an orphan with order query failure as an unencumbered orphan", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_orphan_2",
        customerId: "cust_missing_2",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
      const path = q?.path || q?.segments?.[0] || "";
      if (path === "orders") {
        throw new Error("Network timeout while querying orders collection");
      }
      return { size: 0, docs: [] } as any;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
      strictAbortOnError: false,
    });

    expect(report.details[0].classification).toBe("AUDIT_FAILED");
    expect(report.details[0].historyVerified).toBe(false);
    expect(report.details[0].proposedAction).toBe("RETAIN_FOR_AUDIT");
    expect(report.orphanFindings).toEqual([]);
  });

  // 3. Customer lookup network or authorization error cannot be treated as missing customer
  it("3. aborts or marks audit failed when customer profile lookup throws an error", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_err",
        customerId: "cust_network_err",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockRejectedValue(
      new Error("Firestore connection reset by peer"),
    );

    // In default strict mode: throws safety abort
    await expect(
      subscriptionCleanupService.auditOrphanSubscriptions({
        targetProjectId: "mysuru-paakashale-erp",
        strictAbortOnError: true,
      }),
    ).rejects.toThrow("Safety abort: Customer lookup failed");

    // In non-strict mode: isCustomerMissing is NOT true, customerLookupStatus is LOOKUP_FAILED
    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
      strictAbortOnError: false,
    });

    expect(report.details[0].isCustomerMissing).toBe(false);
    expect(report.details[0].customerLookupStatus).toBe("LOOKUP_FAILED");
    expect(report.details[0].classification).toBe("AUDIT_FAILED");
    expect(report.details[0].proposedAction).toBe("RETAIN_FOR_AUDIT");
  });

  // 4. Verified missing customer is distinguishable from lookup failure
  it("4. distinguishes verified null customer document from customer lookup exception", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_confirmed_orphan",
        customerId: "cust_confirmed_missing",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockResolvedValue({ size: 0, docs: [] } as any);

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.details[0].customerLookupStatus).toBe("CONFIRMED_MISSING");
    expect(report.details[0].isCustomerMissing).toBe(true);
    expect(report.details[0].classification).toBe("CONFIRMED_ORPHAN_NO_HISTORY");
    expect(report.orphanFindings).toEqual(["sub_confirmed_orphan"]);
  });

  // 5. Missing expected project ID causes safe abort
  it("5. strictly aborts if targetProjectId is omitted or empty", async () => {
    await expect(
      subscriptionCleanupService.auditOrphanSubscriptions({} as any),
    ).rejects.toThrow("Safety abort: An explicit targetProjectId is required");

    await expect(
      subscriptionCleanupService.auditOrphanSubscriptions({ targetProjectId: "   " }),
    ).rejects.toThrow("Safety abort: An explicit targetProjectId is required");
  });

  // 6. Project mismatch causes safe abort
  it("6. strictly aborts if targetProjectId does not match active environment", async () => {
    await expect(
      subscriptionCleanupService.auditOrphanSubscriptions({
        targetProjectId: "wrong-project-name",
      }),
    ).rejects.toThrow("Safety abort: Target project ID mismatch");
  });

  // 7. Successful empty history query is distinguished from unsuccessful query
  it("7. marks historyVerified=true only when all queries succeed with size 0", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_clean_orphan",
        customerId: "cust_missing",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockResolvedValue({ size: 0, docs: [] } as any);

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.details[0].historyVerified).toBe(true);
    expect(report.details[0].orderCount).toBe(0);
    expect(report.details[0].invoiceCount).toBe(0);
    expect(report.details[0].classification).toBe("CONFIRMED_ORPHAN_NO_HISTORY");
    expect(report.details[0].proposedAction).toBe(
      "PROPOSED_FOR_SEPARATE_CANCELLATION_REVIEW",
    );
  });

  // 8. Subscriptions with history are retained for review
  it("8. retains orphan subscriptions with verified history and flags policy decision", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_with_orders",
        customerId: "cust_missing",
        status: "cancelled",
        planId: "p1",
        startDate: "2026-09-01",
      } as any,
    ]);
    vi.spyOn(userRepository, "getById").mockResolvedValue(null);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
      const path = q?.path || q?.segments?.[0] || "";
      if (path === "orders") {
        return { size: 3, docs: [{ ref: { id: "ord1" } }] } as any;
      }
      return { size: 0, docs: [] } as any;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.totals.orphanedWithHistory).toBe(1);
    expect(report.details[0].classification).toBe("ORPHAN_WITH_HISTORICAL_RECORDS");
    expect(report.details[0].proposedAction).toBe("RETAIN_FOR_AUDIT");
    expect(report.details[0].orderCount).toBe(3);
    expect(report.decisionPoints.length).toBe(1);
    expect(report.orphanFindings).toEqual([]);
  });

  // 9. There is no destructive subscription deletion path in the audit tool
  it("9. confirms there are no delete operations or executeCleanup method in the service", () => {
    expect((subscriptionCleanupService as any).executeCleanup).toBeUndefined();
    expect((subscriptionCleanupService as any).deleteSubscription).toBeUndefined();
  });

  // 10. Existing admin, staff, automation, settings, customer-counter safeguards remain intact
  it("10. excludes admin, staff, and automation accounts from being marked as orphans", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_admin",
        customerId: "admin_user_1",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
      {
        id: "sub_automation",
        customerId: "automation-service-account",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);

    vi.spyOn(userRepository, "getById").mockImplementation(async (id: string) => {
      if (id === "admin_user_1") {
        return { id: "admin_user_1", role: "admin", fullName: "Admin User" } as any;
      }
      if (id === "automation-service-account") {
        return { id: "automation-service-account", role: "admin", fullName: "Automation" } as any;
      }
      return null;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.totals.orphanedSubscriptions).toBe(0);
    expect(report.totals.validSubscriptions).toBe(2);
    expect(report.details.every((d) => d.classification === "EXCLUDED_SYSTEM_ACCOUNT")).toBe(true);
    expect(report.details.every((d) => d.proposedAction === "NO_ACTION")).toBe(true);
  });

  // 11. Delivery address resolution check
  it("11. verifies delivery address resolution during audit", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([
      {
        id: "sub_with_addr",
        customerId: "cust_with_addr",
        status: "active",
        planId: "p1",
        deliveryAddressId: "addr_1",
        startDate: "2026-10-01",
      } as any,
      {
        id: "sub_no_addr",
        customerId: "cust_no_addr",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
      {
        id: "sub_orphan_addr",
        customerId: "cust_missing_addr",
        status: "active",
        planId: "p1",
        startDate: "2026-10-01",
      } as any,
    ]);

    vi.spyOn(userRepository, "getById").mockImplementation(async (id: string) => {
      if (id === "cust_with_addr") {
        return {
          id: "cust_with_addr",
          role: "customer",
          addresses: [{ id: "addr_1", street: "123 Main St", pincode: "570001" }],
        } as any;
      }
      if (id === "cust_no_addr") {
        return {
          id: "cust_no_addr",
          role: "customer",
          addresses: [],
        } as any;
      }
      return null;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    const withAddr = report.details.find((d) => d.subscriptionId === "sub_with_addr");
    const noAddr = report.details.find((d) => d.subscriptionId === "sub_no_addr");
    const orphanAddr = report.details.find((d) => d.subscriptionId === "sub_orphan_addr");

    expect(withAddr?.addressResolves).toBe(true);
    expect(noAddr?.addressResolves).toBe(false);
    expect(orphanAddr?.addressResolves).toBe(false);
  });

  // 12. Phone registry audit with safe masking
  it("12. audits /userPhones registry and safely masks phone numbers", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([]);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
      const path = q?.path || q?.segments?.[0] || "";
      if (path === "userPhones") {
        return {
          size: 2,
          docs: [
            {
              id: "+919876543210",
              data: () => ({ uid: "cust_missing_phone" }),
            },
            {
              id: "+919123456789",
              data: () => ({ uid: "cust_existing" }),
            },
          ],
        } as any;
      }
      return { size: 0, docs: [] } as any;
    });

    vi.spyOn(userRepository, "getById").mockImplementation(async (id: string) => {
      if (id === "cust_existing") {
        return { id: "cust_existing", role: "customer" } as any;
      }
      return null;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.totals.orphanedPhoneCount).toBe(1);
    expect(report.orphanedPhoneEntries).toHaveLength(1);
    expect(report.orphanedPhoneEntries[0].maskedPhone).toBe("******3210");
    expect(report.orphanedPhoneEntries[0].referencedUid).toBe("cust_missing_phone");
    expect(report.orphanedPhoneEntries[0].isCustomerMissing).toBe(true);

    // Critical privacy invariant: Full phone number MUST NOT appear in markdown summary
    expect(report.markdownSummary).not.toContain("+919876543210");
    expect(report.markdownSummary).not.toContain("+919123456789");
    expect(report.markdownSummary).toContain("******3210");
  });

  // 13. System health checks for automation user and settings
  it("13. verifies system health checks on /users/automation-service-account and /settings", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([]);

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
    });

    expect(report.systemHealth.automationAccountStatus).toBe("VERIFIED");
    expect(report.systemHealth.businessSettingsStatus).toBe("VERIFIED");
    expect(report.systemHealth.userCountersStatus).toBe("VERIFIED");
    expect(report.markdownSummary).toContain("System Health & Identity Preflight");
  });

  // 14. Inactive automation user is reported as health defect without mutating the document
  it("14. detects inactive automation account during health check without writing or repairing", async () => {
    vi.spyOn(subscriptionRepository, "list").mockResolvedValue([]);

    const firestore = await import("firebase/firestore");
    vi.mocked(firestore.getDoc).mockImplementation(async (docRef: any) => {
      const id = docRef?.id || docRef?.segments?.[1] || "";
      if (id === "automation-service-account") {
        return {
          exists: () => true,
          data: () => ({ role: "admin", isActive: false }),
        } as any;
      }
      return {
        exists: () => true,
        data: () => ({ customer: 1 }),
      } as any;
    });

    const report = await subscriptionCleanupService.auditOrphanSubscriptions({
      targetProjectId: "mysuru-paakashale-erp",
      strictAbortOnError: false,
    });

    expect(report.systemHealth.automationAccountStatus).toBe("INACTIVE");
    expect(report.systemHealth.automationAccountError).toContain("is inactive");
    // Service contains no write/repair calls
    expect((subscriptionCleanupService as any).repairAutomationAccount).toBeUndefined();
    expect((subscriptionCleanupService as any).executeCleanup).toBeUndefined();
  });
});
