import type { ID, Timestamp } from '@/shared/types/common.types';

// ── Channels ───────────────────────────────────────────────────────────────────
export type NotificationChannel = 'in_app' | 'email' | 'whatsapp';

// ── Priority ───────────────────────────────────────────────────────────────────
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

// ── In-app status ──────────────────────────────────────────────────────────────
export type NotificationInAppStatus = 'unread' | 'read' | 'archived';

// ── Delivery status (external channel) ────────────────────────────────────────
export type NotificationDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

// ── Overall record status ──────────────────────────────────────────────────────
export type NotificationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'archived'
  | 'failed';

// ── Notification type taxonomy ─────────────────────────────────────────────────
export type NotificationType =
  // Subscription lifecycle
  | 'subscription_created'
  | 'subscription_activated'
  | 'subscription_pending_payment'
  | 'subscription_renewal_reminder'
  | 'subscription_paused'
  | 'subscription_resumed'
  | 'subscription_cancelled'
  | 'subscription_approved'
  // Payment
  | 'payment_submitted'
  | 'payment_verified'
  | 'payment_rejected'
  | 'payment_reminder'
  // Billing
  | 'invoice_generated'
  // Delivery
  | 'delivery_assigned'
  | 'driver_assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  // Kitchen / operations
  | 'daily_orders_generated'
  | 'kitchen_production_ready'
  | 'meal_paused'
  | 'meal_resumed'
  // Staff / admin
  | 'staff_account_created'
  | 'staff_disabled'
  | 'role_updated'
  | 'settings_updated'
  // HR
  | 'leave_updated'
  | 'payroll_generated'
  | 'salary_paid'
  // System
  | 'system_alert'
  | 'system_error'
  | 'backup_completed'
  // Holiday
  | 'holiday_declared';


/**
 * Firestore: `notifications/{notificationId}`.
 *
 * Written by `notificationService.ts` (client-side, via Admin auth) and by
 * automation scripts. The client may:
 *   - read their own notifications
 *   - mark a notification as read / archived (onlyChangedFields guard in rules)
 *
 * Immutable history: a notification is never deleted by business logic —
 * users may archive or the system may expire, but the record persists for audit.
 */
export interface Notification {
  id: ID;

  // ── Recipient ────────────────────────────────────────────────────────────────
  recipientId: ID;
  recipientRole: string;   // 'customer' | 'admin' | 'kitchen' | 'delivery_partner' | 'accounts'

  // ── Channel ──────────────────────────────────────────────────────────────────
  channel: NotificationChannel;

  // ── Content ──────────────────────────────────────────────────────────────────
  type: NotificationType;
  title: string;
  message: string;

  // ── Delivery state ───────────────────────────────────────────────────────────
  priority: NotificationPriority;
  status: NotificationStatus;
  inAppStatus: NotificationInAppStatus;   // only meaningful for in_app channel

  // ── Retry tracking ───────────────────────────────────────────────────────────
  retryCount: number;
  maxRetries: number;
  lastRetryAt: Timestamp | null;
  errorMessage: string | null;

  // ── Timestamps ───────────────────────────────────────────────────────────────
  createdAt: Timestamp;
  sentAt: Timestamp | null;
  readAt: Timestamp | null;
  deliveredAt: Timestamp | null;

  // ── Expiry ───────────────────────────────────────────────────────────────────
  expiresAt: Timestamp | null;

  // ── Origin ───────────────────────────────────────────────────────────────────
  createdBy: string;    // 'system' | uid of acting admin

  // ── Related entity (for deep-linking / audit correlation) ───────────────────
  relatedEntityType: string | null;   // 'subscription' | 'payment' | 'order' | ...
  relatedEntityId: ID | null;

  // ── Extensible metadata ──────────────────────────────────────────────────────
  /** Flat key-value bag — deep-link params, external channel IDs, etc. Keep primitives only. */
  metadata: Record<string, string>;
}

/**
 * Payload passed to notificationService helpers (and ultimately to
 * notificationRepository.createNotification). All fields here become the
 * Notification document minus server-set fields (id, timestamps, retryCount, etc.).
 */
export interface CreateNotificationPayload {
  recipientId: ID;
  recipientRole: string;
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  relatedEntityType?: string | null;
  relatedEntityId?: ID | null;
  metadata?: Record<string, string>;
  expiresAt?: Timestamp | null;
  createdBy?: string;
}
