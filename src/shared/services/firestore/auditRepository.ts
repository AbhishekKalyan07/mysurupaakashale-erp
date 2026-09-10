import { Timestamp } from "firebase/firestore";
import {
  query,
  orderBy,
  getDocs,
  limit,
  startAfter,
  where,
  addDoc,
  serverTimestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import type { AuditLog } from "@/shared/types";
import { BaseRepository, createConverter } from "./BaseRepository";

export interface AuditLogFilter {
  action?: string;
  /** Firebase UID filter — advanced/technical use only. Server-side Firestore query. */
  userId?: string;
  /** Human-readable name/role filter — client-side filter on the current page.
   *  UI must display a note that this searches only the currently loaded page. */
  actorName?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

class AuditRepository extends BaseRepository<AuditLog> {
  constructor() {
    super(db, "auditLogs", createConverter<AuditLog>());
  }

  /**
   * Logs a new audit action with human-readable actor identity.
   *
   * @param action       The action name (e.g. 'salary_advance_created')
   * @param actorId      Firebase UID — stored internally, never shown as primary UI identifier
   * @param actorRole    Role string: 'admin', 'accounts', etc.
   * @param actorName    Human-readable display name: "Abhishek K" — shown in audit UI
   * @param entityId     ID of the affected entity
   * @param entityType   Type label: 'payroll', 'salaryAdvance', 'salary_profile', 'user'
   * @param details      Optional additional details object
   */
  async logAction(
    action: string,
    actorId: string,
    actorRole: string,
    actorName: string,
    entityId: string,
    entityType: string,
    details?: any,
  ): Promise<void> {
    const previousValue = details?.previousValue ?? null;
    const newValue = details?.newValue ?? null;
    const reason = details?.reason ?? null;

    // Clean up details if we extracted the specific keys
    const remainingDetails = details ? { ...details } : null;
    if (remainingDetails) {
      delete remainingDetails.previousValue;
      delete remainingDetails.newValue;
      delete remainingDetails.reason;
    }

    await addDoc(this.collectionRef, {
      action,
      performedBy: actorId,
      performedByRole: actorRole,
      performedByName: actorName,
      entityId,
      entityType,
      previousValue,
      newValue,
      reason,
      details:
        remainingDetails && Object.keys(remainingDetails).length > 0
          ? remainingDetails
          : null,
      timestamp: serverTimestamp() as unknown as Timestamp,
      ipAddress: null,
    } as Partial<AuditLog>);
  }

  /**
   * Fetches audit logs with filtering and pagination.
   *
   * Note on actorName filter: Firestore does not support full-text search.
   * The actorName filter is applied CLIENT-SIDE after fetching the page.
   * The UI must display a note: "Name search applies to the current page."
   * For full history search, use date range filters to narrow results first.
   */
  async getAuditLogs(
    filters: AuditLogFilter,
    pageSize: number = 50,
    lastDocSnap?: QueryDocumentSnapshot<AuditLog>,
  ): Promise<{
    logs: AuditLog[];
    lastDoc: QueryDocumentSnapshot<AuditLog> | null;
  }> {
    const constraints: QueryConstraint[] = [];

    if (filters.action) {
      constraints.push(where("action", "==", filters.action));
    }
    // UID filter — server-side, used only for advanced/technical search
    if (filters.userId) {
      constraints.push(where("performedBy", "==", filters.userId));
    }

    // Note: Filtering by timestamp AND action/userId might require a composite index.
    if (filters.startDate) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          new Date(`${filters.startDate}T00:00:00+05:30`),
        ),
      );
    }
    if (filters.endDate) {
      constraints.push(
        where("timestamp", "<=", new Date(`${filters.endDate}T23:59:59+05:30`)),
      );
    }

    constraints.push(orderBy("timestamp", "desc"));
    constraints.push(limit(pageSize));

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const q = query(this.collectionRef, ...constraints);
    const snap = await getDocs(q);

    let logs = snap.docs.map((d) => d.data());

    // Client-side actor name filter (applied after Firestore query)
    // This only filters the current page — the UI must show a note about this limitation.
    if (filters.actorName && filters.actorName.trim()) {
      const needle = filters.actorName.trim().toLowerCase();
      logs = logs.filter((log) => {
        const name = (log.performedByName || "").toLowerCase();
        const role = (log.performedByRole || "").toLowerCase();
        return name.includes(needle) || role.includes(needle);
      });
    }

    return {
      logs,
      lastDoc:
        snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
    };
  }
}

export const auditRepository = new AuditRepository();
