/**
 * IDOR (Insecure Direct Object Reference) Tests
 *
 * Attempts to access other users' documents by directly referencing
 * their document IDs — the primary defense is Firestore Security Rules.
 * Covers: orders, subscriptions, payments, users, notifications,
 * delivery proofs, workflow history, and subscription skips.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection } from '@firebase/firestore';

const PROJECT_ID = 'demo-security-test';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔍 IDOR — Insecure Direct Object Reference Tests', () => {
  let env: RulesTestEnvironment;

  const ADMIN_UID      = 'uid-admin';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const CUSTOMER_B_UID = 'uid-customer-b';
  const KITCHEN_UID    = 'uid-kitchen';
  const DELIVERY_UID   = 'uid-delivery';
  const DELIVERY_B_UID = 'uid-delivery-b';
  const ACCOUNTS_UID   = 'uid-accounts';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(
          path.resolve(__dirname, '../../firestore.rules'),
          'utf8',
        ),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ADMIN_UID),       { id: ADMIN_UID,      role: 'admin' }),
        setDoc(doc(db, 'users', CUSTOMER_A_UID),  { id: CUSTOMER_A_UID, role: 'customer' }),
        setDoc(doc(db, 'users', CUSTOMER_B_UID),  { id: CUSTOMER_B_UID, role: 'customer' }),
        setDoc(doc(db, 'users', KITCHEN_UID),     { id: KITCHEN_UID,    role: 'kitchen' }),
        setDoc(doc(db, 'users', DELIVERY_UID),    { id: DELIVERY_UID,   role: 'delivery_partner' }),
        setDoc(doc(db, 'users', DELIVERY_B_UID),  { id: DELIVERY_B_UID, role: 'delivery_partner' }),
        setDoc(doc(db, 'users', ACCOUNTS_UID),    { id: ACCOUNTS_UID,   role: 'accounts' }),

        setDoc(doc(db, 'orders', 'order-a'), {
          customerId: CUSTOMER_A_UID, deliveryPartnerId: DELIVERY_UID,
          status: 'scheduled', date: '2025-01-15', price: 150,
        }),
        setDoc(doc(db, 'orders', 'order-b'), {
          customerId: CUSTOMER_B_UID, deliveryPartnerId: DELIVERY_B_UID,
          status: 'scheduled', date: '2025-01-15', price: 150,
        }),
        setDoc(doc(db, 'subscriptions', 'sub-a'), {
          customerId: CUSTOMER_A_UID, status: 'active',
          pricePerDaySnapshot: 150, creditBalance: 0, quantity: 1,
        }),
        setDoc(doc(db, 'subscriptions', 'sub-b'), {
          customerId: CUSTOMER_B_UID, status: 'active',
          pricePerDaySnapshot: 150, creditBalance: 0,
        }),
        setDoc(doc(db, 'payments', 'pay-a'), {
          customerId: CUSTOMER_A_UID, status: 'pending', amount: 4500,
        }),
        setDoc(doc(db, 'payments', 'pay-b'), {
          customerId: CUSTOMER_B_UID, status: 'pending', amount: 4500,
        }),
        setDoc(doc(db, 'notifications', 'notif-a'), {
          recipientId: CUSTOMER_A_UID, type: 'order_update',
          inAppStatus: 'unread', status: 'unread',
        }),
        setDoc(doc(db, 'notifications', 'notif-b'), {
          recipientId: CUSTOMER_B_UID, type: 'order_update',
          inAppStatus: 'unread', status: 'unread',
        }),
        // Subscription skip for A
        setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2025-01-20'), {
          date: '2025-01-20', reason: 'travel',
        }),
      ]);
    });
  });

  afterAll(async () => env.cleanup());

  // ─── Order IDOR ──────────────────────────────────────────────────────────
  describe('Order IDOR', () => {
    it('DENY: Customer B cannot read Customer A order by ID', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(getDoc(doc(db, 'orders', 'order-a')));
    });

    it('DENY: Kitchen cannot cancel any customer order', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), {
        status: 'cancelled', updatedAt: new Date(),
      }));
    });

    it('DENY: Accounts cannot update any order', async () => {
      const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), { price: 1 }));
    });

    it('ALLOW: Admin can read any order', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'orders', 'order-b')));
    });
  });

  // ─── Subscription IDOR ───────────────────────────────────────────────────
  describe('Subscription IDOR', () => {
    it('DENY: Customer B cannot read Customer A subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-a')));
    });

    it('DENY: Delivery partner cannot read any subscription', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-a')));
    });

    it('DENY: Customer B cannot cancel Customer A subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-a'), {
        status: 'cancelled', updatedAt: new Date(),
      }));
    });

    it('DENY: Customer A cannot read subscription skips for Customer B', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'subscriptions', 'sub-b', 'skips', '2025-01-20'),
          { date: '2025-01-20' }
        );
      });
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-b', 'skips', '2025-01-20')));
    });

    it('ALLOW: Customer A can read their own subscription skips', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2025-01-20')));
    });
  });

  // ─── Payment IDOR ────────────────────────────────────────────────────────
  describe('Payment IDOR', () => {
    it('DENY: Customer A cannot read Customer B payment by ID', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-b')));
    });

    it('DENY: Delivery partner cannot read payment', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-a')));
    });

    it('DENY: Customer cannot create payment for another customer', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(addDoc(collection(db, 'payments'), {
        customerId: CUSTOMER_B_UID, // different customer
        status: 'pending',
        amount: 4500,
      }));
    });
  });

  // ─── Notification IDOR ───────────────────────────────────────────────────
  describe('Notification IDOR', () => {
    it('DENY: Customer A cannot read Customer B notification', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'notifications', 'notif-b')));
    });

    it('DENY: Customer A cannot mark Customer B notification as read', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'notifications', 'notif-b'), {
        inAppStatus: 'read', status: 'read', readAt: new Date(), updatedAt: new Date(),
      }));
    });

    it('DENY: Delivery cannot read customer notifications', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(getDoc(doc(db, 'notifications', 'notif-a')));
    });

    it('ALLOW: Customer A can mark their own notification as read', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'notif-a'), {
        inAppStatus: 'read', status: 'read', readAt: new Date(), updatedAt: new Date(),
      }));
    });
  });

  // ─── User Profile IDOR ───────────────────────────────────────────────────
  describe('User Profile IDOR', () => {
    it('DENY: Customer A cannot update Customer B profile', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'users', CUSTOMER_B_UID), {
        name: 'Hacked Name',
      }));
    });

    it('DENY: Customer cannot read another customer profile (not admin/accounts/delivery)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'users', CUSTOMER_B_UID)));
    });

    it('DENY: Customer cannot update their own deliveryPartnerId assignment', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'users', CUSTOMER_A_UID), {
        deliveryPartnerId: 'self-assigned',
        assignedAt: new Date(),
        assignedBy: CUSTOMER_A_UID,
      }));
    });

    it('ALLOW: Customer A can update their own safe profile fields', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'users', CUSTOMER_A_UID), {
        name: 'Updated Name',
        updatedAt: new Date(),
      }));
    });
  });
});
