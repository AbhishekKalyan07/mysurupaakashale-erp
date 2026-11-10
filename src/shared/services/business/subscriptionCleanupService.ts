import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { subscriptionRepository } from "../firestore/subscriptionRepository";
import { userRepository } from "../firestore/userRepository";
import type { Subscription } from "@/shared/types";

export type OrphanClassification =
  | "CONFIRMED_ORPHAN_NO_HISTORY"
  | "ORPHAN_WITH_HISTORICAL_RECORDS"
  | "AUDIT_FAILED"
  | "VALID_SUBSCRIBER"
  | "EXCLUDED_SYSTEM_ACCOUNT";

export type ProposedAuditAction =
  | "PROPOSED_FOR_SEPARATE_CANCELLATION_REVIEW"
  | "RETAIN_FOR_AUDIT"
  | "NO_ACTION";

export interface OrphanSubscriptionAuditItem {
  subscriptionId: string;
  status: Subscription["status"];
  planId: string;
  startDate: string;
  endDate?: string | null;
  isCustomerMissing: boolean;
  customerLookupStatus: "CONFIRMED_EXISTS" | "CONFIRMED_MISSING" | "LOOKUP_FAILED";
  addressResolves: boolean;
  isStaffOrAdminReferenced: boolean;
  historyVerified: boolean;
  historyAuditError?: string;
  skipCount: number;
  orderCount: number;
  deliveryCount: number;
  invoiceCount: number;
  paymentCount: number;
  classification: OrphanClassification;
  proposedAction: ProposedAuditAction;
  policyDecisionRequired?: string;
}

export interface OrphanPhoneAuditItem {
  maskedPhone: string;
  referencedUid: string;
  isCustomerMissing: boolean;
}

export interface SystemHealthReport {
  automationAccountStatus: "VERIFIED" | "MISSING" | "INVALID_ROLE" | "INACTIVE" | "READ_FAILED" | "NOT_CHECKED";
  automationAccountError?: string;
  businessSettingsStatus: "VERIFIED" | "MISSING" | "READ_FAILED" | "NOT_CHECKED";
  businessSettingsError?: string;
  userCountersStatus: "VERIFIED" | "MISSING" | "INVALID_VALUE" | "READ_FAILED" | "NOT_CHECKED";
  userCountersError?: string;
}

export interface OrphanSubscriptionAuditReport {
  timestamp: string;
  targetProjectId: string;
  isDryRun: true;
  totals: {
    scannedSubscriptions: number;
    validSubscriptions: number;
    orphanedSubscriptions: number;
    orphanedByStatus: {
      active: number;
      paused: number;
      cancelled: number;
      pending_payment: number;
      draft: number;
    };
    orphanedWithHistory: number;
    orphanedWithoutHistory: number;
    auditFailures: number;
    orphanedPhoneCount: number;
  };
  systemHealth: SystemHealthReport;
  orphanedPhoneEntries: OrphanPhoneAuditItem[];
  details: OrphanSubscriptionAuditItem[];
  decisionPoints: string[];
  orphanFindings: string[];
  markdownSummary: string;
}

export interface AuditOptions {
  targetProjectId: string;
  dryRun?: boolean;
  strictAbortOnError?: boolean;
  checkPhoneRegistry?: boolean;
  checkSystemHealth?: boolean;
}

/**
 * Masks a phone number so only the last 4 digits are visible, preserving privacy.
 */
export function maskPhoneNumber(phone: string): string {
  const trimmed = String(phone || "").trim();
  if (trimmed.length <= 4) return "***";
  const lastFour = trimmed.slice(-4);
  return `******${lastFour}`;
}

/**
 * Strictly read-only audit service for identifying orphaned subscriptions
 * whose referenced customer profiles or historical records require administrative review.
 *
 * SAFETY INVARIANT: This service contains ZERO destructive paths or delete operations.
 * Subscriptions, customer records, phone entries, and historical records are NEVER modified or deleted.
 */
export class SubscriptionCleanupService {
  /**
   * Resolves the current target Firebase project ID from active environment or Firebase configuration.
   */
  getCurrentProjectId(): string {
    const firestoreProjectId = String(
      (db as any)?.app?.options?.projectId || "",
    ).trim();
    const envProjectId = String(
      process.env.VITE_FIREBASE_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        "",
    ).trim();

    if (firestoreProjectId && envProjectId && firestoreProjectId !== envProjectId) {
      throw new Error(
        `[SubscriptionCleanupService] Project mismatch: Connected Firestore project ID '${firestoreProjectId}' disagrees with configured environment project ID '${envProjectId}'.`,
      );
    }

    return firestoreProjectId || envProjectId;
  }

  /**
   * Performs a strictly read-only audit of all subscriptions, phone registries, and system health in Firestore.
   *
   * Safety requirements:
   * 1. Requires an explicit targetProjectId argument.
   * 2. Asserts targetProjectId matches the active Firebase environment.
   * 3. Customer lookup errors trigger an immediate abort or audit failure (never assumed missing).
   * 4. History query errors trigger an immediate abort or audit failure (never assumed zero).
   * 5. Checks address resolution without modifying records.
   * 6. Audits /userPhones registry for entries pointing to deleted profiles without exposing personal data.
   * 7. Validates system settings and automation user health in a read-only manner.
   * 8. ZERO destructive operations.
   */
  async auditOrphanSubscriptions(
    options: AuditOptions,
  ): Promise<OrphanSubscriptionAuditReport> {
    // 1. Mandatory Project ID Assertion
    if (!options?.targetProjectId || options.targetProjectId.trim() === "") {
      throw new Error(
        "Safety abort: An explicit targetProjectId is required to run the audit (e.g. 'demo-test' or 'mysuru-paakashale-erp'). Ambient or default fallback is prohibited.",
      );
    }

    const expectedProjectId = options.targetProjectId.trim();
    const currentProjectId = this.getCurrentProjectId();

    if (!currentProjectId) {
      throw new Error(
        `Safety abort: The active Firebase project cannot be established from the runtime environment. Expected '${expectedProjectId}'.`,
      );
    }

    if (currentProjectId !== expectedProjectId) {
      throw new Error(
        `Safety abort: Target project ID mismatch. Expected '${expectedProjectId}', but active Firebase environment is connected to '${currentProjectId}'.`,
      );
    }

    const strictAbort = options.strictAbortOnError !== false;
    const allSubs = await subscriptionRepository.list();
    const details: OrphanSubscriptionAuditItem[] = [];

    const orphanedByStatus = {
      active: 0,
      paused: 0,
      cancelled: 0,
      pending_payment: 0,
      draft: 0,
    };

    let validSubscriptions = 0;
    let orphanedWithHistory = 0;
    let orphanedWithoutHistory = 0;
    let auditFailures = 0;
    const decisionPoints: string[] = [];
    const orphanFindings: string[] = [];

    for (const sub of allSubs) {
      // 2. Customer profile lookup with strict error isolation
      let customer: any = null;
      let customerLookupStatus:
        | "CONFIRMED_EXISTS"
        | "CONFIRMED_MISSING"
        | "LOOKUP_FAILED" = "CONFIRMED_MISSING";

      try {
        customer = await userRepository.getById(sub.customerId);
        if (customer) {
          customerLookupStatus = "CONFIRMED_EXISTS";
        } else {
          customerLookupStatus = "CONFIRMED_MISSING";
        }
      } catch (custErr: any) {
        customerLookupStatus = "LOOKUP_FAILED";
        const errorMsg = `Customer lookup failed for subscription '${sub.id}' (customerId: '${sub.customerId}'): ${custErr?.message || String(custErr)}. Customer existence could not be verified.`;

        if (strictAbort) {
          throw new Error(`Safety abort: ${errorMsg}`);
        }

        auditFailures++;
        decisionPoints.push(errorMsg);
        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: false,
          customerLookupStatus: "LOOKUP_FAILED",
          addressResolves: false,
          isStaffOrAdminReferenced: false,
          historyVerified: false,
          historyAuditError: errorMsg,
          skipCount: 0,
          orderCount: 0,
          deliveryCount: 0,
          invoiceCount: 0,
          paymentCount: 0,
          classification: "AUDIT_FAILED",
          proposedAction: "RETAIN_FOR_AUDIT",
          policyDecisionRequired: `Audit failed during customer verification: ${errorMsg}`,
        });
        continue;
      }

      // Check whether delivery address can be resolved
      let addressResolves = false;
      if (customer && Array.isArray(customer.addresses) && customer.addresses.length > 0) {
        const addr =
          customer.addresses.find((a: any) => a.id === sub.deliveryAddressId) ||
          customer.addresses.find((a: any) => a.isDefault) ||
          customer.addresses[0];
        addressResolves = Boolean(
          addr &&
          (addr.street || addr.addressLine1) &&
          addr.pincode &&
          String(addr.pincode).trim().length > 0,
        );
      }

      // 3. Exclude staff/admin/automation accounts
      const isStaffOrAdmin = Boolean(
        customer &&
          (customer.role === "admin" ||
            customer.role === "staff" ||
            customer.role === "delivery_partner" ||
            customer.id === "automation-service-account"),
      );

      if (isStaffOrAdmin) {
        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: false,
          customerLookupStatus,
          addressResolves: true,
          isStaffOrAdminReferenced: true,
          historyVerified: true,
          skipCount: 0,
          orderCount: 0,
          deliveryCount: 0,
          invoiceCount: 0,
          paymentCount: 0,
          classification: "EXCLUDED_SYSTEM_ACCOUNT",
          proposedAction: "NO_ACTION",
        });
        validSubscriptions++;
        continue;
      }

      if (customer) {
        // Customer profile exists and is a valid customer
        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: false,
          customerLookupStatus,
          addressResolves,
          isStaffOrAdminReferenced: false,
          historyVerified: true,
          skipCount: 0,
          orderCount: 0,
          deliveryCount: 0,
          invoiceCount: 0,
          paymentCount: 0,
          classification: "VALID_SUBSCRIBER",
          proposedAction: "NO_ACTION",
        });
        validSubscriptions++;
        continue;
      }

      // Customer profile confirmed missing in /users
      const statusKey = sub.status as keyof typeof orphanedByStatus;
      if (statusKey in orphanedByStatus) {
        orphanedByStatus[statusKey]++;
      }

      // 4. Verify historical records with explicit failure detection
      let skipCount = 0;
      let orderCount = 0;
      let deliveryCount = 0;
      let invoiceCount = 0;
      let paymentCount = 0;
      let historyAuditError: string | null = null;

      try {
        const skipsSnap = await getDocs(
          collection(db, "subscriptions", sub.id, "skips"),
        );
        skipCount = skipsSnap.size;
      } catch (err: any) {
        historyAuditError = `Failed to query skips for subscription ${sub.id}: ${err?.message || String(err)}`;
      }

      if (!historyAuditError) {
        try {
          const ordersSnap = await getDocs(
            query(
              collection(db, "orders"),
              where("subscriptionId", "==", sub.id),
            ),
          );
          orderCount = ordersSnap.size;
        } catch (err: any) {
          historyAuditError = `Failed to query orders for subscription ${sub.id}: ${err?.message || String(err)}`;
        }
      }

      if (!historyAuditError) {
        try {
          const delivSnap = await getDocs(
            query(
              collection(db, "deliveries"),
              where("subscriptionId", "==", sub.id),
            ),
          );
          deliveryCount = delivSnap.size;
        } catch (err: any) {
          historyAuditError = `Failed to query deliveries for subscription ${sub.id}: ${err?.message || String(err)}`;
        }
      }

      if (!historyAuditError) {
        try {
          const invSnap = await getDocs(
            query(
              collection(db, "invoices"),
              where("subscriptionId", "==", sub.id),
            ),
          );
          invoiceCount = invSnap.size;
        } catch (err: any) {
          historyAuditError = `Failed to query invoices for subscription ${sub.id}: ${err?.message || String(err)}`;
        }
      }

      if (!historyAuditError) {
        try {
          const paySnap = await getDocs(
            query(
              collection(db, "payments"),
              where("customerId", "==", sub.customerId),
            ),
          );
          paymentCount = paySnap.size;
        } catch (err: any) {
          historyAuditError = `Failed to query payments for subscription ${sub.id}: ${err?.message || String(err)}`;
        }
      }

      if (historyAuditError) {
        if (strictAbort) {
          throw new Error(`Safety abort: ${historyAuditError}`);
        }

        auditFailures++;
        decisionPoints.push(historyAuditError);
        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: true,
          customerLookupStatus,
          addressResolves: false,
          isStaffOrAdminReferenced: false,
          historyVerified: false,
          historyAuditError,
          skipCount: 0,
          orderCount: 0,
          deliveryCount: 0,
          invoiceCount: 0,
          paymentCount: 0,
          classification: "AUDIT_FAILED",
          proposedAction: "RETAIN_FOR_AUDIT",
          policyDecisionRequired: `Historical record verification could not be completed: ${historyAuditError}. Record must be retained for review.`,
        });
        continue;
      }

      // History is confirmed verified
      const hasHistory =
        orderCount > 0 ||
        deliveryCount > 0 ||
        invoiceCount > 0 ||
        paymentCount > 0;

      if (hasHistory) {
        orphanedWithHistory++;
        const reason = `Orphan subscription ${sub.id} retains historical records (orders: ${orderCount}, deliveries: ${deliveryCount}, invoices: ${invoiceCount}, payments: ${paymentCount}). Deletion would break referential integrity for financial audit. Business policy decision required: retain document in cancelled state vs. archive.`;
        decisionPoints.push(reason);

        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: true,
          customerLookupStatus,
          addressResolves: false,
          isStaffOrAdminReferenced: false,
          historyVerified: true,
          skipCount,
          orderCount,
          deliveryCount,
          invoiceCount,
          paymentCount,
          classification: "ORPHAN_WITH_HISTORICAL_RECORDS",
          proposedAction: "RETAIN_FOR_AUDIT",
          policyDecisionRequired: reason,
        });
      } else {
        orphanedWithoutHistory++;
        orphanFindings.push(sub.id);

        details.push({
          subscriptionId: sub.id,
          status: sub.status,
          planId: sub.planId,
          startDate: sub.startDate,
          endDate: sub.endDate,
          isCustomerMissing: true,
          customerLookupStatus,
          addressResolves: false,
          isStaffOrAdminReferenced: false,
          historyVerified: true,
          skipCount,
          orderCount,
          deliveryCount,
          invoiceCount,
          paymentCount,
          classification: "CONFIRMED_ORPHAN_NO_HISTORY",
          proposedAction: "PROPOSED_FOR_SEPARATE_CANCELLATION_REVIEW",
          policyDecisionRequired: `Confirmed orphan subscription ${sub.id} has verified zero historical records. Cancellation requires explicit authorized business review of cancellation business logic.`,
        });
      }
    }

    const totalOrphans = orphanedWithHistory + orphanedWithoutHistory;

    // 5. Audit Phone Registry (/userPhones)
    const orphanedPhoneEntries: OrphanPhoneAuditItem[] = [];
    let orphanedPhoneCount = 0;

    if (options.checkPhoneRegistry !== false) {
      try {
        const phonesSnap = await getDocs(collection(db, "userPhones"));
        for (const phoneDoc of phonesSnap.docs) {
          const phoneData = phoneDoc.data();
          const uid = phoneData?.uid;
          if (uid) {
            let phoneUser: any = null;
            try {
              phoneUser = await userRepository.getById(uid);
            } catch (pErr: any) {
              const errStr = `Failed customer lookup for phone registry entry '${maskPhoneNumber(phoneDoc.id)}': ${pErr?.message || String(pErr)}`;
              if (strictAbort) {
                throw new Error(`Safety abort: ${errStr}`);
              }
              auditFailures++;
              decisionPoints.push(errStr);
              continue;
            }
            if (!phoneUser) {
              orphanedPhoneCount++;
              orphanedPhoneEntries.push({
                maskedPhone: maskPhoneNumber(phoneDoc.id),
                referencedUid: uid,
                isCustomerMissing: true,
              });
            }
          }
        }
      } catch (phoneErr: any) {
        const phoneErrMsg = `Failed to query /userPhones collection: ${phoneErr?.message || String(phoneErr)}`;
        if (strictAbort) {
          throw new Error(`Safety abort: ${phoneErrMsg}`);
        }
        auditFailures++;
        decisionPoints.push(phoneErrMsg);
      }
    }

    // 6. System Health Validation (/users/automation-service-account, /settings/business, /settings/userCounters)
    const systemHealth: SystemHealthReport = {
      automationAccountStatus: "NOT_CHECKED",
      businessSettingsStatus: "NOT_CHECKED",
      userCountersStatus: "NOT_CHECKED",
    };

    if (options.checkSystemHealth !== false) {
      try {
        const autoSnap = await getDoc(doc(db, "users", "automation-service-account"));
        if (!autoSnap.exists()) {
          systemHealth.automationAccountStatus = "MISSING";
          systemHealth.automationAccountError = "/users/automation-service-account does not exist.";
        } else {
          const autoData = autoSnap.data();
          if (autoData?.role !== "admin") {
            systemHealth.automationAccountStatus = "INVALID_ROLE";
            systemHealth.automationAccountError = `/users/automation-service-account has role '${autoData?.role}', expected 'admin'.`;
          } else if (autoData?.isActive !== true) {
            systemHealth.automationAccountStatus = "INACTIVE";
            systemHealth.automationAccountError = "/users/automation-service-account is inactive (isActive != true).";
          } else {
            systemHealth.automationAccountStatus = "VERIFIED";
          }
        }
      } catch (err: any) {
        systemHealth.automationAccountStatus = "READ_FAILED";
        systemHealth.automationAccountError = `Failed to read /users/automation-service-account: ${err?.message || String(err)}`;
      }

      try {
        const bizSnap = await getDoc(doc(db, "settings", "business"));
        if (!bizSnap.exists()) {
          systemHealth.businessSettingsStatus = "MISSING";
          systemHealth.businessSettingsError = "/settings/business document does not exist.";
        } else {
          systemHealth.businessSettingsStatus = "VERIFIED";
        }
      } catch (err: any) {
        systemHealth.businessSettingsStatus = "READ_FAILED";
        systemHealth.businessSettingsError = `Failed to read /settings/business: ${err?.message || String(err)}`;
      }

      try {
        const counterSnap = await getDoc(doc(db, "settings", "userCounters"));
        if (!counterSnap.exists()) {
          systemHealth.userCountersStatus = "MISSING";
          systemHealth.userCountersError = "/settings/userCounters document does not exist.";
        } else {
          const cData = counterSnap.data();
          if (cData && typeof cData.customer !== "number") {
            systemHealth.userCountersStatus = "INVALID_VALUE";
            systemHealth.userCountersError = "/settings/userCounters missing numeric customer counter.";
          } else {
            systemHealth.userCountersStatus = "VERIFIED";
          }
        }
      } catch (err: any) {
        systemHealth.userCountersStatus = "READ_FAILED";
        systemHealth.userCountersError = `Failed to read /settings/userCounters: ${err?.message || String(err)}`;
      }

      if (strictAbort) {
        if (systemHealth.automationAccountStatus === "READ_FAILED") {
          throw new Error(`Safety abort: ${systemHealth.automationAccountError}`);
        }
        if (systemHealth.businessSettingsStatus === "READ_FAILED") {
          throw new Error(`Safety abort: ${systemHealth.businessSettingsError}`);
        }
        if (systemHealth.userCountersStatus === "READ_FAILED") {
          throw new Error(`Safety abort: ${systemHealth.userCountersError}`);
        }
      }
    }

    // Build sanitized markdown summary (NO credentials, NO tokens, NO customer names, NO phone numbers, NO addresses)
    let md = `### 📋 Orphan Subscription Audit Report\n\n`;
    md += `- **Environment / Project**: \`${expectedProjectId}\`\n`;
    md += `- **Mode**: \`STRICTLY READ-ONLY AUDIT (ZERO MUTATIONS)\`\n`;
    md += `- **Total Subscriptions Scanned**: ${allSubs.length}\n`;
    md += `- **Valid Subscriptions**: ${validSubscriptions}\n`;
    md += `- **Orphaned Subscriptions**: ${totalOrphans}\n`;
    md += `  - Active: ${orphanedByStatus.active}\n`;
    md += `  - Paused: ${orphanedByStatus.paused}\n`;
    md += `  - Cancelled: ${orphanedByStatus.cancelled}\n`;
    md += `  - Pending Payment / Draft: ${orphanedByStatus.pending_payment + orphanedByStatus.draft}\n`;
    md += `- **Orphans With Historical Records (Preserved)**: ${orphanedWithHistory}\n`;
    md += `- **Confirmed Orphans Without History (Proposed for Review)**: ${orphanedWithoutHistory}\n`;
    md += `- **Audit Failures / Unverified Records**: ${auditFailures}\n`;
    md += `- **Orphaned Phone Registry Entries (/userPhones)**: ${orphanedPhoneCount}\n\n`;

    md += `#### 🛡️ System Health & Identity Preflight\n\n`;
    md += `- **Automation Account (\`/users/automation-service-account\`)**: \`${systemHealth.automationAccountStatus}\`${systemHealth.automationAccountError ? ` (${systemHealth.automationAccountError})` : ""}\n`;
    md += `- **Business Settings (\`/settings/business\`)**: \`${systemHealth.businessSettingsStatus}\`${systemHealth.businessSettingsError ? ` (${systemHealth.businessSettingsError})` : ""}\n`;
    md += `- **Sequential User Counters (\`/settings/userCounters\`)**: \`${systemHealth.userCountersStatus}\`${systemHealth.userCountersError ? ` (${systemHealth.userCountersError})` : ""}\n\n`;

    if (orphanedPhoneEntries.length > 0) {
      md += `#### 📞 Orphaned Phone Registry Entries (Referencing Missing Customers)\n\n`;
      md += `| Masked Phone | Referenced UID | Customer Profile Status |\n`;
      md += `| :--- | :--- | :---: |\n`;
      for (const p of orphanedPhoneEntries) {
        md += `| \`${p.maskedPhone}\` | \`${p.referencedUid}\` | CONFIRMED_MISSING |\n`;
      }
      md += `\n`;
    }

    if (decisionPoints.length > 0) {
      md += `#### ⚠️ Business Policy Decisions Required\n\n`;
      for (const dp of decisionPoints) {
        md += `- ${dp}\n`;
      }
      md += `\n`;
    }

    md += `| Subscription ID | Status | Customer Missing | Address Resolves | History Verified | Skips | Orders | Invoices | Classification | Proposed Action |\n`;
    md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |\n`;
    for (const d of details) {
      md += `| \`${d.subscriptionId}\` | \`${d.status}\` | ${d.isCustomerMissing ? "YES" : "NO"} | ${d.addressResolves ? "YES" : "NO"} | ${d.historyVerified ? "YES" : "FAILED"} | ${d.skipCount} | ${d.orderCount} | ${d.invoiceCount} | ${d.classification} | **${d.proposedAction}** |\n`;
    }

    return {
      timestamp: new Date().toISOString(),
      targetProjectId: expectedProjectId,
      isDryRun: true,
      totals: {
        scannedSubscriptions: allSubs.length,
        validSubscriptions,
        orphanedSubscriptions: totalOrphans,
        orphanedByStatus,
        orphanedWithHistory,
        orphanedWithoutHistory,
        auditFailures,
        orphanedPhoneCount,
      },
      systemHealth,
      orphanedPhoneEntries,
      details,
      decisionPoints,
      orphanFindings,
      markdownSummary: md,
    };
  }
}

export const subscriptionCleanupService = new SubscriptionCleanupService();
