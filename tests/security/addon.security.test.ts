import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from '@firebase/firestore';
import { AVAILABLE_ADDONS } from '../../src/shared/services/business/pricingService';

const PROJECT_ID = 'demo-addon-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase D.5 — Add-on & Invoice Security Rules', () => {
  let env: RulesTestEnvironment;
  const CUSTOMER_UID = 'uid-customer-addon';
  const OTHER_CUSTOMER_UID = 'uid-other-customer';
  const ADMIN_UID = 'uid-admin-addon';

  const FUTURE_DATE = '2099-12-31';
  const PAST_DATE = '2020-01-01';

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
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer' });
      await setDoc(doc(db, 'users', OTHER_CUSTOMER_UID), { id: OTHER_CUSTOMER_UID, role: 'customer' });
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin' });

      await setDoc(doc(db, 'subscriptions', 'sub-active'), {
        id: 'sub-active',
        customerId: CUSTOMER_UID,
        status: 'active',
        quantity: 1,
        startDate: '2026-01-01',
        endDate: '2099-12-31',
        mealPreferences: [{ mealType: 'lunch' }],
        updatedAt: new Date(),
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // 1. Authoritative add-on order + atomic invoice mutation allowed
  it('ALLOW: Customer can create add-on order atomically with billing invoice mutation', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer`);
    const invRef = doc(db, 'invoices', 'inv_sub-active_2099-12-31');

    const batch = writeBatch(db);
    batch.set(orderRef, {
      id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer`,
      source: 'subscription',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
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
      invoiceId: 'inv_sub-active_2099-12-31',
      createdAt: new Date(),
    });
    batch.set(invRef, {
      id: 'inv_sub-active_2099-12-31',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      lineItems: [
        {
          description: 'Add-on: Paneer Add-on (LUNCH)',
          quantity: 1,
          unitPrice: 40,
          amount: 40,
          addonId: 'addon_paneer',
          mealType: 'lunch',
          orderId: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer`,
        },
      ],
      subtotal: 40,
      totalAmount: 40,
      currency: 'INR',
      status: 'issued',
      billingPeriodStart: '2026-08-01',
      billingPeriodEnd: '2099-12-31',
      dueDate: '2026-08-01',
      createdAt: new Date(),
    });

    await assertSucceeds(batch.commit());
  });

  // 1b. Authoritative Sweet ₹35 add-on order + atomic invoice mutation allowed
  it('ALLOW: Customer can create Sweet ₹35 add-on order atomically with billing invoice mutation', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet`);
    const invRef = doc(db, 'invoices', 'inv_sub-active_sweet_2099-12-31');

    const batch = writeBatch(db);
    batch.set(orderRef, {
      id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet`,
      source: 'subscription',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      date: FUTURE_DATE,
      mealType: 'lunch',
      isAddon: true,
      addonId: 'addon_sweet',
      addonName: 'Gulab Jamun (2 pcs)',
      addonQuantity: 2,
      addonUnitPrice: 35, // Authoritative price from pricingService
      price: 70,          // 35 * 2 = 70
      currency: 'INR',
      status: 'scheduled',
      invoiceId: 'inv_sub-active_sweet_2099-12-31',
      createdAt: new Date(),
    });
    batch.set(invRef, {
      id: 'inv_sub-active_sweet_2099-12-31',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      lineItems: [
        {
          description: 'Add-on: Gulab Jamun (2 pcs) (LUNCH)',
          quantity: 2,
          unitPrice: 35,
          amount: 70,
          addonId: 'addon_sweet',
          mealType: 'lunch',
          orderId: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet`,
        },
      ],
      subtotal: 70,
      totalAmount: 70,
      currency: 'INR',
      status: 'issued',
      billingPeriodStart: '2026-08-01',
      billingPeriodEnd: '2099-12-31',
      dueDate: '2026-08-01',
      createdAt: new Date(),
    });

    await assertSucceeds(batch.commit());
  });

  // 1c. Incorrect unit price rejected (e.g. Sweet with unitPrice 30 instead of 35)
  it('DENY: Customer attempt to create add-on with incorrect unit price is DENIED', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet_wrong_unit`);
    const invRef = doc(db, 'invoices', 'inv_sub-active_sweet_wrong_unit');

    const batch = writeBatch(db);
    batch.set(orderRef, {
      id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet_wrong_unit`,
      source: 'subscription',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      date: FUTURE_DATE,
      mealType: 'lunch',
      isAddon: true,
      addonId: 'addon_sweet',
      addonName: 'Gulab Jamun (2 pcs)',
      addonQuantity: 1,
      addonUnitPrice: 30, // WRONG! Authoritative price is 35
      price: 30,
      currency: 'INR',
      status: 'scheduled',
      invoiceId: 'inv_sub-active_sweet_wrong_unit',
      createdAt: new Date(),
    });
    batch.set(invRef, {
      id: 'inv_sub-active_sweet_wrong_unit',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      totalAmount: 30,
      subtotal: 30,
      currency: 'INR',
      status: 'issued',
      createdAt: new Date(),
    });

    await assertFails(batch.commit());
  });

  // 1d. Incorrect total calculation rejected (e.g. unitPrice 35, quantity 2, total 60 instead of 70)
  it('DENY: Customer attempt to create add-on with incorrect total calculation is DENIED', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet_wrong_total`);
    const invRef = doc(db, 'invoices', 'inv_sub-active_sweet_wrong_total');

    const batch = writeBatch(db);
    batch.set(orderRef, {
      id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_sweet_wrong_total`,
      source: 'subscription',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      date: FUTURE_DATE,
      mealType: 'lunch',
      isAddon: true,
      addonId: 'addon_sweet',
      addonName: 'Gulab Jamun (2 pcs)',
      addonQuantity: 2,
      addonUnitPrice: 35, // Correct unit price
      price: 60,          // WRONG TOTAL! 35 * 2 != 60
      currency: 'INR',
      status: 'scheduled',
      invoiceId: 'inv_sub-active_sweet_wrong_total',
      createdAt: new Date(),
    });
    batch.set(invRef, {
      id: 'inv_sub-active_sweet_wrong_total',
      customerId: CUSTOMER_UID,
      subscriptionId: 'sub-active',
      totalAmount: 60,
      subtotal: 60,
      currency: 'INR',
      status: 'issued',
      createdAt: new Date(),
    });

    await assertFails(batch.commit());
  });

  // 1e. Complete catalog alignment: every item in AVAILABLE_ADDONS is accepted and forged prices rejected
  it('VERIFY: All items in pricingService.AVAILABLE_ADDONS match Firestore rules and reject forged prices', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();

    for (const addon of AVAILABLE_ADDONS) {
      const meal = addon.applicableMealTypes[0];
      const validOrderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_${meal}_addon_${addon.id}_valid`);
      const validInvRef = doc(db, 'invoices', `inv_sub-active_catalog_${addon.id}`);

      // 1. Authoritative unit price is accepted
      const validBatch = writeBatch(db);
      validBatch.set(validOrderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_${meal}_addon_${addon.id}_valid`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        date: FUTURE_DATE,
        mealType: meal,
        isAddon: true,
        addonId: addon.id,
        addonName: addon.name,
        addonQuantity: 1,
        addonUnitPrice: addon.unitPrice,
        price: addon.unitPrice,
        currency: 'INR',
        status: 'scheduled',
        invoiceId: `inv_sub-active_catalog_${addon.id}`,
        createdAt: new Date(),
      });
      validBatch.set(validInvRef, {
        id: `inv_sub-active_catalog_${addon.id}`,
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        lineItems: [
          {
            description: `Add-on: ${addon.name}`,
            quantity: 1,
            unitPrice: addon.unitPrice,
            amount: addon.unitPrice,
            addonId: addon.id,
            mealType: meal,
          },
        ],
        subtotal: addon.unitPrice,
        totalAmount: addon.unitPrice,
        currency: 'INR',
        status: 'issued',
        createdAt: new Date(),
      });
      await assertSucceeds(validBatch.commit());

      // 2. Forged unit price (+5) is rejected
      const forgedOrderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_${meal}_addon_${addon.id}_forged`);
      const forgedInvRef = doc(db, 'invoices', `inv_sub-active_catalog_forged_${addon.id}`);
      const forgedBatch = writeBatch(db);
      forgedBatch.set(forgedOrderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_${meal}_addon_${addon.id}_forged`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        date: FUTURE_DATE,
        mealType: meal,
        isAddon: true,
        addonId: addon.id,
        addonName: addon.name,
        addonQuantity: 1,
        addonUnitPrice: addon.unitPrice + 5, // Forged!
        price: addon.unitPrice + 5,
        currency: 'INR',
        status: 'scheduled',
        invoiceId: `inv_sub-active_catalog_forged_${addon.id}`,
        createdAt: new Date(),
      });
      forgedBatch.set(forgedInvRef, {
        id: `inv_sub-active_catalog_forged_${addon.id}`,
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        totalAmount: addon.unitPrice + 5,
        subtotal: addon.unitPrice + 5,
        currency: 'INR',
        status: 'issued',
        createdAt: new Date(),
      });
      await assertFails(forgedBatch.commit());
    }
  });

  // 2. Direct creation without invoice (orphan add-on) denied
  it('DENY: Customer attempt to create add-on order WITHOUT invoice mutation is DENIED', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_orphan`);
    await assertFails(
      setDoc(orderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_orphan`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
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
        invoiceId: 'inv_non_existent',
        createdAt: new Date(),
      })
    );
  });

  // 3. Direct creation pointing to existing invoice without mutating its total is denied
  it('DENY: Customer attempt to link add-on to existing invoice WITHOUT updating invoice total is DENIED', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'invoices', 'inv-existing-static'), {
        id: 'inv-existing-static',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        totalAmount: 100,
        subtotal: 100,
        currency: 'INR',
        status: 'issued',
        lineItems: [],
        createdAt: new Date(),
      });
    });

    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_static`);
    // Attempting to write order referencing existing invoice WITHOUT updating the invoice total by 40
    await assertFails(
      setDoc(orderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_static`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
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
        invoiceId: 'inv-existing-static',
        createdAt: new Date(),
      })
    );
  });

  // 4. Forged add-on price denied
  it('DENY: Customer cannot forge add-on price (e.g. ₹1 instead of ₹40)', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_forged`);
    await assertFails(
      setDoc(orderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer_forged`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        date: FUTURE_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_paneer',
        addonName: 'Paneer Add-on',
        addonQuantity: 1,
        addonUnitPrice: 1, // FORGED! Authoritative unit price is 40
        price: 1,         // FORGED!
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-any',
        createdAt: new Date(),
      })
    );
  });

  // 5. Cutoff enforcement
  it('DENY: Customer cannot create add-on order after cutoff (past date)', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${PAST_DATE}_lunch_addon_addon_paneer`);
    await assertFails(
      setDoc(orderRef, {
        id: `ord_sub-active_${PAST_DATE}_lunch_addon_addon_paneer`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        date: PAST_DATE,
        mealType: 'lunch',
        isAddon: true,
        addonId: 'addon_paneer',
        addonName: 'Paneer Add-on',
        addonQuantity: 1,
        addonUnitPrice: 40,
        price: 40,
        currency: 'INR',
        status: 'scheduled',
        invoiceId: 'inv-any',
        createdAt: new Date(),
      })
    );
  });

  // 6. Unauthorized customer denied
  it('DENY: Unauthorized customer cannot create add-on order for another customer', async () => {
    const db = env.authenticatedContext(OTHER_CUSTOMER_UID).firestore();
    const orderRef = doc(db, 'orders', `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer`);
    await assertFails(
      setDoc(orderRef, {
        id: `ord_sub-active_${FUTURE_DATE}_lunch_addon_addon_paneer`,
        source: 'subscription',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
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
        invoiceId: 'inv-any',
        createdAt: new Date(),
      })
    );
  });

  // 7. Forged invoice total denied
  it('DENY: Customer cannot create invoice with forged or negative total amount', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const invRef = doc(db, 'invoices', 'inv_sub-active_2026-12-31');
    await assertFails(
      setDoc(invRef, {
        id: 'inv_sub-active_2026-12-31',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        lineItems: [
          {
            description: 'Add-on: Paneer Add-on (LUNCH)',
            quantity: 1,
            unitPrice: 40,
            amount: 40,
            addonId: 'addon_paneer',
            mealType: 'lunch',
          },
        ],
        subtotal: 40,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1, // FORGED! Line item is 40 but totalAmount forged to 1
        currency: 'INR',
        status: 'issued',
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-12-31',
        dueDate: '2026-08-01',
        createdAt: new Date(),
      })
    );
  });

  // 8. Direct financial manipulation denied
  it('DENY: Customer cannot directly update invoice status to paid', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'invoices', 'inv-to-tamper'), {
        id: 'inv-to-tamper',
        customerId: CUSTOMER_UID,
        subscriptionId: 'sub-active',
        totalAmount: 40,
        subtotal: 40,
        currency: 'INR',
        status: 'issued',
        lineItems: [],
        createdAt: new Date(),
      });
    });

    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const invRef = doc(db, 'invoices', 'inv-to-tamper');
    // Attempting to change status to paid without payment
    await assertFails(
      updateDoc(invRef, {
        status: 'paid',
        paidAt: new Date(),
      })
    );
  });
});
