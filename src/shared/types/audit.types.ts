import type { Timestamp } from "firebase/firestore";

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Firebase UID — kept internally for security/tracing, never shown as primary UI identifier. */
  performedBy: string;
  /** Role string: 'admin', 'accounts', 'kitchen', 'delivery_partner', 'customer'. */
  performedByRole: string;
  /** Human-readable display name: "Abhishek K". Present on new records; may be absent on legacy records. */
  performedByName?: string;
  timestamp: Timestamp;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}
