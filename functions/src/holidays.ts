import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';

const getDb = () => getFirestore();

// Match the BATCH_SIZE constants from the client implementation
const BATCH_SIZE = 400;
const HOLIDAY_NOTIF_BATCH_SIZE = 400;
const HOLIDAY_CANCELLABLE_STATUSES = ['scheduled', 'preparing', 'packing'];
const HOLIDAY_NOTIF_ROLES = ['admin', 'kitchen', 'customer', 'delivery_partner'];

/**
 * Splits an array into chunks of at most `size` elements.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Backend trigger that fires when an admin creates a new holiday document.
 * This runs the privileged operations (cancelling orders, dispatching notifications)
 * securely on the backend, avoiding client-side race conditions and bypassing
 * restrictive client security rules.
 */
export const onHolidayDeclared = onDocumentCreated('holidays/{holidayId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const holiday = snapshot.data();
  // Only process active holidays
  if (holiday.status !== 'active') return;

  const date = holiday.date;
  const name = holiday.name;
  const description = holiday.description;
  const holidayId = event.params.holidayId;

  logger.info(`Starting holiday reconciliation for ${date} (Holiday: ${name})`);

  try {
    // 1. Reconcile eligible orders
    let cancelledCount = 0;
    
    // Query for each cancellable status in parallel
    const orderQueries = await Promise.all(
      HOLIDAY_CANCELLABLE_STATUSES.map((status) =>
        getDb().collection('orders')
          .where('date', '==', date)
          .where('status', '==', status)
          .get()
      )
    );

    // Flatten and deduplicate
    const seenOrders = new Set<string>();
    const eligibleOrders: any[] = [];
    
    for (const querySnap of orderQueries) {
      for (const doc of querySnap.docs) {
        if (!seenOrders.has(doc.id)) {
          seenOrders.add(doc.id);
          eligibleOrders.push({ id: doc.id, ...doc.data() });
        }
      }
    }

    if (eligibleOrders.length > 0) {
      const orderChunks = chunkArray(eligibleOrders, BATCH_SIZE);
      for (const chunk of orderChunks) {
        const batch = getDb().batch();
        chunk.forEach((order) => {
          const ref = getDb().collection('orders').doc(order.id);
          batch.update(ref, {
            status: 'cancelled',
            cancellationReason: 'holiday',
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
      }
      cancelledCount = eligibleOrders.length;
      logger.info(`Successfully cancelled ${cancelledCount} orders for holiday on ${date}`);
    }

    // 2. Dispatch notifications
    // Fetch all users for the relevant roles in parallel
    const userQueries = await Promise.all(
      HOLIDAY_NOTIF_ROLES.map((role) =>
        getDb().collection('users')
          .where('role', '==', role)
          .where('isActive', '==', true)
          .get()
      )
    );

    const allUsers = userQueries.map(q => q.docs).flat();
    
    if (allUsers.length > 0) {
      const userChunks = chunkArray(allUsers, HOLIDAY_NOTIF_BATCH_SIZE);

      for (const chunk of userChunks) {
        const refs = chunk.map((userDoc) => {
          const notifId = `holiday_notify_${date}_${userDoc.id}`;
          return { 
            user: { id: userDoc.id, ...userDoc.data() }, 
            notifId, 
            ref: getDb().collection('notifications').doc(notifId) 
          };
        });

        // Read existing docs in parallel to preserve 'read' state
        const existingSnaps = await getDb().getAll(...refs.map(r => r.ref));

        const batch = getDb().batch();
        let hasBatchWrites = false;

        refs.forEach(({ user, notifId, ref }, idx) => {
          const snap = existingSnaps[idx];
          const role = (user as any).role ?? 'customer';

          if (!snap.exists) {
            batch.set(ref, {
              id: notifId,
              recipientId: user.id,
              recipientRole: role,
              channel: 'in_app',
              type: 'holiday_declared',
              title: `Holiday declared: ${name}`,
              message: `${date} has been declared a holiday${description ? ` (${description})` : ''}. No meals will be generated on this date.${cancelledCount > 0 ? ` ${cancelledCount} existing order(s) have been cancelled.` : ''}`,
              priority: 'high',
              status: 'pending',
              inAppStatus: 'unread',
              retryCount: 0,
              maxRetries: 3,
              lastRetryAt: null,
              errorMessage: null,
              relatedEntityType: 'holiday',
              relatedEntityId: holidayId,
              metadata: {
                holidayDate: date,
                holidayName: name,
                cancelledCount: String(cancelledCount),
              },
              createdBy: 'system',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              sentAt: null,
              readAt: null,
              deliveredAt: null,
              expiresAt: null,
            });
            hasBatchWrites = true;
          } else {
            const existing = snap.data() as Record<string, any>;
            if (existing.inAppStatus === 'read' || existing.inAppStatus === 'archived') {
              batch.update(ref, {
                title: `Holiday declared: ${name}`,
                message: `${date} has been declared a holiday${description ? ` (${description})` : ''}. No meals will be generated on this date.`,
                updatedAt: FieldValue.serverTimestamp(),
              });
              hasBatchWrites = true;
            } else {
              batch.update(ref, {
                title: `Holiday declared: ${name}`,
                message: `${date} has been declared a holiday${description ? ` (${description})` : ''}. No meals will be generated on this date.${cancelledCount > 0 ? ` ${cancelledCount} existing order(s) have been cancelled.` : ''}`,
                inAppStatus: 'unread',
                status: 'pending',
                updatedAt: FieldValue.serverTimestamp(),
              });
              hasBatchWrites = true;
            }
          }
        });

        if (hasBatchWrites) {
          await batch.commit();
        }
      }
      logger.info(`Successfully dispatched notifications for holiday on ${date}`);
    }

  } catch (error) {
    logger.error(`Error reconciling orders/notifications for holiday on ${date}:`, error);
    throw error;
  }
});
