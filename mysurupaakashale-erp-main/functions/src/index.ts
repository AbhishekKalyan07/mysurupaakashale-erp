import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Optional: HTTP endpoint to seed data for testing
// export { seedOrderHistory } from './seed';

// Billing logic
export { generateMonthlyInvoices } from './billing';

// SECURITY: an `elevateToAdmin` HTTP endpoint used to live here
// ("TEMPORARY FOR TESTING"). It took an ?email= query param with NO
// authentication or authorization check and granted that account admin
// custom claims + an admin role doc — i.e. a public, unauthenticated
// "become admin" URL. It has been removed rather than gated, because a
// standing self-elevation backdoor shouldn't exist even behind a check.
// If you need to bootstrap the first admin account, do it directly in the
// Firebase Console (Firestore: set users/{uid}.role = 'admin') or via a
// one-off authenticated Admin SDK script you run yourself and delete —
// never a deployed public endpoint.
//
// Also note: this whole functions/ directory (pubsub-scheduled Cloud
// Functions) requires the Blaze billing plan and is NOT part of this
// project's documented live architecture, which runs on the Spark plan
// via the client SDK + GitHub Actions cron (see PRODUCTION_READINESS_REPORT.md
// and scripts/automation/). Treat these functions as superseded/inactive
// unless you've deliberately opted back into Cloud Functions.

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
