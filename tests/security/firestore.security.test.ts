/**
 * Firestore Security Rules — Penetration Test Suite
 *
 * Tests the production firestore.rules using @firebase/rules-unit-testing
 * against the local Firestore Emulator. Attempts every meaningful attack
 * vector: IDOR, privilege escalation, cross-role access, field tampering,
 * status-machine bypasses, and unauthorized reads/writes.
 *
 * Run with:
 *   npx firebase emulators:start --only firestore --project demo-security-test
 *   npx vitest run --config vitest.int.config.ts tests/security/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp,
} from '@firebase/firestore';

const PROJECT_ID = 'demo-test-order-history-rules';

const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Firestore Security Rules — Full Penetration Suite', () => {
  let env: RulesTestEnvironment;

  // ─── Seed helpers ────────────────────────────────────────────────────────
  const ADMIN_UID = 'uid-admin';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const CUSTOMER_B_UID = 'uid-customer-b';
  const KITCHEN_UID = 'uid-kitchen';
  const DELIVERY_UID = 'uid-delivery';
  const DELIVERY_B_UID = 'uid-delivery-b';
  const ACCOUNTS_UID = 'uid-accounts';

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
        // Users
        setDoc(doc(db, 'users', ADMIN_UID),       { id: ADMIN_UID, role: 'admin',            email: 'admin@test.com',       isActive: true }),
        setDoc(doc(db, 'users', CUSTOMER_A_UID),  { id: CUSTOMER_A_UID, role: 'customer',    email: 'custA@test.com',       isActive: true }),
        setDoc(doc(db, 'users', CUSTOMER_B_UID),  { id: CUSTOMER_B_UID, role: 'customer',    email: 'custB@test.com',       isActive: true }),
        setDoc(doc(db, 'users', KITCHEN_UID),     { id: KITCHEN_UID, role: 'kitchen',        email: 'kitchen@test.com',     isActive: true, kitchenId: 'kitchen-1' }),
        setDoc(doc(db, 'users', DELIVERY_UID),    { id: DELIVERY_UID, role: 'delivery_partner', email: 'delivery@test.com', isActive: true }),
        setDoc(doc(db, 'users', DELIVERY_B_UID),  { id: DELIVERY_B_UID, role: 'delivery_partner', email: 'delB@test.com',  isActive: true }),
        setDoc(doc(db, 'users', ACCOUNTS_UID),    { id: ACCOUNTS_UID, role: 'accounts',      email: 'accounts@test.com',    isActive: true }),

        // Orders
        setDoc(doc(db, 'orders', 'order-a'), {
          customerId: CUSTOMER_A_UID, deliveryPartnerId: DELIVERY_UID, kitchenId: 'kitchen-1',
          status: 'scheduled', date: '2025-01-15', price: 150,
        }),
        setDoc(doc(db, 'orders', 'order-packing'), {
          customerId: CUSTOMER_A_UID, deliveryPartnerId: DELIVERY_UID, kitchenId: 'kitchen-1',
          status: 'packing', date: '2025-01-15', price: 150,
        }),
        setDoc(doc(db, 'orders', 'order-ready'), {
          customerId: CUSTOMER_A_UID, deliveryPartnerId: DELIVERY_UID, kitchenId: 'kitchen-1',
          status: 'ready_for_pickup', date: '2025-01-15', price: 150,
        }),
        setDoc(doc(db, 'orders', 'order-b'), {
          customerId: CUSTOMER_B_UID, deliveryPartnerId: DELIVERY_B_UID, kitchenId: 'kitchen-1',
          status: 'scheduled', date: '2025-01-15', price: 150,
        }),

        // Subscriptions
        setDoc(doc(db, 'subscriptions', 'sub-a'), {
          customerId: CUSTOMER_A_UID, status: 'active',
          pricePerDaySnapshot: 150, creditBalance: 0, quantity: 1,
          updatedAt: new Date(),
        }),
        setDoc(doc(db, 'subscriptions', 'sub-b'), {
          customerId: CUSTOMER_B_UID, status: 'active',
          pricePerDaySnapshot: 150, creditBalance: 0,
        }),

        // Payments
        setDoc(doc(db, 'payments', 'pay-a'), {
          customerId: CUSTOMER_A_UID, status: 'pending', amount: 4500,
        }),
        setDoc(doc(db, 'payments', 'pay-b'), {
          customerId: CUSTOMER_B_UID, status: 'pending', amount: 4500,
        }),

        // Audit Logs
        setDoc(doc(db, 'auditLogs', 'log-1'), {
          actorId: ADMIN_UID, action: 'login', entityType: 'session', entityId: 'sess-1',
          actorRole: 'admin', timestamp: new Date(),
        }),

        // Notifications
        setDoc(doc(db, 'notifications', 'notif-a'), {
          recipientId: CUSTOMER_A_UID, type: 'order_update',
          inAppStatus: 'unread', status: 'unread', message: 'Order ready',
        }),
        setDoc(doc(db, 'notifications', 'notif-admin'), {
          recipientId: ADMIN_UID, type: 'payment_submitted',
          inAppStatus: 'unread', status: 'unread', message: 'Payment received',
        }),

        // Settings
        setDoc(doc(db, 'settings', 'global'), {
          cutoffTime: '10:00', maxOrdersPerDay: 100,
        }),

        // userPhones
        setDoc(doc(db, 'userPhones', '9876543210'), { uid: CUSTOMER_A_UID }),

        // Daily menus
        setDoc(doc(db, 'dailyMenus', 'menu-published'), {
          date: '2025-01-15', status: 'published', title: 'Published menu',
        }),
        setDoc(doc(db, 'dailyMenus', 'menu-draft'), {
          date: '2025-01-16', status: 'draft', title: 'Internal draft menu',
        }),
      ]);
    });
  });

  afterAll(async () => env.cleanup());

  // =========================================================================
  // 1. UNAUTHENTICATED ACCESS
  // =========================================================================
  describe('1. Unauthenticated Access', () => {
    it('DENY: anonymous cannot read any order', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'orders', 'order-a')));
    });

    it('DENY: anonymous cannot read any user profile', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', CUSTOMER_A_UID)));
    });

    it('DENY: anonymous cannot read payments', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-a')));
    });

    it('DENY: anonymous cannot read subscriptions', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-a')));
    });

    it('DENY: anonymous cannot read userPhones (phone enumeration)', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'userPhones', '9876543210')));
    });

    it('DENY: anonymous cannot read notifications', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'notifications', 'notif-a')));
    });

    it('DENY: anonymous cannot read settings', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'settings', 'global')));
    });

    it('ALLOW: anonymous can read mealPlans (public catalog)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'mealPlans', 'plan-1'), { name: 'Premium', pricePerDay: 150 });
      });
      const db = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(db, 'mealPlans', 'plan-1')));
    });

    it('ALLOW: anonymous can read published daily menus', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(db, 'dailyMenus', 'menu-published')));
    });

    it('DENY: anonymous cannot read draft daily menus', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'dailyMenus', 'menu-draft')));
    });

    it('ALLOW: kitchen staff can read draft daily menus', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'dailyMenus', 'menu-draft')));
    });
  });

  // =========================================================================
  // 2. IDOR — Cross-Customer Document Access
  // =========================================================================
  describe('2. IDOR — Customer A attempting to access Customer B data', () => {
    it('DENY: Customer A cannot read Customer B orders', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'orders', 'order-b')));
    });

    it('DENY: Customer A cannot read Customer B subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-b')));
    });

    it('DENY: Customer A cannot read Customer B payment', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-b')));
    });

    it('DENY: Customer A cannot read Customer B profile', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'users', CUSTOMER_B_UID)));
    });

    it('DENY: Customer A cannot update Customer B order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-b'), { status: 'cancelled' }));
    });

    it('DENY: Customer A cannot cancel Customer B order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-b'), { status: 'cancelled', updatedAt: new Date() }));
    });

    it('ALLOW: Customer A can read their own order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'orders', 'order-a')));
    });
  });

  // =========================================================================
  // 3. PRIVILEGE ESCALATION — Customers trying to be Admins
  // =========================================================================
  describe('3. Privilege Escalation', () => {
    it('DENY: Customer cannot change their own role to admin', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'users', CUSTOMER_A_UID), { role: 'admin' }));
    });

    it('DENY: Customer cannot change their own role to kitchen', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'users', CUSTOMER_A_UID), { role: 'kitchen' }));
    });

    it('DENY: Customer cannot create an admin user document', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'users', 'new-admin-uid'), {
        id: 'new-admin-uid', role: 'admin', email: 'hacker@test.com',
      }));
    });

    it('DENY: Customer cannot update another user\'s role', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'users', CUSTOMER_B_UID), { role: 'admin' }));
    });

    it('ALLOW: Admin can change a user\'s role', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'users', KITCHEN_UID), { role: 'kitchen' }));
    });
  });

  // =========================================================================
  // 4. ORDER STATUS MACHINE BYPASS
  // =========================================================================
  describe('4. Order Status Machine Bypasses', () => {
    it('DENY: Kitchen cannot jump order to "delivered"', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), {
        status: 'delivered', updatedAt: new Date(),
      }));
    });

    it('DENY: Kitchen cannot jump order from scheduled to "ready_for_pickup" (skipping packing/packed)', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), {
        status: 'ready_for_pickup', updatedAt: new Date(),
      }));
    });

    it('ALLOW: Kitchen can move scheduled → packing', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-a'), {
        status: 'packing', updatedAt: new Date(),
      }));
    });

    it('ALLOW: Kitchen can move packing → packed', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-packing'), {
        status: 'packed', updatedAt: new Date(),
      }));
    });

    it('DENY: Kitchen cannot update price field', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), {
        price: 0, updatedAt: new Date(),
      }));
    });

    it('DENY: Delivery partner cannot move order from scheduled → out_for_delivery (skip pickup)', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-a'), {
        status: 'out_for_delivery', updatedAt: new Date(),
      }));
    });

    it('ALLOW: Delivery partner can move ready_for_pickup → picked_up', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'picked_up', updatedAt: new Date(),
      }));
    });

    it('DENY: Delivery partner B cannot update Delivery partner A\'s order', async () => {
      const db = env.authenticatedContext(DELIVERY_B_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'picked_up', updatedAt: new Date(),
      }));
    });

    it('ALLOW: Delivery partner can write outForDeliveryAt during out_for_delivery transition', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), 'orders', 'order-ready'), { status: 'picked_up' });
      });
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'out_for_delivery', updatedAt: new Date(),
        outForDeliveryAt: serverTimestamp()
      }));
    });

    it('DENY: Delivery partner cannot set outForDeliveryAt to a past/future date', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), 'orders', 'order-ready'), { status: 'picked_up', outForDeliveryAt: null });
      });
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'out_for_delivery', updatedAt: new Date(),
        outForDeliveryAt: new Date(Date.now() - 100000)
      }));
    });

    it('DENY: Delivery partner cannot write SLA timestamps without correct status transition', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      // Trying to write outForDeliveryAt while picking up
      await assertFails(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'picked_up', updatedAt: new Date(),
        outForDeliveryAt: serverTimestamp()
      }));
    });

    it('DENY: Customer cannot skip "scheduled" and cancel a packing order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-packing'), {
        status: 'cancelled', updatedAt: new Date(),
      }));
    });
  });

  // =========================================================================
  // 5. SUBSCRIPTION STATUS MACHINE BYPASS
  // =========================================================================
  describe('5. Subscription Status Machine Bypass', () => {
    it('DENY: Customer cannot self-activate a subscription (skip payment)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'subscriptions', 'sub-pending'), {
          customerId: CUSTOMER_A_UID, status: 'pending_payment',
          pricePerDaySnapshot: 150, creditBalance: 0,
        });
      });
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-pending'), {
        status: 'active', updatedAt: new Date(),
      }));
    });

    it('DENY: Customer cannot modify subscription price', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-a'), {
        pricePerDaySnapshot: 1, updatedAt: new Date(),
      }));
    });

    it('ALLOW: Customer can pause their own active subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'subscriptions', 'sub-a'), {
        status: 'paused', updatedAt: new Date(),
      }));
    });

    it('DENY: Customer A cannot pause Customer B subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-b'), {
        status: 'paused', updatedAt: new Date(),
      }));
    });
  });

  // =========================================================================
  // 6. PAYMENT TAMPERING
  // =========================================================================
  describe('6. Payment Tampering', () => {
    it('DENY: Customer A cannot read Customer B payment', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-b')));
    });

    it('DENY: Customer cannot verify their own payment (status → verified)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'payments', 'pay-a'), { status: 'verified' }));
    });

    it('DENY: Customer cannot change payment amount', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'payments', 'pay-a'), { amount: 1 }));
    });

    it('DENY: Kitchen cannot read any payment', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-a')));
    });

    it('DENY: Delivery partner cannot read any payment', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(getDoc(doc(db, 'payments', 'pay-a')));
    });

    it('ALLOW: Accounts can read payments', async () => {
      const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'payments', 'pay-a')));
    });

    it('DENY: Accounts cannot update payment status (read-only)', async () => {
      const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertFails(updateDoc(doc(db, 'payments', 'pay-a'), { status: 'verified' }));
    });

    it('ALLOW: Admin can verify payment', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'payments', 'pay-a'), { status: 'verified' }));
    });

    it('DENY: Customer cannot create a payment with status "verified"', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(addDoc(collection(db, 'payments'), {
        customerId: CUSTOMER_A_UID, status: 'verified', amount: 4500,
      }));
    });

    it('ALLOW: Customer can create a payment with status "pending"', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(addDoc(collection(db, 'payments'), {
        subscriptionId: 'sub-a',
        customerId: CUSTOMER_A_UID,
        customerName: 'Cust A',
        amount: 4500,
        currency: 'INR',
        paymentMethod: 'UPI',
        referenceNumber: '123',
        paymentDate: '2025-01-01',
        screenshotUrl: null,
        billingMonth: '2025-01',
        status: 'pending',
        verificationDate: null,
        verifiedBy: null,
        verificationNotes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
    });
  });

  // =========================================================================
  // 7. SETTINGS — Role-restricted access
  // =========================================================================
  describe('7. Settings Access Control', () => {
    it('ALLOW: Customer can read settings', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'global')));
    });

    it('ALLOW: Admin can read settings', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'global')));
    });

    it('ALLOW: Kitchen can read settings', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'global')));
    });

    it('DENY: Kitchen cannot write settings', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'settings', 'global'), { cutoffTime: '12:00' }));
    });

    it('DENY: Delivery partner cannot write settings', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(updateDoc(doc(db, 'settings', 'global'), { cutoffTime: '12:00' }));
    });
  });

  // =========================================================================
  // 8. AUDIT LOG IMMUTABILITY + FIELD INJECTION
  // =========================================================================
  describe('8. Audit Log Security', () => {
    it('DENY: Anyone cannot update an audit log', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'auditLogs', 'log-1'), { action: 'tampered' }));
    });

    it('DENY: Anyone cannot delete an audit log', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'auditLogs', 'log-1')));
    });

    it('DENY: Customer cannot inject arbitrary fields into audit log', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(addDoc(collection(db, 'auditLogs'), {
        actorId: CUSTOMER_A_UID,
        action: 'admin_override',
        entityType: 'subscription',
        entityId: 'sub-a',
        actorRole: 'admin', // injecting false role
        timestamp: new Date(),
        maliciousField: 'injected_payload', // extra disallowed field
      }));
    });

    it('DENY: Customer cannot create audit log for another user', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(addDoc(collection(db, 'auditLogs'), {
        actorId: ADMIN_UID, // spoofing admin UID
        action: 'delete_user',
        entityType: 'user',
        entityId: CUSTOMER_B_UID,
        actorRole: 'admin',
        timestamp: new Date(),
      }));
    });

    it('ALLOW: Customer can create valid audit log for their own actions', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(addDoc(collection(db, 'auditLogs'), {
        performedBy: CUSTOMER_A_UID,
        performedByRole: 'customer',
        action: 'subscription_paused',
        entityType: 'subscription',
        entityId: 'sub-a',
        timestamp: new Date(),
      }));
    });
  });

  // =========================================================================
  // 9. NOTIFICATION TAMPERING
  // =========================================================================
  describe('9. Notification Security', () => {
    it('DENY: Customer A cannot read Customer B notification', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'notifications', 'notif-admin')));
    });

    it('DENY: Customer cannot change notification type or message', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'notifications', 'notif-a'), {
        message: 'Hacked!', type: 'admin_alert',
      }));
    });

    it('ALLOW: Recipient can mark notification as read', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'notif-a'), {
        inAppStatus: 'read', status: 'read', readAt: new Date(), updatedAt: new Date(),
      }));
    });
  });

  // =========================================================================
  // 10. DELIVERY PARTNER — Cross-driver IDOR
  // =========================================================================
  describe('10. Delivery Partner Cross-Driver IDOR', () => {
    it('DENY: Delivery B cannot read Delivery A assigned order', async () => {
      const db = env.authenticatedContext(DELIVERY_B_UID).firestore();
      await assertFails(getDoc(doc(db, 'orders', 'order-a')));
    });

    it('DENY: Delivery B cannot update Delivery A order status', async () => {
      const db = env.authenticatedContext(DELIVERY_B_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-ready'), {
        status: 'picked_up', updatedAt: new Date(),
      }));
    });
  });

  // =========================================================================
  // 11. DOCUMENT DELETION — Deletion restrictions
  // =========================================================================
  describe('11. Document Deletion Restrictions', () => {
    it('DENY: Customer cannot delete their own order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'orders', 'order-a')));
    });

    it('DENY: Admin cannot delete an order', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'orders', 'order-a')));
    });

    it('DENY: Admin cannot delete a subscription', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a')));
    });

    it('DENY: Admin cannot delete a user', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'users', CUSTOMER_A_UID)));
    });
  });

  // =========================================================================
  // 12. HR MODULE — Cross-staff IDOR
  // =========================================================================
  describe('12. HR Module — Cross-Staff IDOR', () => {
    it('DENY: Kitchen staff cannot create attendance record for another staff', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(addDoc(collection(db, 'attendance'), {
        staffId: DELIVERY_UID, // different staff
        date: '2025-01-15',
        checkIn: '09:00',
      }));
    });

    it('ALLOW: Kitchen staff can create attendance record for themselves', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(addDoc(collection(db, 'attendance'), {
        staffId: KITCHEN_UID,
        date: '2025-01-15',
        checkIn: '09:00',
      }));
    });
  });

  // =========================================================================
  // 13. SUBSCRIPTION ORDER CREATION BOUNDARY
  // =========================================================================
  describe('13. Subscription Order Creation Boundary', () => {
    it('DENY: Customer cannot create a subscription order (must use unskipRequests)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(addDoc(collection(db, 'orders'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        source: 'subscription',
        status: 'scheduled',
        date: '2025-05-05',
        mealType: 'lunch',
        price: 0,
      }));
    });

    it('DENY: Customer cannot forge another customer subscription order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'ord_sub-b_2025-05-05_lunch'), {
        customerId: CUSTOMER_B_UID,
        subscriptionId: 'sub-b',
        source: 'subscription',
        status: 'scheduled',
        date: '2025-05-05',
        mealType: 'lunch',
        price: 0,
      }));
    });

    it('DENY: Customer cannot use a fake subscription ID', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'ord_fake_2025-05-05_lunch'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'fake',
        source: 'subscription',
        status: 'scheduled',
        date: '2025-05-05',
        mealType: 'lunch',
        price: 0,
      }));
    });

    it('ALLOW: Customer can create an unskipRequest', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'unskipRequests', 'req-1'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        date: '2099-12-31',
        mealTypes: ['lunch'],
        status: 'pending',
        createdAt: new Date(),
      }));
    });
  });

  // =========================================================================
  // 14. ONE-TIME ORDER SECURITY (FINDING 1)
  // =========================================================================
  describe('14. One-Time Order Creation Security', () => {
    const validOneTimeOrder = {
      id: 'trial-1',
      displayId: 'ORD-ABC',
      source: 'one_time',
      customerId: CUSTOMER_A_UID,
      customerName: 'Cust A',
      customerCode: 'C-A',
      customerPhone: '987',
      address: 'Test Addr',
      subscriptionId: null,
      planTier: 'basic',
      mealType: 'lunch',
      date: '2025-05-05',
      itemsLabel: 'Trial',
      selectedOptionId: null,
      price: 150,
      currency: 'INR',
      status: 'scheduled',
      deliveryAddressId: 'addr1',
      zoneId: null,
      kitchenId: null,
      deliveryPartnerId: null,
      deliveryWindow: null,
      paymentId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('DENY: Customer cannot create a zero-price scheduled one-time order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'trial-zero'), {
        ...validOneTimeOrder,
        price: 0
      }));
    });

    it('DENY: Customer cannot create a negative-price order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'trial-neg'), {
        ...validOneTimeOrder,
        price: -100
      }));
    });

    it('DENY: Customer cannot self-assign deliveryPartnerId', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'trial-del'), {
        ...validOneTimeOrder,
        deliveryPartnerId: 'partner-1'
      }));
    });

    it('DENY: Customer cannot forge another customer order', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'trial-forge'), {
        ...validOneTimeOrder, // has customerId: CUSTOMER_A_UID
      }));
    });

    it('DENY: Customer cannot inject unauthorized operational fields', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'orders', 'trial-extra'), {
        ...validOneTimeOrder,
        kitchenStatus: 'ready' // not in allowlist
      }));
    });

    it('ALLOW: Legitimate existing one-time/trial flow succeeds', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'orders', 'trial-valid'), validOneTimeOrder));
    });
  });

  // =========================================================================
  // 15. PAYMENT CREATION SECURITY (FINDING 4)
  // =========================================================================
  describe('15. Payment Creation Security', () => {
    const validPayment = {
      subscriptionId: 'sub-a',
      customerId: CUSTOMER_A_UID,
      customerName: 'Cust A',
      amount: 4500,
      currency: 'INR',
      paymentMethod: 'UPI',
      referenceNumber: '123',
      paymentDate: '2025-01-01',
      screenshotUrl: 'http',
      billingMonth: '2025-01',
      status: 'pending',
      verificationDate: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('DENY: Payment without createdAt is denied', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      const { createdAt, ...withoutCreatedAt } = validPayment;
      await assertFails(setDoc(doc(db, 'payments', 'pay-new'), withoutCreatedAt));
    });

    it('ALLOW: Payment with valid createdAt is allowed if legitimate', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'payments', 'pay-valid-1'), validPayment));
    });

    it('DENY: Customer cannot create payment for another customer subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore(); // B trying to pay for A's sub
      await assertFails(setDoc(doc(db, 'payments', 'pay-cross'), {
        ...validPayment,
        customerId: CUSTOMER_B_UID // trying to bypass ownership check
      }));
    });

    it('DENY: Customer cannot inject unauthorized payment fields', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'payments', 'pay-extra'), {
        ...validPayment,
        adminNotes: 'approved'
      }));
    });
    
    it('DENY: Payment amount must be > 0', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'payments', 'pay-zero'), {
        ...validPayment,
        amount: 0
      }));
    });
  });

  // =========================================================================
  // 16. CANCELLATION NOTIFICATIONS (Redesign Verification)
  // =========================================================================
  describe('16. Cancellation Notifications & State Tracking', () => {
    it('DENY: Customer cannot create privileged system_alert notifications', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'notifications', 'notif-kitchen-alert'), {
        recipientId: KITCHEN_UID,
        recipientRole: 'kitchen',
        channel: 'in_app',
        type: 'system_alert',
        title: 'Cancel',
        message: 'Order cancelled',
        createdBy: CUSTOMER_A_UID
      }));
    });
  });
});
