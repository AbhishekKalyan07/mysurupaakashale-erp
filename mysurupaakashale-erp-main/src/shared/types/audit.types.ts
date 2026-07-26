import type { Timestamp } from 'firebase/firestore';

export interface AuditLog {
  id: string;
  action: string;
  actorId?: string;
  timestamp: Timestamp;
  entityId?: string;
  entityType?: string;
  details?: {
    previousValue?: unknown;
    newValue?: unknown;
    [key: string]: unknown;
  };
}
