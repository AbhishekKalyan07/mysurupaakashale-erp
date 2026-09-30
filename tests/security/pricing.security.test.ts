import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-pricing-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E2 — Pricing Configuration Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-pricing';
  const CUSTOMER_UID = 'uid-customer-pricing';
  const KITCHEN_UID = 'uid-kitchen-pricing';
  const DELIVERY_UID = 'uid-delivery-pricing';
  const ACCOUNTS_UID = 'uid-accounts-pricing';

  const validPricingData = {
    effectiveFrom: '2026-11-01',
    pricing: {
      standard: {
        meals: { breakfast: 60, lunch: 110, dinner: 110 },
        combos: { lunch_dinner: 200, all_three: 250 },
      },
    },
    status: 'scheduled',
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    createdBy: ADMIN_UID,
    updatedBy: ADMIN_UID,
  };

  beforeAll(async () => {
    try {
      env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
        },
      });
    } catch {
      // Offline/no running emulator
    }
  });

  beforeEach(async (ctx) => {
    if (!env) {
      ctx.skip();
      return;
    }
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Setup role users
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', isActive: true });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });

      // Seed an active configuration and a scheduled configuration
      await setDoc(doc(db, 'pricingConfigurations', 'price-active-1'), {
        id: 'price-active-1',
        effectiveFrom: '2026-01-01',
        pricing: {
          standard: {
            meals: { breakfast: 50, lunch: 100, dinner: 100 },
            combos: { lunch_dinner: 190, all_three: 230 },
          },
        },
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: ADMIN_UID,
        updatedBy: ADMIN_UID,
      });

      await setDoc(doc(db, 'pricingConfigurations', 'price-scheduled-1'), {
        id: 'price-scheduled-1',
        effectiveFrom: '2026-12-01',
        pricing: {
          standard: {
            meals: { breakfast: 55, lunch: 105, dinner: 105 },
            combos: { lunch_dinner: 200, all_three: 240 },
          },
        },
        status: 'scheduled',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        createdBy: ADMIN_UID,
        updatedBy: ADMIN_UID,
      });
    });
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  // 1. Read permissions
  it('ALLOW: Signed-in users (customer, admin, accounts) can read pricing configurations', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(custDb, 'pricingConfigurations', 'price-active-1')));
    expect(snap.exists()).toBe(true);

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'pricingConfigurations', 'price-scheduled-1')));
  });

  it('DENY: Unauthenticated users cannot read pricing configurations', async () => {
    const unauthDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'pricingConfigurations', 'price-active-1')));
  });

  // 2. Create permissions
  it('ALLOW: Admin can create a valid pricing configuration', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'pricingConfigurations', 'price-new-1'), validPricingData));
  });

  it('DENY: Admin cannot create invalid pricing configuration with negative price', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const invalid = {
      ...validPricingData,
      pricing: {
        standard: {
          meals: { breakfast: -10, lunch: 100, dinner: 100 },
          combos: { lunch_dinner: 200, all_three: 250 },
        },
      },
    };
    await assertFails(setDoc(doc(adminDb, 'pricingConfigurations', 'price-invalid-1'), invalid));
  });

  it('DENY: Customer cannot create pricing configuration', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(custDb, 'pricingConfigurations', 'price-new-cust'), validPricingData));
  });

  it('DENY: Kitchen cannot create pricing configuration', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(setDoc(doc(kitchenDb, 'pricingConfigurations', 'price-new-kitchen'), validPricingData));
  });

  it('DENY: Delivery Partner cannot create pricing configuration', async () => {
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(setDoc(doc(deliveryDb, 'pricingConfigurations', 'price-new-delivery'), validPricingData));
  });

  it('DENY: Accounts cannot create pricing configuration', async () => {
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(setDoc(doc(accountsDb, 'pricingConfigurations', 'price-new-accounts'), validPricingData));
  });

  // 3. Update permissions
  it('ALLOW: Admin can update scheduled pricing configuration', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'pricingConfigurations', 'price-scheduled-1'), {
        'pricing.standard.meals.breakfast': 58,
        updatedAt: '2026-09-29T11:00:00.000Z',
      })
    );
  });

  it('DENY: Admin cannot rewrite price numbers on active pricing configuration', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'pricingConfigurations', 'price-active-1'), {
        'pricing.standard.meals.breakfast': 999,
        updatedAt: '2026-09-29T11:00:00.000Z',
      })
    );
  });

  it('ALLOW: Admin can archive/deactivate active pricing configuration without altering price numbers', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'pricingConfigurations', 'price-active-1'), {
        status: 'archived',
        effectiveTo: '2026-10-31',
        updatedAt: '2026-09-29T11:00:00.000Z',
        updatedBy: ADMIN_UID,
      })
    );
  });

  // 4. Delete permissions
  it('ALLOW: Admin can delete scheduled pricing configuration', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, 'pricingConfigurations', 'price-scheduled-1')));
  });

  it('DENY: Admin cannot delete active pricing configuration (financial history protected)', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(deleteDoc(doc(adminDb, 'pricingConfigurations', 'price-active-1')));
  });

  it('DENY: Customer cannot update or delete scheduled or active pricing configuration', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'pricingConfigurations', 'price-scheduled-1'), {
        'pricing.standard.meals.breakfast': 1,
      })
    );
    await assertFails(deleteDoc(doc(custDb, 'pricingConfigurations', 'price-scheduled-1')));
  });

  it('DENY: Kitchen cannot update or delete pricing configuration', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      updateDoc(doc(kitchenDb, 'pricingConfigurations', 'price-scheduled-1'), {
        'pricing.standard.meals.breakfast': 1,
      })
    );
    await assertFails(deleteDoc(doc(kitchenDb, 'pricingConfigurations', 'price-scheduled-1')));
  });

  it('DENY: Delivery partner cannot update or delete pricing configuration', async () => {
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      updateDoc(doc(deliveryDb, 'pricingConfigurations', 'price-scheduled-1'), {
        'pricing.standard.meals.breakfast': 1,
      })
    );
    await assertFails(deleteDoc(doc(deliveryDb, 'pricingConfigurations', 'price-scheduled-1')));
  });

  it('DENY: Accounts cannot update or delete pricing configuration', async () => {
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      updateDoc(doc(accountsDb, 'pricingConfigurations', 'price-scheduled-1'), {
        'pricing.standard.meals.breakfast': 1,
      })
    );
    await assertFails(deleteDoc(doc(accountsDb, 'pricingConfigurations', 'price-scheduled-1')));
  });
});
