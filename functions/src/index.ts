import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Optional: HTTP endpoint to seed data for testing
export { seedOrderHistory } from './seed';

// Billing logic
export { generateMonthlyInvoices } from './billing';

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled Cron Job to automate the Generation of Daily Orders.
 * Triggers every day at 00:01 AM Asia/Kolkata time.
 */
export const generateDailyOrders = functions.pubsub.schedule('1 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('Starting daily order generation...');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    // 1. Fetch all active subscriptions
    const subscriptionsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();
    let generatedCount = 0;

    const batch = db.batch();

    for (const doc of subscriptionsSnap.docs) {
      const sub = doc.data();

      // Check if today is a skipped day
      const skipRef = db.collection(`subscriptions/${doc.id}/skips`).doc(today);
      const skipSnap = await skipRef.get();
      if (skipSnap.exists) {
        console.log(`Skipping order for ${sub.customerId}, date marked as skipped.`);
        continue;
      }

      // Generate the order
      const orderRef = db.collection('orders').doc(); // Auto-generate ID
      batch.set(orderRef, {
        id: orderRef.id,
        customerId: sub.customerId,
        subscriptionId: doc.id,
        date: today,
        mealType: sub.mealType,
        tier: sub.tier,
        status: 'scheduled',
        deliveryPartnerId: null, // Unassigned by default
        zoneId: sub.defaultZoneId || 'unassigned',
        address: sub.defaultAddress || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      generatedCount++;
    }

    await batch.commit();

    // Log the automated generation run
    await db.collection('orderGenerationRuns').add({
      date: today,
      generatedCount,
      triggeredBy: 'SYSTEM_CRON',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Successfully generated ${generatedCount} orders for ${today}.`);
    return null;
  });
