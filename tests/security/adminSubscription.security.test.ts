import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, writeBatch } from '@firebase/firestore';

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

  function makeValidSubscription(id: string, customerId: string, overrides: Record<string, any> = {}) {
    return {
      id,
      customerId,
      planId: 'plan-std',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      deliveryAddressId: 'addr-1',
      zoneId: null,
      mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
      status: 'active',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

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
      await setDoc(doc(db, 'users', CUSTOMER_A_UID), {
        id: CUSTOMER_A_UID,
        role: 'customer',
        addressIds: ['addr-1', 'addr-no-zone-no-pin'],
      });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID), {
        id: CUSTOMER_B_UID,
        role: 'customer',
        addressIds: ['addr-b'],
      });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', kitchenId: 'KITCHEN_1' });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner' });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts' });

      await setDoc(doc(db, 'mealPlans', 'plan-std'), {
        id: 'plan-std',
        tier: 'standard',
        name: 'Standard Meal Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        optionIds: ['std-lunch-1', 'std-dinner-1'],
        lunchOptionIds: ['std-lunch-1'],
        dinnerOptionIds: ['std-dinner-1'],
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-extensible'), {
        id: 'plan-extensible',
        tier: 'corporate_deluxe',
        name: 'Corporate Deluxe Plan',
        pricePerDay: 180,
        pricingMatrix: { breakfast: 50, lunch: 70, dinner: 70, breakfast_lunch_dinner: 180 },
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-210'), {
        id: 'plan-210',
        tier: 'regular',
        name: 'Regular 210 Plan',
        pricePerDay: 210,
        pricingMatrix: { breakfast: 60, lunch: 85, dinner: 85, breakfast_lunch_dinner: 210 },
        optionIds: ['regular-lunch-1', 'regular-dinner-1'],
        lunchOptionIds: ['regular-lunch-1'],
        dinnerOptionIds: ['regular-dinner-1'],
        isActive: true,
      });

      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-1'), {
        id: 'addr-1',
        line1: '123 Main St',
        city: 'Mysuru',
        pincode: '570001',
        zoneId: 'zone-1',
      });

      await setDoc(doc(db, 'users', CUSTOMER_B_UID, 'addresses', 'addr-b'), {
        id: 'addr-b',
        line1: '456 Other St',
        city: 'Mysuru',
        pincode: '570002',
        zoneId: 'zone-2',
      });

      await setDoc(doc(db, 'deliveryZones', 'zone-1'), {
        id: 'zone-1',
        name: 'Zone 1',
        pincodes: ['570001'],
        kitchenId: 'KITCHEN_1',
        isActive: true,
      });

      await setDoc(doc(db, 'deliveryZones', 'zone-2'), {
        id: 'zone-2',
        name: 'Zone 2',
        pincodes: ['570002'],
        kitchenId: 'KITCHEN_1',
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-no-options'), {
        id: 'plan-no-options',
        tier: 'standard',
        name: 'No Options Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        isActive: true,
      });

      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-no-zone-no-pin'), {
        id: 'addr-no-zone-no-pin',
        line1: '999 Unknown St',
        city: 'Mysuru',
      });

      await setDoc(doc(db, 'mealPlans', 'plan-global-only'), {
        id: 'plan-global-only',
        tier: 'standard',
        name: 'Plan with Global Option Not in Lunch',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        optionIds: ['global-opt-1', 'global-opt-2'],
        lunchOptionIds: ['global-opt-1'],
        dinnerOptionIds: ['global-opt-2'],
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-missing-lunch'), {
        id: 'plan-missing-lunch',
        tier: 'standard',
        name: 'Missing Lunch Option IDs Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        optionIds: ['std-lunch-1', 'std-dinner-1'],
        dinnerOptionIds: ['std-dinner-1'],
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-null-dinner'), {
        id: 'plan-null-dinner',
        tier: 'standard',
        name: 'Null Dinner Option IDs Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        optionIds: ['std-lunch-1', 'std-dinner-1'],
        lunchOptionIds: ['std-lunch-1'],
        dinnerOptionIds: null,
        isActive: true,
      });

      await setDoc(doc(db, 'mealPlans', 'plan-empty-lunch'), {
        id: 'plan-empty-lunch',
        tier: 'standard',
        name: 'Empty Lunch Option IDs Plan',
        pricePerDay: 140,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        optionIds: ['std-lunch-1', 'std-dinner-1'],
        lunchOptionIds: [],
        dinnerOptionIds: ['std-dinner-1'],
        isActive: true,
      });

      // User with mirror address but missing root addressIds field
      await setDoc(doc(db, 'users', 'uid-cust-no-address-ids'), {
        id: 'uid-cust-no-address-ids',
        role: 'customer',
      });
      await setDoc(doc(db, 'users', 'uid-cust-no-address-ids', 'addresses', 'addr-valid-mirror'), {
        id: 'addr-valid-mirror',
        line1: '100 Mirror St',
        city: 'Mysuru',
      });

      // User with mirror address but null root addressIds field
      await setDoc(doc(db, 'users', 'uid-cust-null-address-ids'), {
        id: 'uid-cust-null-address-ids',
        role: 'customer',
        addressIds: null,
      });
      await setDoc(doc(db, 'users', 'uid-cust-null-address-ids', 'addresses', 'addr-null-mirror'), {
        id: 'addr-null-mirror',
        line1: '200 Null St',
        city: 'Mysuru',
      });

      // Mirror address exists for CUSTOMER_A_UID but is absent from root addressIds
      await setDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-not-in-index'), {
        id: 'addr-not-in-index',
        line1: '300 Unindexed St',
        city: 'Mysuru',
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

  // ── 1. Subscription Creation Tests ──────────────────────────────────────────

  it('ALLOW: Admin can create subscription in pending_payment status for customer', async (ctx) => {
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
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
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

  it('ALLOW: Authorized admin can create valid active subscription directly for customer', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-active-direct'), {
        id: 'sub-admin-active-direct',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'active',
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

  it('ALLOW: Authorized admin can create draft subscription for customer', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-draft-direct'), {
        id: 'sub-admin-draft-direct',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'draft',
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

  it('DENY: Customer cannot create subscription directly with active status', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-active-direct'), {
        id: 'sub-cust-active-direct',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'active',
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

  it('DENY: Unauthenticated user cannot create subscription', async (ctx) => {
    if (!env) return ctx.skip();
    const unauthDb = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthDb, 'subscriptions', 'sub-unauth-create'), {
        id: 'sub-unauth-create',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }],
        status: 'pending_payment',
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

  it('DENY: Admin cannot create subscription with empty customerId', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-empty-cust'), {
        id: 'sub-admin-empty-cust',
        customerId: '',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }],
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

  it('DENY: Admin cannot create subscription missing required deliveryAddressId', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-missing-addr'), {
        id: 'sub-admin-missing-addr',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }],
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

  it('ALLOW: Customer can create subscription with valid 18 required fields and optional snapshot', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-valid'), {
        id: 'sub-cust-valid',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
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

  it('ALLOW: Customer can create subscription without optional pricingMatrixSnapshot', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-no-snapshot'), {
        id: 'sub-cust-no-snapshot',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        // pricingMatrixSnapshot intentionally omitted
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Customer can create subscription with legitimate extensible planTier', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-extensible-tier'), {
        id: 'sub-cust-extensible-tier',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-extensible',
        planTier: 'corporate_deluxe',
        quantity: 1,
        pricePerDaySnapshot: 180,
        pricingMatrixSnapshot: { breakfast: 50, lunch: 70, dinner: 70, breakfast_lunch_dinner: 180 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with invalid pricing snapshot data', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // Tampered pricePerDaySnapshot mismatching the matrix
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-tampered-price'), {
        id: 'sub-cust-tampered-price',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 20, // Tampered: real price is 140
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription missing billingCycle', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-no-cycle'), {
        id: 'sub-cust-no-cycle',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        // billingCycle missing
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription missing autoRenew', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-no-renew'), {
        id: 'sub-cust-no-renew',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        // autoRenew missing
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with planTier mismatching mealPlan.tier', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-bad-tier'), {
        id: 'sub-cust-bad-tier',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'wrong_tier', // Plan-std has tier 'standard'
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with empty mealPreferences', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-empty-meals'), {
        id: 'sub-cust-empty-meals',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot inject negotiatedPricing on create', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-neg-create'), {
        id: 'sub-cust-neg-create',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        negotiatedPricing: { breakfast: 10, lunch: 10, dinner: 10 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
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
        customerId: CUSTOMER_B_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
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

  it('DENY: Customer cannot submit ₹10 when source plan price is ₹210', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-bypass-price'), {
        id: 'sub-cust-bypass-price',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-210',
        planTier: 'regular',
        quantity: 1,
        pricePerDaySnapshot: 10, // Attempted bypass: real price is 210
        pricingMatrixSnapshot: { breakfast: 60, lunch: 85, dinner: 85, breakfast_lunch_dinner: 210 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot submit arbitrary positive price with no pricing snapshot', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-arbitrary-price'), {
        id: 'sub-cust-arbitrary-price',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 99, // Arbitrary price: real price is 140
        // pricingMatrixSnapshot omitted
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot submit fabricated or nonexistent plan ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-fake-plan'), {
        id: 'sub-cust-fake-plan',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-fabricated-999',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot submit snapshot whose selected meal combination has a different price', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-mismatch-combo'), {
        id: 'sub-cust-mismatch-combo',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 99 }, // Mismatched combo price
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot submit snapshot that does not match trusted plan', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-mismatch-matrix'), {
        id: 'sub-cust-mismatch-matrix',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 10, lunch: 10, dinner: 10, breakfast_lunch_dinner: 140 }, // Tampered inner matrix
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with fabricated address ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-fake-addr'), {
        id: 'sub-cust-fake-addr',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-fabricated-999', // Fabricated address
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it("DENY: Customer cannot create subscription with another customer's address ID", async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-other-addr'), {
        id: 'sub-cust-other-addr',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-b', // Belongs to CUSTOMER_B_UID
        zoneId: null,
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with incorrect zone ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-wrong-zone'), {
        id: 'sub-cust-wrong-zone',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1', // addr-1 is in zone-1 (570001)
        zoneId: 'zone-2', // Incorrect zone (570002)
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Customer can create subscription with valid matching zone ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-matching-zone'), {
        id: 'sub-cust-matching-zone',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: 'zone-1', // Matches addr-1
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: null }, { mealType: 'lunch', selectedOptionId: null }, { mealType: 'dinner', selectedOptionId: null }],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with malformed meal preference entry', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-malformed-meal'), {
        id: 'sub-cust-malformed-meal',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'lunch', extraField: 'illegal' }] as any, // Malformed entry
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with invalid meal type', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-invalid-meal-type'), {
        id: 'sub-cust-invalid-meal-type',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [{ mealType: 'midnight_snack' }] as any, // Invalid meal type
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with nonexistent option ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-fake-option'), {
        id: 'sub-cust-fake-option',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'nonexistent-option-id-xyz' }, // Nonexistent option
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with customer-selectable option on breakfast', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-breakfast-option'), {
        id: 'sub-cust-breakfast-option',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: 'std-lunch-1' }, // Breakfast cannot have selectable option
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' },
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with duplicate meal types', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-dup-meals'), {
        id: 'sub-cust-dup-meals',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' },
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' } // Duplicate mealType
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  // ── 2. Paid Activation Tests ────────────────────────────────────────────────

  it('ALLOW: Matching verified payment activation in atomic batch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-to-pay'), makeValidSubscription('sub-to-pay', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-valid-1'), {
        id: 'pay-valid-1',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-to-pay',
        amount: 1000,
        status: 'pending',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'payments', 'pay-valid-1'), {
      status: 'verified',
    });
    batch.update(doc(adminDb, 'subscriptions', 'sub-to-pay'), {
      status: 'active',
      latestPaymentId: 'pay-valid-1',
      updatedAt: new Date(),
    });
    await assertSucceeds(batch.commit());
  });

  it('ALLOW: Already verified matching payment can be linked to activate subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-pre-verified'), makeValidSubscription('sub-pre-verified', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-pre-verified'), {
        id: 'pay-pre-verified',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-pre-verified',
        amount: 1000,
        status: 'verified',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-pre-verified'), {
        status: 'active',
        latestPaymentId: 'pay-pre-verified',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Paid activation fails if payment is not verified', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-to-pay-unverified'), makeValidSubscription('sub-to-pay-unverified', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-unverified-1'), {
        id: 'pay-unverified-1',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-to-pay-unverified',
        amount: 1000,
        status: 'pending',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-to-pay-unverified'), {
        status: 'active',
        latestPaymentId: 'pay-unverified-1',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Paid activation fails if payment belongs to another customer', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-cust-a-pay'), makeValidSubscription('sub-cust-a-pay', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-cust-b'), {
        id: 'pay-cust-b',
        customerId: CUSTOMER_B_UID,
        subscriptionId: 'sub-cust-a-pay',
        amount: 1000,
        status: 'pending',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'payments', 'pay-cust-b'), { status: 'verified' });
    batch.update(doc(adminDb, 'subscriptions', 'sub-cust-a-pay'), {
      status: 'active',
      latestPaymentId: 'pay-cust-b',
      updatedAt: new Date(),
    });
    await assertFails(batch.commit());
  });

  it('DENY: Paid activation fails if payment belongs to another subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-cust-a-target'), makeValidSubscription('sub-cust-a-target', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-other-sub'), {
        id: 'pay-other-sub',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-other-id',
        amount: 1000,
        status: 'pending',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'payments', 'pay-other-sub'), { status: 'verified' });
    batch.update(doc(adminDb, 'subscriptions', 'sub-cust-a-target'), {
      status: 'active',
      latestPaymentId: 'pay-other-sub',
      updatedAt: new Date(),
    });
    await assertFails(batch.commit());
  });

  it('ALLOW: Paid activation does not modify or bulk-verify other pending payments for customer', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-selective-pay'), makeValidSubscription('sub-selective-pay', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      await setDoc(doc(db, 'payments', 'pay-target'), {
        id: 'pay-target',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-selective-pay',
        amount: 1000,
        status: 'pending',
      });
      await setDoc(doc(db, 'payments', 'pay-unrelated-pending'), {
        id: 'pay-unrelated-pending',
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-unrelated-sub',
        amount: 500,
        status: 'pending',
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'payments', 'pay-target'), { status: 'verified' });
    batch.update(doc(adminDb, 'subscriptions', 'sub-selective-pay'), {
      status: 'active',
      latestPaymentId: 'pay-target',
      updatedAt: new Date(),
    });
    await assertSucceeds(batch.commit());

    // Verify unrelated pending payment remains 'pending'
    const adminCheck = env.authenticatedContext(ADMIN_UID).firestore();
    const unrelatedSnap = await getDoc(doc(adminCheck, 'payments', 'pay-unrelated-pending'));
    expect(unrelatedSnap.data()?.status).toBe('pending');
  });

  // ── 3. Unpaid Activation & Audit Integrity Tests ────────────────────────────

  it('ALLOW: Unpaid activation with matching new audit document in same atomic batch succeeds', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-unpaid-act'), makeValidSubscription('sub-unpaid-act', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-unpaid-act_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-unpaid-act'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      performedByName: 'Admin',
      entityType: 'subscription',
      entityId: 'sub-unpaid-act',
      details: {
        customerId: CUSTOMER_A_UID,
        unpaidConfirmed: true,
        activationMode: 'unpaid_manual_override',
        previousStatus: 'pending_payment',
      },
      previousValue: { status: 'pending_payment' },
      newValue: { status: 'active' },
      reason: 'Approved manual unpaid activation',
      timestamp: new Date(),
      ipAddress: null,
    });

    await assertSucceeds(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if extra unallowed fields are added to top-level audit', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-extra-field'), makeValidSubscription('sub-extra-field', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-extra-field_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-extra-field'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      performedByName: 'Admin',
      entityType: 'subscription',
      entityId: 'sub-extra-field',
      details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
      extraArbitraryField: 'malicious-data', // Extra field forbidden
      timestamp: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if extra unallowed fields are added inside details', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-extra-detail'), makeValidSubscription('sub-extra-detail', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-extra-detail_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-extra-detail'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      performedByName: 'Admin',
      entityType: 'subscription',
      entityId: 'sub-extra-detail',
      details: {
        customerId: CUSTOMER_A_UID,
        unpaidConfirmed: true,
        unauthorizedBackdoor: 'exploit', // Forbidden extra key in details
      },
      timestamp: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if required audit fields are missing', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-missing-field'), makeValidSubscription('sub-missing-field', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-missing-field_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-missing-field'), {
      status: 'active',
      updatedAt: new Date(),
    });

    // Missing details and timestamp
    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      entityType: 'subscription',
      entityId: 'sub-missing-field',
    });

    await assertFails(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if performedBy does not match admin auth.uid', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-wrong-actor'), makeValidSubscription('sub-wrong-actor', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-wrong-actor_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-wrong-actor'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: 'spoofed-admin-uid', // Does not match request.auth.uid
      performedByRole: 'admin',
      entityType: 'subscription',
      entityId: 'sub-wrong-actor',
      details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
      timestamp: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if details.customerId does not match subscription customerId', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-wrong-cust'), makeValidSubscription('sub-wrong-cust', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-wrong-cust_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-wrong-cust'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      entityType: 'subscription',
      entityId: 'sub-wrong-cust',
      details: { customerId: CUSTOMER_B_UID, unpaidConfirmed: true }, // Mismatches CUSTOMER_A_UID
      timestamp: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Unpaid activation audit fails if entityId does not match subscription id', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-wrong-entity'), makeValidSubscription('sub-wrong-entity', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    const auditId = 'unpaid_act_sub-wrong-entity_2026-10-01';

    batch.update(doc(adminDb, 'subscriptions', 'sub-wrong-entity'), {
      status: 'active',
      updatedAt: new Date(),
    });

    batch.set(doc(adminDb, 'auditLogs', auditId), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      entityType: 'subscription',
      entityId: 'sub-mismatched-other-sub', // Mismatches subscription ID
      details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
      timestamp: new Date(),
    });

    await assertFails(batch.commit());
  });

  it('DENY: Direct unpaid activation without audit document fails', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-no-audit'), makeValidSubscription('sub-no-audit', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-no-audit'), {
        status: 'active',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Pre-created audit document cannot authorize later activation', async (ctx) => {
    if (!env) return ctx.skip();
    const auditId = 'unpaid_act_sub-preseed_2026-10-01';
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-preseed'), makeValidSubscription('sub-preseed', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
      // Pre-seed the audit document beforehand
      await setDoc(doc(db, 'auditLogs', auditId), {
        action: 'admin_subscription_unpaid_activation',
        performedBy: ADMIN_UID,
        performedByRole: 'admin',
        entityType: 'subscription',
        entityId: 'sub-preseed',
        details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
        timestamp: new Date(),
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-preseed'), {
        status: 'active',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Standalone unpaid activation audit creation fails', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-standalone-audit'), makeValidSubscription('sub-standalone-audit', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const auditId = 'unpaid_act_sub-standalone-audit_2026-10-01';
    await assertFails(
      setDoc(doc(adminDb, 'auditLogs', auditId), {
        action: 'admin_subscription_unpaid_activation',
        performedBy: ADMIN_UID,
        performedByRole: 'admin',
        performedByName: 'Admin',
        entityType: 'subscription',
        entityId: 'sub-standalone-audit',
        details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
        timestamp: new Date(),
      })
    );
  });

  it('DENY: Random-ID audit with the unpaid activation action fails', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-random-audit'), makeValidSubscription('sub-random-audit', CUSTOMER_A_UID, {
        status: 'pending_payment',
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'subscriptions', 'sub-random-audit'), {
      status: 'active',
      updatedAt: new Date(),
    });
    batch.set(doc(adminDb, 'auditLogs', 'random-uuid-audit-12345'), {
      action: 'admin_subscription_unpaid_activation',
      performedBy: ADMIN_UID,
      performedByRole: 'admin',
      entityType: 'subscription',
      entityId: 'sub-random-audit',
      details: { customerId: CUSTOMER_A_UID, unpaidConfirmed: true },
      timestamp: new Date(),
    });
    await assertFails(batch.commit());
  });

  it('DENY: Customer cannot transition pending_payment subscription to active directly', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-cust-bypass'), makeValidSubscription('sub-cust-bypass', CUSTOMER_A_UID, {
        status: 'pending_payment',
      }));
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'subscriptions', 'sub-cust-bypass'), {
        status: 'active',
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Customer can resume their own paused subscription to active', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-cust-resume'), makeValidSubscription('sub-cust-resume', CUSTOMER_A_UID, {
        status: 'paused',
      }));
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(custDb, 'subscriptions', 'sub-cust-resume'), {
        status: 'active',
        updatedAt: new Date(),
      })
    );
  });

  // ── 4. Admin General Management Tests ───────────────────────────────────────

  it('ALLOW: Admin can update legitimate subscription dates on active subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-dates'), makeValidSubscription('sub-admin-dates', CUSTOMER_A_UID));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-dates'), {
        startDate: '2026-10-05',
        endDate: '2026-11-05',
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Admin can update autoRenew on active subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-autorenew'), makeValidSubscription('sub-admin-autorenew', CUSTOMER_A_UID));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-autorenew'), {
        autoRenew: false,
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Admin general management cannot delete required fields from subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-del-field'), makeValidSubscription('sub-admin-del-field', CUSTOMER_A_UID));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    // Attempting to delete required field 'billingCycle'
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-del-field'), {
        billingCycle: deleteField(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Admin general management cannot update latestPaymentId', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-tamper-payment'), makeValidSubscription('sub-admin-tamper-payment', CUSTOMER_A_UID, {
        latestPaymentId: null,
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    // Attempting to arbitrarily link a payment without the approved activation flow
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-tamper-payment'), {
        latestPaymentId: 'pay-arbitrary-link',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Admin general management cannot modify immutable createdAt', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-tamper-created'), makeValidSubscription('sub-admin-tamper-created', CUSTOMER_A_UID, {
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-tamper-created'), {
        createdAt: new Date('2026-05-01T00:00:00Z'),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Admin general management cannot modify immutable id or customerId', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-admin-tamper-cust'), makeValidSubscription('sub-admin-tamper-cust', CUSTOMER_A_UID));
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-tamper-cust'), {
        customerId: CUSTOMER_B_UID, // Tampering with customerId
        updatedAt: new Date(),
      })
    );
  });


  it('DENY: Customer cannot create subscription with missing selectedOptionId property', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-missing-opt-id'), {
        id: 'sub-cust-missing-opt-id',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        // selectedOptionId key completely missing from meal preference
        mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }] as any,
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Customer can create subscription with explicit null where allowed', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-explicit-null'), {
        id: 'sub-cust-explicit-null',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        // Explicit null for all slots
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot supply option ID when plan option data is missing or null', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-no-plan-options'), {
        id: 'sub-cust-no-plan-options',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-no-options', // Plan has no optionIds
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' }, // Supplying option ID when plan has no optionIds
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot select an option belonging to the wrong meal type', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-wrong-meal-opt'), {
        id: 'sub-cust-wrong-meal-opt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'std-dinner-1' }, // Dinner option used for lunch
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with missing address zone and missing pincode when non-null zone is supplied', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // addr-no-zone-no-pin has neither zoneId nor pincode
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-no-zone-evidence'), {
        id: 'sub-cust-no-zone-evidence',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-no-zone-no-pin',
        zoneId: 'zone-1', // Arbitrary zone supplied with no evidence
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with a deleted or stale address', async (ctx) => {
    if (!env) return ctx.skip();
    // Simulate address deletion: remove subcollection mirror doc
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await deleteDoc(doc(db, 'users', CUSTOMER_A_UID, 'addresses', 'addr-deleted'));
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-stale-addr'), {
        id: 'sub-cust-stale-addr',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-deleted', // Subcollection doc does not exist
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null }
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Non-admin roles (kitchen, delivery, accounts) cannot create subscriptions', async (ctx) => {
    if (!env) return ctx.skip();
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();

    await assertFails(
      setDoc(doc(kitchenDb, 'subscriptions', 'sub-k-fail'), {
        id: 'sub-k-fail',
        customerId: CUSTOMER_A_UID,
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );

    await assertFails(
      setDoc(doc(deliveryDb, 'subscriptions', 'sub-d-fail'), {
        id: 'sub-d-fail',
        customerId: CUSTOMER_A_UID,
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );

    await assertFails(
      setDoc(doc(accountsDb, 'subscriptions', 'sub-a-fail'), {
        id: 'sub-a-fail',
        customerId: CUSTOMER_A_UID,
        status: 'pending_payment',
        createdAt: new Date(),
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3 — Strict Meal-Type Option Association Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('DENY: Lunch option exists globally in optionIds but is absent from lunchOptionIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-global-only has optionIds: ['global-opt-1', 'global-opt-2'], lunchOptionIds: ['global-opt-1']
    // Submitting 'global-opt-2' for lunch must be DENIED even though it is in global optionIds
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-lunch-not-in-lunch-ids'), {
        id: 'sub-cust-lunch-not-in-lunch-ids',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-global-only',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'global-opt-2' }, // In optionIds, but NOT in lunchOptionIds
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Dinner option exists globally in optionIds but is absent from dinnerOptionIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-global-only has optionIds: ['global-opt-1', 'global-opt-2'], dinnerOptionIds: ['global-opt-2']
    // Submitting 'global-opt-1' for dinner must be DENIED even though it is in global optionIds
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-dinner-not-in-dinner-ids'), {
        id: 'sub-cust-dinner-not-in-dinner-ids',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-global-only',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: 'global-opt-1' }, // In optionIds, but NOT in dinnerOptionIds
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Meal-specific ID list is missing from plan document', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-missing-lunch has no lunchOptionIds field
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-missing-lunch-list'), {
        id: 'sub-cust-missing-lunch-list',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-missing-lunch',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Meal-specific ID list is null in plan document', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-null-dinner has dinnerOptionIds: null
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-null-dinner-list'), {
        id: 'sub-cust-null-dinner-list',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-null-dinner',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: 'std-dinner-1' },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Meal-specific ID list is empty while a selectable option is submitted', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-empty-lunch has lunchOptionIds: []
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-empty-lunch-list'), {
        id: 'sub-cust-empty-lunch-list',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-empty-lunch',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Lunch option used for dinner', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // 'std-lunch-1' is in lunchOptionIds but NOT in dinnerOptionIds
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-lunch-for-dinner'), {
        id: 'sub-cust-lunch-for-dinner',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: 'std-lunch-1' }, // Lunch option used for dinner
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Correct lunch option matching lunchOptionIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-allow-lunch'), {
        id: 'sub-cust-allow-lunch',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'std-lunch-1' }, // Valid lunch option
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Correct dinner option matching dinnerOptionIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-allow-dinner'), {
        id: 'sub-cust-allow-dinner',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: 'std-dinner-1' }, // Valid dinner option
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Explicit null option where business model permits it', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-allow-null-opt'), {
        id: 'sub-cust-allow-null-opt',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Plans without derived fields fail closed when a selectable option is submitted', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // plan-no-options has neither optionIds, lunchOptionIds, nor dinnerOptionIds
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-fail-closed-unmigrated'), {
        id: 'sub-cust-fail-closed-unmigrated',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-no-options',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'some-option-id' },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3 — Address Index & Mirror Consistency Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('ALLOW: Correct address mirror exists and root addressIds contains the selected ID', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // addr-1 exists in subcollection and in CUSTOMER_A_UID.addressIds
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-addr-valid-both'), {
        id: 'sub-cust-addr-valid-both',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Mirror exists but the root addressIds field is missing', async (ctx) => {
    if (!env) return ctx.skip();
    // uid-cust-no-address-ids has subcollection address 'addr-valid-mirror' but no root addressIds
    const custDb = env.authenticatedContext('uid-cust-no-address-ids').firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-missing-root-ids'), {
        id: 'sub-cust-missing-root-ids',
        customerId: 'uid-cust-no-address-ids',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-valid-mirror',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Mirror exists but root addressIds is null', async (ctx) => {
    if (!env) return ctx.skip();
    // uid-cust-null-address-ids has subcollection address 'addr-null-mirror' but addressIds is null
    const custDb = env.authenticatedContext('uid-cust-null-address-ids').firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-null-root-ids'), {
        id: 'sub-cust-null-root-ids',
        customerId: 'uid-cust-null-address-ids',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-null-mirror',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Mirror exists but selected ID is absent from root addressIds', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // addr-not-in-index exists in subcollection users/CUSTOMER_A_UID/addresses/addr-not-in-index
    // BUT is NOT in users/CUSTOMER_A_UID.addressIds (which only has ['addr-1', 'addr-no-zone-no-pin'])
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-mirror-not-in-index'), {
        id: 'sub-cust-mirror-not-in-index',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-not-in-index', // Present in mirror, absent in root index
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Root ID exists in addressIds but the mirrored address document is missing', async (ctx) => {
    if (!env) return ctx.skip();
    // Temporarily add 'addr-phantom' to CUSTOMER_A_UID.addressIds without creating mirror doc
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, 'users', CUSTOMER_A_UID), {
        addressIds: ['addr-1', 'addr-no-zone-no-pin', 'addr-phantom'],
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-root-id-no-mirror'), {
        id: 'sub-cust-root-id-no-mirror',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-phantom', // In root index, but subcollection mirror missing
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it("DENY: Another customer's address ID is used", async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // addr-b belongs to CUSTOMER_B_UID, not CUSTOMER_A_UID
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-other-customer-addr'), {
        id: 'sub-cust-other-customer-addr',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-b', // Belongs to customer B
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Customer subscription creation with zoneId: null remains supported', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    // Valid address, zoneId explicitly null
    await assertSucceeds(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-null-zone-supported'), {
        id: 'sub-cust-null-zone-supported',
        customerId: CUSTOMER_A_UID,
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
        deliveryAddressId: 'addr-1',
        zoneId: null,
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: null },
          { mealType: 'dinner', selectedOptionId: null },
        ],
        status: 'pending_payment',
        startDate: '2026-10-01',
        endDate: null,
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        latestPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });
});
