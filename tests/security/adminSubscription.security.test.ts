import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-admin-sub-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E3 — Admin-Assisted Subscription Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-e3';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const CUSTOMER_B_UID = 'uid-customer-b';
  const KITCHEN_UID = 'uid-kitchen-e3';
  const DELIVERY_UID = 'uid-delivery-e3';
  const ACCOUNTS_UID = 'uid-accounts-e3';

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
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin' });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID), { id: CUSTOMER_A_UID, role: 'customer' });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID), { id: CUSTOMER_B_UID, role: 'customer' });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', kitchenId: 'KITCHEN_1' });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner' });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts' });

      await setDoc(doc(db, 'mealPlans', 'plan-std'), {
        id: 'plan-std',
        tier: 'standard',
        name: 'Standard Meal Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        isActive: true,
      });

      await setDoc(doc(db, 'settings', 'business'), {
        pricing: { securityDepositAmount: 1000 },
      });
    });
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('ALLOW: Admin can create subscription for another customer', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-for-cust-a'), {
        id: 'sub-admin-for-cust-a',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
        status: 'active',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Admin can manage and update subscription for another customer', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subscriptions', 'sub-to-update'), {
        id: 'sub-to-update',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        autoRenew: true,
        updatedAt: new Date(),
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-to-update'), {
        autoRenew: false,
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription for another customer', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-for-other'), {
        id: 'sub-cust-for-other',
        customerId: CUSTOMER_B_UID, // Customer A attempting to create for Customer B
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        deliveryPartnerId: null,
        pauseStartDate: null,
        pauseEndDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot impersonate Admin by creating active subscription directly', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-active-attempt'), {
        id: 'sub-cust-active-attempt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
        status: 'active', // Only admin can set active directly at creation
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Kitchen cannot create customer subscriptions', async (ctx) => {
    if (!env) return ctx.skip();
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      setDoc(doc(kitchenDb, 'subscriptions', 'sub-kitchen-attempt'), {
        id: 'sub-kitchen-attempt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );
  });

  it('DENY: Delivery Partner cannot create customer subscriptions', async (ctx) => {
    if (!env) return ctx.skip();
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      setDoc(doc(deliveryDb, 'subscriptions', 'sub-delivery-attempt'), {
        id: 'sub-delivery-attempt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );
  });

  it('DENY: Accounts cannot create customer subscriptions', async (ctx) => {
    if (!env) return ctx.skip();
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      setDoc(doc(accountsDb, 'subscriptions', 'sub-accounts-attempt'), {
        id: 'sub-accounts-attempt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );
  });
});
