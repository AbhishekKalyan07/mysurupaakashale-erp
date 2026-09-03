import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp({ projectId: 'mysuru-paakashale-erp' });

import { orderService, getTodayInTimezone } from './orders';
import { billingService } from './billing';

export const scheduledDailyAutomation = onSchedule({
  schedule: '0 2 * * *',
  timeZone: 'Asia/Kolkata',
  memory: '512MiB',
  timeoutSeconds: 300,
}, async (event) => {
  logger.info('Running scheduledDailyAutomation: Generate Orders and Process Billing');
  await orderService.generateDailyOrders();
  
  const today = getTodayInTimezone();
  await billingService.processDailyBilling(today);
});

export const generateDailyOrders = onCall({
  enforceAppCheck: false // Configure as needed for production
}, async (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can generate orders');
  }
  const date = request.data?.date;
  return await orderService.generateDailyOrders(date);
});

export const processDailyBilling = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can run billing');
  }
  const date = request.data?.date || getTodayInTimezone();
  return await billingService.processDailyBilling(date);
});

export const onOrderCancelled = onDocumentUpdated('orders/{orderId}', async (event) => {
  const db = getFirestore();
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only trigger on exact transition to cancelled
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    const orderId = event.params.orderId;
    const mealType = after.mealType || 'meal';
    const date = after.date;
    const customerId = after.customerId;
    const deliveryPartnerId = after.deliveryPartnerId;

    logger.info(`Processing cancellation notifications for order ${orderId}`, { mealType, date, customerId });

    try {
      // 1. Resolve recipients
      const [allKitchenQuery, adminQuery] = await Promise.all([
        db.collection('users').where('role', '==', 'kitchen').where('isActive', '==', true).get(),
        db.collection('users').where('role', '==', 'admin').where('isActive', '==', true).get(),
      ]);

      const kitchenIds = allKitchenQuery.docs
        .filter(d => !after.kitchenId || d.data().kitchenId === after.kitchenId)
        .map(d => d.id);
      const adminIds = adminQuery.docs.map(d => d.id);
      const mealTypeStr = mealType.charAt(0).toUpperCase() + mealType.slice(1);

      const batch = db.batch();

      // Helper to deterministically write notifications (Idempotent Notification Creation)
      const createNotification = (recipientId: string, role: string, title: string, message: string, priority: string, extraMetadata: any = {}) => {
        // Deterministic ID for idempotency: cancellation_{orderId}_{role}_{recipientId}
        const notifId = `cancellation_${orderId}_${role}_${recipientId}`;
        const ref = db.collection('notifications').doc(notifId);
        
        batch.set(ref, {
          recipientId,
          recipientRole: role,
          channel: 'in_app',
          type: 'system_alert',
          title,
          message,
          priority,
          relatedEntityType: 'order',
          relatedEntityId: orderId,
          metadata: extraMetadata,
          inAppStatus: 'unread',
          status: 'unread',
          createdBy: 'system',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: null
        }, { merge: true });
      };

      // Create Kitchen notifications
      kitchenIds.forEach(id => {
        createNotification(
          id,
          'kitchen',
          `Production Update: ${mealTypeStr} Cancelled`,
          `A ${mealType} order for ${date} has been cancelled. It has been removed from your packing list.`,
          'high',
          { date }
        );
      });

      // Create Admin notifications
      adminIds.forEach(id => {
        createNotification(
          id,
          'admin',
          `Order Cancelled: ${mealTypeStr}`,
          `Customer ${customerId} cancelled their ${mealType} order for ${date}.`,
          'normal'
        );
      });

      // Create Delivery Partner notification
      if (deliveryPartnerId) {
        const custName = after.customerName || customerId;
        createNotification(
          deliveryPartnerId,
          'delivery',
          `${mealTypeStr} Delivery Cancelled`,
          `The ${mealType} delivery for ${custName} on ${date} has been cancelled.`,
          'high'
        );
      }

      await batch.commit();
      logger.info(`Successfully dispatched cancellation notifications for order ${orderId}`);
    } catch (error) {
      logger.error(`Failed to process cancellation notifications for order ${orderId}`, error);
      throw error; // Rethrow to allow Cloud Functions to trigger retry if configured
    }
  }
});

export * from './holidays';
