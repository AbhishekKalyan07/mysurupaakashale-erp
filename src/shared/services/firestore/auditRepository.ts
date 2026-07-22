import { query, orderBy, getDocs, limit, startAfter, where, addDoc, serverTimestamp, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { AuditLog } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';

export interface AuditLogFilter {
  action?: string;
  userId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

class AuditRepository extends BaseRepository<AuditLog> {
  constructor() {
    super(db, 'auditLogs', createConverter<AuditLog>());
  }

  /**
   * Logs a new audit action.
   */
  async logAction(
    action: string,
    actorId: string,
    actorName: string,
    entityId: string,
    entityType: string,
    details?: any
  ): Promise<void> {
    await addDoc(this.collectionRef, {
      action,
      actorId,
      actorName,
      entityId,
      entityType,
      details: details || null,
      timestamp: serverTimestamp(),
      ipAddress: null, // Could be captured by functions, client-side it's not feasible reliably
    } as any);
  }

  /**
   * Fetches audit logs with filtering and pagination.
   */
  async getAuditLogs(
    filters: AuditLogFilter,
    pageSize: number = 50,
    lastDocSnap?: QueryDocumentSnapshot<AuditLog>
  ): Promise<{ logs: AuditLog[]; lastDoc: QueryDocumentSnapshot<AuditLog> | null }> {
    const constraints: QueryConstraint[] = [];

    if (filters.action) {
      constraints.push(where('action', '==', filters.action));
    }
    if (filters.userId) {
      constraints.push(where('actorId', '==', filters.userId));
    }
    
    // Note: Filtering by timestamp AND action/userId might require a composite index.
    // If startDate/endDate is passed, we assume the index exists in firestore.indexes.json
    if (filters.startDate) {
      constraints.push(where('timestamp', '>=', new Date(`${filters.startDate}T00:00:00`)));
    }
    if (filters.endDate) {
      constraints.push(where('timestamp', '<=', new Date(`${filters.endDate}T23:59:59`)));
    }

    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(pageSize));

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const q = query(this.collectionRef, ...constraints);
    const snap = await getDocs(q);

    return {
      logs: snap.docs.map(d => d.data()),
      lastDoc: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
    };
  }
}

export const auditRepository = new AuditRepository();
