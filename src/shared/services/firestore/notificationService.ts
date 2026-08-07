/**
 * notificationService.ts
 *
 * Client-side notification writer. Replaces what Cloud Functions previously
 * did for notification creation — now runs from:
 *   - Admin/kitchen actions (order status, payment verification)
 *   - Automation scripts (daily orders generated, subscription expiry)
 *   - Customer-facing writes (subscription creation, payment submission)
 *
 * Architecture:
 *   - All writes go to `notifications/{id}` via the existing notificationRepository.
 *   - Firestore rules allow `isAdmin()` to create; the automation scripts
 *     authenticate as the admin service account before calling these.
 *   - Each helper is a thin factory: it builds the payload and delegates
 *     persistence to notificationRepository.createNotification().
 *   - Fire-and-forget pattern: callers should not await these on the hot path —
 *     wrap in `.catch(console.error)` so a notification failure never breaks
 *     the primary business action.
 */

import { notificationRepository } from '@/shared/services/firestore/notificationRepository';
import type {
  CreateNotificationPayload,
  NotificationType,
  NotificationPriority,
} from '@/shared/types';
import { auth } from '@/shared/lib/firebase';
import { NotificationTemplates } from './templates';

// ─────────────────────────────────────────────────────────────────────────────
// Core send helper
// ─────────────────────────────────────────────────────────────────────────────

async function send(
  recipientId: string,
  recipientRole: string,
  type: NotificationType,
  title: string,
  message: string,
  options: Partial<CreateNotificationPayload> = {},
): Promise<void> {
  const payload: CreateNotificationPayload = {
    recipientId,
    recipientRole,
    channel: 'in_app',
    type,
    title,
    message,
    priority: options.priority ?? 'normal',
    relatedEntityType: options.relatedEntityType ?? null,
    relatedEntityId: options.relatedEntityId ?? null,
    metadata: options.metadata ?? {},
    expiresAt: options.expiresAt ?? null,
    createdBy: options.createdBy ?? auth.currentUser?.uid ?? 'system',
  };
  await notificationRepository.createNotification(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription notifications
// ─────────────────────────────────────────────────────────────────────────────

export async function notifySubscriptionCreated(
  customerId: string,
  subscriptionId: string,
  planTier: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_created',
    'Subscription draft created',
    `Your ${planTier} meal plan subscription has been created. Complete your payment to activate it.`,
    { relatedEntityType: 'subscription', relatedEntityId: subscriptionId },
  );
}

export async function notifySubscriptionActivated(
  customerId: string,
  subscriptionId: string,
  planTier: string,
  startDate: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_activated',
    'Subscription activated!',
    `Your ${planTier} meal plan is now active from ${startDate}. Enjoy your meals!`,
    {
      priority: 'high',
      relatedEntityType: 'subscription',
      relatedEntityId: subscriptionId,
    },
  );
}

export async function notifySubscriptionApproved(
  customerId: string,
  subscriptionId: string,
  planTier: string,
  startDate: string,
): Promise<void> {
  const tpl = NotificationTemplates.SubscriptionApproved(planTier, startDate);
  await send(
    customerId,
    'customer',
    'subscription_approved',
    tpl.title,
    tpl.message,
    {
      priority: 'high',
      relatedEntityType: 'subscription',
      relatedEntityId: subscriptionId,
    },
  );
}

export async function notifySubscriptionRenewalReminder(
  customerId: string,
  subscriptionId: string,
  daysLeft: number,
  endDate: string,
): Promise<void> {
  const urgency: NotificationPriority = daysLeft <= 1 ? 'high' : daysLeft <= 3 ? 'normal' : 'low';
  await send(
    customerId,
    'customer',
    'subscription_renewal_reminder',
    `Subscription expiring ${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}`,
    `Your meal plan subscription ends on ${endDate}. Renew now to continue receiving meals without interruption.`,
    {
      priority: urgency,
      relatedEntityType: 'subscription',
      relatedEntityId: subscriptionId,
    },
  );
}

export async function notifySubscriptionExpired(
  customerId: string,
  subscriptionId: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_renewal_reminder',
    'Subscription expired',
    'Your meal plan subscription has expired. Please renew to continue receiving meals.',
    {
      priority: 'high',
      relatedEntityType: 'subscription',
      relatedEntityId: subscriptionId,
    },
  );
}

export async function notifySubscriptionPaused(
  customerId: string,
  subscriptionId: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_paused',
    'Subscription paused',
    'Your meal plan subscription has been paused. Deliveries will stop until you resume it.',
    { relatedEntityType: 'subscription', relatedEntityId: subscriptionId },
  );
}

export async function notifySubscriptionResumed(
  customerId: string,
  subscriptionId: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_resumed',
    'Subscription resumed',
    'Your meal plan subscription is active again. Deliveries will continue as scheduled.',
    { priority: 'high', relatedEntityType: 'subscription', relatedEntityId: subscriptionId },
  );
}

export async function notifySubscriptionRejected(
  customerId: string,
  subscriptionId: string,
  reason?: string | null,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'subscription_cancelled',
    'Subscription request declined',
    reason
      ? `Your subscription request couldn't be approved: ${reason}`
      : "Your subscription request couldn't be approved. Please contact support or try subscribing again.",
    { priority: 'high', relatedEntityType: 'subscription', relatedEntityId: subscriptionId },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment notifications
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyPaymentSubmitted(
  customerId: string,
  paymentId: string,
  amount: number,
  adminIds: string[],
): Promise<void> {
  // Notify customer
  await send(
    customerId,
    'customer',
    'payment_submitted',
    'Payment received — under review',
    `Your payment of ₹${amount} has been submitted and is pending admin verification.`,
    { relatedEntityType: 'payment', relatedEntityId: paymentId },
  );
  // Notify all admins
  await Promise.all(
    adminIds.map((adminId) =>
      send(
        adminId,
        'admin',
        'payment_submitted',
        'New payment needs verification',
        `A customer has submitted a payment of ₹${amount}. Please verify it in the Payments section.`,
        { priority: 'high', relatedEntityType: 'payment', relatedEntityId: paymentId },
      ),
    ),
  );
}

export async function notifyPaymentVerified(
  customerId: string,
  paymentId: string,
  amount: number,
): Promise<void> {
  const tpl = NotificationTemplates.PaymentReceived(amount);
  await send(
    customerId,
    'customer',
    'payment_verified',
    tpl.title,
    tpl.message,
    {
      priority: 'high',
      relatedEntityType: 'payment',
      relatedEntityId: paymentId,
    },
  );
}

export async function notifyPaymentReminder(
  customerId: string,
  amount: number,
  dueDate: string,
): Promise<void> {
  const tpl = NotificationTemplates.PaymentReminder(amount, dueDate);
  await send(
    customerId,
    'customer',
    'payment_reminder',
    tpl.title,
    tpl.message,
    {
      priority: 'high',
    },
  );
}

export async function notifyInvoiceGenerated(
  customerId: string,
  invoiceId: string,
  amount: number,
  billingMonth: string,
): Promise<void> {
  const tpl = NotificationTemplates.InvoiceGenerated(amount, billingMonth);
  await send(
    customerId,
    'customer',
    'invoice_generated',
    tpl.title,
    tpl.message,
    {
      priority: 'normal',
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
    },
  );
}

export async function notifyPaymentRejected(
  customerId: string,
  paymentId: string,
  amount: number,
  notes: string | null,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'payment_rejected',
    'Payment rejected',
    `Your payment of ₹${amount} could not be verified.${notes ? ` Reason: ${notes}` : ' Please resubmit with the correct reference number.'}`,
    {
      priority: 'high',
      relatedEntityType: 'payment',
      relatedEntityId: paymentId,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery notifications
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyDriverAssigned(
  customerId: string,
  orderId: string,
  driverName: string,
  mealType: string,
): Promise<void> {
  const tpl = NotificationTemplates.DriverAssigned(driverName, mealType);
  await send(
    customerId,
    'customer',
    'driver_assigned',
    tpl.title,
    tpl.message,
    { relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyOrderOutForDelivery(
  customerId: string,
  orderId: string,
  mealType: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'out_for_delivery',
    `Your ${mealType} is on the way!`,
    `Your ${mealType} meal has been picked up and is out for delivery.`,
    { relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyOrderDelivered(
  customerId: string,
  orderId: string,
  mealType: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'delivered',
    `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} delivered ✓`,
    `Your ${mealType} meal has been delivered. Enjoy!`,
    { relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyDeliveryFailed(
  customerId: string,
  orderId: string,
  mealType: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'delivery_failed',
    `${mealType} delivery failed`,
    `We were unable to deliver your ${mealType} meal. Our team will follow up with you.`,
    {
      priority: 'high',
      relatedEntityType: 'order',
      relatedEntityId: orderId,
    },
  );
}

export async function notifyOrderGeneratedCustomer(
  customerId: string,
  mealType: string,
  date: string,
): Promise<void> {
  await send(
    customerId,
    'customer',
    'system_alert',
    `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} order generated`,
    `Your ${mealType} order for ${date} has been generated and sent to the kitchen.`,
    { priority: 'normal' },
  );
}

export async function notifyOrderGeneratedDriver(
  driverId: string,
  orderId: string,
  mealType: string,
  customerName: string,
  date: string,
): Promise<void> {
  await send(
    driverId,
    'delivery',
    'system_alert',
    `New ${mealType} delivery assigned`,
    `You have been assigned a new ${mealType} delivery for ${customerName} on ${date}.`,
    { priority: 'normal', relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyReadyForPickup(
  driverId: string,
  orderId: string,
  mealType: string,
): Promise<void> {
  await send(
    driverId,
    'delivery',
    'system_alert',
    `${mealType} ready for pickup`,
    `A ${mealType} order is packed and ready for you to pick up from the kitchen.`,
    { priority: 'high', relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyAccountsDelivered(
  accountId: string,
  orderId: string,
  mealType: string,
): Promise<void> {
  await send(
    accountId,
    'accounts',
    'system_alert',
    `${mealType} delivered`,
    `A ${mealType} order has been delivered and is ready for invoice processing.`,
    { priority: 'normal', relatedEntityType: 'order', relatedEntityId: orderId },
  );
}

export async function notifyAdminAlert(
  adminIds: string[],
  title: string,
  message: string,
): Promise<void> {
  await Promise.all(
    adminIds.map((adminId) =>
      send(
        adminId,
        'admin',
        'system_alert',
        title,
        message,
        { priority: 'high' }
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kitchen / operations notifications
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyDailyOrdersGenerated(
  kitchenStaffIds: string[],
  date: string,
  count: number,
): Promise<void> {
  await Promise.all(
    kitchenStaffIds.map((staffId) =>
      send(
        staffId,
        'kitchen',
        'daily_orders_generated',
        `Today's orders ready (${count})`,
        `${count} orders have been generated for ${date}. Head to the Production Board to begin preparation.`,
        { priority: 'high', metadata: { date, count: String(count) } },
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff / admin notifications
// ─────────────────────────────────────────────────────────────────────────────

export async function notifyStaffAccountCreated(
  staffId: string,
  role: string,
  fullName: string,
): Promise<void> {
  await send(
    staffId,
    role,
    'staff_account_created',
    'Welcome to Mysuru Paakashale!',
    `Hi ${fullName}, your ${role.replace('_', ' ')} account has been created. Log in to get started.`,
    { priority: 'high' },
  );
}
