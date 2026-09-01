import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type QueryDocumentSnapshot, type DocumentData } from 'firebase-admin/firestore';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Cloud Function: onOrderCancelled Integration', () => {
  let db: Firestore;

  beforeAll(() => {
    // Connect to the Firestore emulator that functions emulator is watching
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    if (getApps().length === 0) {
      initializeApp({ projectId: 'demo-test' });
    }
    db = getFirestore();
  });

  afterAll(async () => {
    const apps = getApps();
    if (apps.length > 0) {
      await deleteApp(apps[0]);
    }
  });

  beforeEach(async () => {
    // Setup active users for Kitchen, Admin, Driver
    const batch = db.batch();
    batch.set(db.doc('users/kitchen1'), { role: 'kitchen', isActive: true, kitchenId: 'k1' });
    batch.set(db.doc('users/kitchen2'), { role: 'kitchen', isActive: true, kitchenId: 'k2' });
    batch.set(db.doc('users/admin1'), { role: 'admin', isActive: true });
    batch.set(db.doc('users/driver1'), { role: 'delivery', isActive: true });
    batch.set(db.doc('users/cust1'), { id: 'cust1', role: 'customer' });
    await batch.commit();
  });

  it('generates notifications when an order is cancelled', async () => {
    const orderId = 'order-test-1';
    
    // Create initial order
    await db.doc(`orders/${orderId}`).set({
      status: 'scheduled',
      customerId: 'cust1',
      customerName: 'Test Cust',
      mealType: 'lunch',
      date: '2026-08-30',
      deliveryPartnerId: 'driver1',
      kitchenId: 'k1'
    });

    // Cancel order (trigger CF)
    await db.doc(`orders/${orderId}`).update({
      status: 'cancelled',
      updatedAt: 'timestamp'
    });

    // Wait for CF to process
    let notifications: any[] = [];
    for (let i = 0; i < 80; i++) {
      await sleep(500);
      const snap = await db.collection('notifications').where('relatedEntityId', '==', orderId).get();
      notifications = snap.docs.map((d: any) => d.data());
      if (notifications.length >= 3) break;
    }

    console.log(`[TEST] Total notifications found: ${notifications.length}`);
    notifications.forEach(n => console.log(`[TEST] Notification:`, n));

    expect(notifications.length).toBeGreaterThanOrEqual(3);

    const kitchenNotif = notifications.find(n => n.recipientRole === 'kitchen');
    expect(kitchenNotif).toBeDefined();
    expect(kitchenNotif?.recipientId).toBe('kitchen1');

    const adminNotif = notifications.find(n => n.recipientRole === 'admin');
    expect(adminNotif).toBeDefined();
    expect(adminNotif?.recipientId).toBe('admin1');

    const driverNotif = notifications.find(n => n.recipientRole === 'delivery');
    expect(driverNotif).toBeDefined();
    expect(driverNotif?.recipientId).toBe('driver1');
  }, 60000);

  it('is idempotent and uses deterministic IDs', async () => {
    const orderId = 'order-test-idem';
    
    await db.doc(`orders/${orderId}`).set({
      status: 'scheduled',
      customerId: 'cust1',
      mealType: 'dinner',
      date: '2026-08-30',
    });

    // Trigger transition
    await db.doc(`orders/${orderId}`).update({ status: 'cancelled', updatedAt: 'mock' });

    let count = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const snap = await db.collection('notifications').where('relatedEntityId', '==', orderId).get();
      count = snap.docs.length;
      if (count >= 2) break; // at least admin and kitchen
    }

    const adminNotifId = `cancellation_${orderId}_admin_admin1`;
    const docSnap = await db.doc(`notifications/${adminNotifId}`).get();
    expect(docSnap.exists).toBe(true);

    // Verify duplicate execution does not create more records
    // Manually trigger another update to the same status or simulate retry
    await db.doc(`orders/${orderId}`).update({ status: 'cancelled', updatedAt: 'mock2' });
    
    // Wait to ensure CF has time to process (it should exit early or overwrite idemptotently)
    await sleep(2000);
    
    const snap2 = await db.collection('notifications').where('relatedEntityId', '==', orderId).get();
    expect(snap2.docs.length).toBe(count);

    expect(docSnap.id).toBe(adminNotifId);
  }, 30000);

  it('notifies only the specific kitchen assigned to the order', async () => {
    const orderId = 'order-test-k2';
    
    // Order assigned to k2
    await db.doc(`orders/${orderId}`).set({
      status: 'scheduled',
      customerId: 'cust1',
      mealType: 'dinner',
      date: '2026-08-30',
      kitchenId: 'k2'
    });

    await db.doc(`orders/${orderId}`).update({ status: 'cancelled', updatedAt: 'timestamp' });

    let notifications: any[] = [];
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const snap = await db.collection('notifications').where('relatedEntityId', '==', orderId).get();
      notifications = snap.docs.map((d: any) => d.data());
      if (notifications.length >= 2) break; // Expecting admin and kitchen2
    }

    const kitchenNotifs = notifications.filter(n => n.recipientRole === 'kitchen');
    expect(kitchenNotifs.length).toBe(1);
    expect(kitchenNotifs[0].recipientId).toBe('kitchen2'); // Kitchen 1 should NOT be notified
  }, 30000);
});
