import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-mysuru-paakashale',
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'admin-1'), { role: 'admin', isActive: true });
    await setDoc(doc(db, 'users', 'cust-1'), { role: 'customer', deliveryPartnerId: 'partner-1' });
    // Delivery partners for Scenario E
    await setDoc(doc(db, 'users', 'partner-1'), { role: 'delivery_partner', isActive: true });
    await setDoc(doc(db, 'users', 'partner-2'), { role: 'delivery_partner', isActive: true });
    // Delivery zones / kitchens needed for order read rules
    await setDoc(doc(db, 'deliveryZones', 'zone-1'), { name: 'Zone 1', kitchenId: 'kitchen-1', isActive: true });
    // Orders for Scenario E: one assigned to partner-1, one to partner-2
    await setDoc(doc(db, 'orders', 'order-p1'), {
      customerId: 'cust-1', deliveryPartnerId: 'partner-1',
      status: 'scheduled', date: '2026-10-01', mealType: 'breakfast',
      kitchenId: 'kitchen-1', zoneId: 'zone-1',
    });
    await setDoc(doc(db, 'orders', 'order-p2'), {
      customerId: 'cust-1', deliveryPartnerId: 'partner-2',
      status: 'scheduled', date: '2026-10-01', mealType: 'lunch',
      kitchenId: 'kitchen-1', zoneId: 'zone-1',
    });
  });
});

describe('mealDeliveryPartners Security Rules', () => {
  const adminAuth = { sub: 'admin-1', email: 'admin@mysurupaakashale.com' } as any;
  const customerAuth = { sub: 'cust-1', email: 'cust@example.com' } as any;
  const partner1Auth = { sub: 'partner-1', email: 'partner1@example.com' } as any;

  it('DENY: Normal customer cannot modify mealDeliveryPartners', async () => {
    const db = testEnv.authenticatedContext('cust-1', customerAuth).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'cust-1'), {
      mealDeliveryPartners: { breakfast: 'partner-2' }
    }));
  });

  it('DENY: Normal customer cannot modify deliveryPartnerId', async () => {
    const db = testEnv.authenticatedContext('cust-1', customerAuth).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'cust-1'), {
      deliveryPartnerId: 'partner-2'
    }));
  });

  it('ALLOW: Authorized admin can modify mealDeliveryPartners', async () => {
    const db = testEnv.authenticatedContext('admin-1', adminAuth).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'cust-1'), {
      mealDeliveryPartners: { breakfast: 'partner-2' }
    }));
  });

  // ── Scenario E: Cross-Delivery-Partner Order Isolation ──────────────────────
  // Verifies that delivery partners can ONLY read orders assigned to themselves.
  // Rule enforced: resource.data.deliveryPartnerId == request.auth.uid (orders/{orderId} allow read).

  it('Scenario E — DENY: Delivery partner 1 cannot read an order assigned to delivery partner 2', async () => {
    const db = testEnv.authenticatedContext('partner-1', partner1Auth).firestore();
    await assertFails(getDoc(doc(db, 'orders', 'order-p2')));
  });

  it('Scenario E — ALLOW: Delivery partner 1 can read their own assigned order', async () => {
    const db = testEnv.authenticatedContext('partner-1', partner1Auth).firestore();
    await assertSucceeds(getDoc(doc(db, 'orders', 'order-p1')));
  });

  it('Scenario E — DENY: Delivery partner 2 cannot read an order assigned to delivery partner 1', async () => {
    const partner2Auth = { sub: 'partner-2', email: 'partner2@example.com' } as any;
    const db = testEnv.authenticatedContext('partner-2', partner2Auth).firestore();
    await assertFails(getDoc(doc(db, 'orders', 'order-p1')));
  });
});
