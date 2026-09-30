import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from '@firebase/firestore';

const PROJECT_ID = 'demo-admin-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase D.6 — Admin Management & Authorization Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-d6';
  const ACCOUNTS_UID = 'uid-accounts-d6';
  const CUSTOMER_A_UID = 'uid-cust-a';
  const CUSTOMER_B_UID = 'uid-cust-b';
  const KITCHEN_UID = 'uid-kitchen-d6';
  const DELIVERY_UID = 'uid-delivery-d6';

  const FUTURE_DATE = '2099-12-31';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Setup users
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', isActive: true });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
        id: CUSTOMER_A_UID,
        role: 'customer',
        fullName: 'Customer Alice',
        phone: '9876543210',
        email: 'alice@example.com',
      });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID), {
        id: CUSTOMER_B_UID,
        role: 'customer',
        fullName: 'Customer Bob',
        phone: '9876543211',
        email: 'bob@example.com',
      });

      // Subscriptions
      await setDoc(doc(db, 'subscriptions', 'sub-alice'), {
        id: 'sub-alice',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planTier: 'standard',
        pricePerDaySnapshot: 140,
        startDate: '2026-01-01',
        endDate: '2099-12-31',
        mealPreferences: [{ mealType: 'lunch' }],
        updatedAt: new Date(),
      });
      await setDoc(doc(db, 'subscriptions', 'sub-bob-pending'), {
        id: 'sub-bob-pending',
        customerId: CUSTOMER_B_UID,
        status: 'pending_payment',
        planTier: 'standard',
        depositAmount: 1000,
        updatedAt: new Date(),
      });

      // Orders
      await setDoc(doc(db, 'orders', 'ord-alice-1'), {
        id: 'ord-alice-1',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        date: FUTURE_DATE,
        mealType: 'lunch',
        status: 'scheduled',
        price: 60,
      });

      // Invoices
      await setDoc(doc(db, 'invoices', 'inv-alice-1'), {
        id: 'inv-alice-1',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        totalAmount: 1400,
        subtotal: 1400,
        status: 'issued',
        currency: 'INR',
        lineItems: [{ description: 'Meals', amount: 1400, quantity: 1, unitPrice: 1400 }],
        createdAt: new Date(),
      });

      // Payments
      await setDoc(doc(db, 'payments', 'pay-alice-1'), {
        id: 'pay-alice-1',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        amount: 1000,
        status: 'pending',
        currency: 'INR',
        purpose: 'security_deposit',
        paymentMethod: 'upi',
        createdAt: new Date(),
      });

      // Audit log
      await setDoc(doc(db, 'auditLogs', 'log-1'), {
        action: 'system_init',
        performedBy: ADMIN_UID,
        performedByRole: 'admin',
        performedByName: 'Admin',
        entityId: 'sys',
        entityType: 'system',
        timestamp: new Date(),
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // ── 1. CUSTOMER MANAGEMENT AUTHORIZATION ──────────────────────────────────────
  describe('Customer Management Authorization', () => {
    it('ALLOW: Admin can read any customer profile', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_A_UID)));
      await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_B_UID)));
    });

    it('DENY: Customer A cannot read Customer B profile (IDOR prevention)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'users', CUSTOMER_B_UID)));
    });

    it('ALLOW: Customer A can read their own profile', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'users', CUSTOMER_A_UID)));
    });

    it('DENY: Customer cannot access audit logs', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'auditLogs', 'log-1')));
    });

    it('ALLOW: Admin can access audit logs', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'auditLogs', 'log-1')));
    });
  });

  // ── 2. SUBSCRIPTION MANAGEMENT ───────────────────────────────────────────────
  describe('Subscription Management', () => {
    it('ALLOW: Admin can read any customer subscription', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'subscriptions', 'sub-alice')));
      await assertSucceeds(getDoc(doc(db, 'subscriptions', 'sub-bob-pending')));
    });

    it('DENY: Customer A cannot read Customer B subscription', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(getDoc(doc(db, 'subscriptions', 'sub-bob-pending')));
    });

    it('ALLOW: Admin can update subscription dates and delivery partner', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'subscriptions', 'sub-alice'), {
          startDate: '2026-02-01',
          deliveryPartnerId: DELIVERY_UID,
          updatedAt: new Date(),
        })
      );
    });

    it('ALLOW: Admin can set negotiated pricing on a subscription', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'subscriptions', 'sub-alice'), {
          negotiatedPricing: {
            breakfast: 35,
            lunch: 55,
            dinner: 55,
            breakfast_lunch: 90,
            lunch_dinner: 110,
            breakfast_dinner: 90,
            breakfast_lunch_dinner: 130,
          },
          updatedAt: new Date(),
        })
      );
    });

    it('DENY: Customer B cannot directly activate pending subscription without payment verification', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(
        updateDoc(doc(db, 'subscriptions', 'sub-bob-pending'), {
          status: 'active',
          updatedAt: new Date(),
        })
      );
    });
  });

  // ── 3. ORDER MANAGEMENT & FINANCIAL INTEGRITY ────────────────────────────────
  describe('Order Management & Financial Safety', () => {
    it('ALLOW: Admin can read all customer orders', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'orders', 'ord-alice-1')));
    });

    it('DENY: Customer B cannot read Customer A order', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(getDoc(doc(db, 'orders', 'ord-alice-1')));
    });

    it('ALLOW: Admin can update order status workflow', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'orders', 'ord-alice-1'), {
          status: 'preparing',
          updatedAt: new Date(),
        })
      );
    });

    it('DENY: Admin cannot create an orphan add-on order without invoice mutation', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      const orphanAddonRef = doc(db, 'orders', 'ord-orphan-addon');
      // Direct write of addon order without corresponding invoice update
      await assertFails(
        setDoc(orphanAddonRef, {
          id: 'ord-orphan-addon',
          source: 'subscription',
          customerId: CUSTOMER_A_UID,
          subscriptionId: 'sub-alice',
          date: FUTURE_DATE,
          mealType: 'lunch',
          isAddon: true,
          addonId: 'addon_paneer',
          addonName: 'Paneer Add-on',
          addonQuantity: 1,
          addonUnitPrice: 40,
          price: 40,
          currency: 'INR',
          status: 'scheduled',
          invoiceId: 'inv-nonexistent',
          createdAt: new Date(),
        })
      );
    });

    it('DENY: Admin cannot create add-on order with forged unit price', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      const addonRef = doc(db, 'orders', 'ord-forged-addon');
      const invRef = doc(db, 'invoices', 'inv-forged');

      const batch = writeBatch(db);
      batch.set(addonRef, {
        id: 'ord-forged-addon',
        source: 'subscription',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        date: FUTURE_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_paneer',
        addonName: 'Paneer Add-on',
        addonQuantity: 1,
        addonUnitPrice: 1, // FORGED (should be 40)
        price: 1,
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-forged',
        createdAt: new Date(),
      });
      batch.set(invRef, {
        id: 'inv-forged',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        totalAmount: 1,
        subtotal: 1,
        currency: 'INR',
        status: 'issued',
        lineItems: [{ description: 'Forged', amount: 1, quantity: 1, unitPrice: 1 }],
      });

      // Price validation fails
      await assertFails(batch.commit());
    });

    it('ALLOW: Admin can create Sweet ₹35 add-on order with atomic invoice mutation', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      const addonRef = doc(db, 'orders', 'ord-admin-sweet-addon');
      const invRef = doc(db, 'invoices', 'inv-admin-sweet');

      const batch = writeBatch(db);
      batch.set(addonRef, {
        id: 'ord-admin-sweet-addon',
        source: 'subscription',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        date: FUTURE_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_sweet',
        addonName: 'Gulab Jamun (2 pcs)',
        addonQuantity: 2,
        addonUnitPrice: 35,
        price: 70, // 35 * 2
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-admin-sweet',
        createdAt: new Date(),
      });
      batch.set(invRef, {
        id: 'inv-admin-sweet',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        totalAmount: 70,
        subtotal: 70,
        currency: 'INR',
        status: 'issued',
        lineItems: [{ description: 'Sweet', amount: 70, quantity: 2, unitPrice: 35, addonId: 'addon_sweet' }],
        createdAt: new Date(),
      });

      await assertSucceeds(batch.commit());
    });

    it('DENY: Admin cannot create add-on order with incorrect total calculation', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      const addonRef = doc(db, 'orders', 'ord-admin-wrong-total');
      const invRef = doc(db, 'invoices', 'inv-admin-wrong-total');

      const batch = writeBatch(db);
      batch.set(addonRef, {
        id: 'ord-admin-wrong-total',
        source: 'subscription',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        date: FUTURE_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_sweet',
        addonName: 'Gulab Jamun (2 pcs)',
        addonQuantity: 2,
        addonUnitPrice: 35,
        price: 60, // WRONG! 35 * 2 != 60
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-admin-wrong-total',
        createdAt: new Date(),
      });
      batch.set(invRef, {
        id: 'inv-admin-wrong-total',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        totalAmount: 60,
        subtotal: 60,
        currency: 'INR',
        status: 'issued',
        lineItems: [{ description: 'Sweet', amount: 60, quantity: 2, unitPrice: 35 }],
        createdAt: new Date(),
      });

      await assertFails(batch.commit());
    });

    it('DENY: Admin cannot create add-on order with uncataloged unit price', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      const addonRef = doc(db, 'orders', 'ord-admin-wrong-unit');
      const invRef = doc(db, 'invoices', 'inv-admin-wrong-unit');

      const batch = writeBatch(db);
      batch.set(addonRef, {
        id: 'ord-admin-wrong-unit',
        source: 'subscription',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        date: FUTURE_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_sweet',
        addonName: 'Gulab Jamun (2 pcs)',
        addonQuantity: 1,
        addonUnitPrice: 30, // WRONG! Authoritative unit price is 35
        price: 30,
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-admin-wrong-unit',
        createdAt: new Date(),
      });
      batch.set(invRef, {
        id: 'inv-admin-wrong-unit',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-alice',
        totalAmount: 30,
        subtotal: 30,
        currency: 'INR',
        status: 'issued',
        lineItems: [{ description: 'Sweet', amount: 30, quantity: 1, unitPrice: 30 }],
        createdAt: new Date(),
      });

      await assertFails(batch.commit());
    });
  });

  // ── 4. ACCOUNTS & INVOICE MANAGEMENT ─────────────────────────────────────────
  describe('Accounts & Billing Management', () => {
    it('ALLOW: Admin and Accounts can read invoices and payments', async () => {
      const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
      const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertSucceeds(getDoc(doc(adminDb, 'invoices', 'inv-alice-1')));
      await assertSucceeds(getDoc(doc(accountsDb, 'invoices', 'inv-alice-1')));
      await assertSucceeds(getDoc(doc(adminDb, 'payments', 'pay-alice-1')));
      await assertSucceeds(getDoc(doc(accountsDb, 'payments', 'pay-alice-1')));
    });

    it('DENY: Customer B cannot read Customer A invoice or payment', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(getDoc(doc(db, 'invoices', 'inv-alice-1')));
      await assertFails(getDoc(doc(db, 'payments', 'pay-alice-1')));
    });

    it('DENY: Customer cannot directly update invoice status or payment status', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Try to mark invoice paid
      await assertFails(
        updateDoc(doc(db, 'invoices', 'inv-alice-1'), {
          status: 'paid',
        })
      );
      // Try to verify payment
      await assertFails(
        updateDoc(doc(db, 'payments', 'pay-alice-1'), {
          status: 'verified',
        })
      );
    });

    it('DENY: Cannot create invoice with negative amount', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(
        setDoc(doc(db, 'invoices', 'inv-negative'), {
          id: 'inv-negative',
          customerId: CUSTOMER_A_UID,
          totalAmount: -500,
          subtotal: -500,
          currency: 'INR',
          status: 'issued',
          lineItems: [{ description: 'Invalid', amount: -500, quantity: 1, unitPrice: -500 }],
        })
      );
    });
  });
});
