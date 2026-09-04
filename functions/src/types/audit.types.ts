import type { Timestamp } from 'firebase-admin/firestore';

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  performedByRole: string;
  timestamp: Timestamp;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}
