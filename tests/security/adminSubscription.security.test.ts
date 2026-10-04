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

  // ── Admin Customer Management Security Tests ─────────────────────────────────

  it('DENY: Customer cannot modify negotiatedPricing on subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subscriptions', 'sub-cust-pricing'), {
        id: 'sub-cust-pricing',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        autoRenew: true,
        updatedAt: new Date(),
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'subscriptions', 'sub-cust-pricing'), {
        negotiatedPricing: { breakfast: 10, lunch: 20, dinner: 20, breakfast_lunch_dinner: 50 },
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot change subscription plan (planId or planTier)', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subscriptions', 'sub-cust-plan'), {
        id: 'sub-cust-plan',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        autoRenew: true,
        updatedAt: new Date(),
      });
    });

    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'subscriptions', 'sub-cust-plan'), {
        planId: 'plan-vip',
        planTier: 'vip',
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Non-admin cannot modify other customers orders', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'order-cust-a-secure'), {
        id: 'order-cust-a-secure',
        customerId: CUSTOMER_A_UID,
        date: '2026-10-01',
        mealType: 'lunch',
        status: 'scheduled',
        price: 85,
        currency: 'INR',
        planId: 'plan-std',
        planTier: 'standard',
        kitchenId: 'KITCHEN_1',
        zoneId: 'zone-1',
        deliveryAddressId: 'addr-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // Customer B tries to modify Customer A's order
    const custBDb = env.authenticatedContext(CUSTOMER_B_UID).firestore();
    await assertFails(
      updateDoc(doc(custBDb, 'orders', 'order-cust-a-secure'), {
        status: 'cancelled',
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Admin can update negotiatedPricing on customer subscription', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subscriptions', 'sub-admin-pricing'), {
        id: 'sub-admin-pricing',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        autoRenew: true,
        updatedAt: new Date(),
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-pricing'), {
        negotiatedPricing: { breakfast: 35, lunch: 55, dinner: 55, breakfast_lunch_dinner: 130 },
        pricePerDaySnapshot: 130,
        updatedAt: new Date(),
      })
    );
  });

  it('ALLOW: Admin can change subscription plan (planId and planTier)', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'subscriptions', 'sub-admin-plan-change'), {
        id: 'sub-admin-plan-change',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'plan-std',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 140,
        autoRenew: true,
        updatedAt: new Date(),
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'subscriptions', 'sub-admin-plan-change'), {
        planId: 'plan-premium',
        planTier: 'premium',
        pricePerDaySnapshot: 180,
        updatedAt: new Date(),
      })
    );
  });

  // ── Audit Log Security Hardening Tests ─────────────────────────────────────

  it('DENY: Customer cannot create admin_* audit log (e.g. admin_subscription_plan_changed)', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'auditLogs', 'log-cust-admin-action'), {
        performedBy: CUSTOMER_A_UID,
        performedByRole: 'customer',
        performedByName: 'Customer A',
        action: 'admin_subscription_plan_changed',
        entityType: 'subscription',
        entityId: 'sub-1',
        timestamp: new Date(),
      })
    );
  });

  it('DENY: Kitchen cannot create admin_* audit log (e.g. admin_negotiated_pricing_updated)', async (ctx) => {
    if (!env) return ctx.skip();
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      setDoc(doc(kitchenDb, 'auditLogs', 'log-kitchen-admin-action'), {
        performedBy: KITCHEN_UID,
        performedByRole: 'kitchen',
        performedByName: 'Kitchen Staff',
        action: 'admin_negotiated_pricing_updated',
        entityType: 'subscription',
        entityId: 'sub-1',
        timestamp: new Date(),
      })
    );
  });

  it('DENY: Delivery Partner cannot create admin_* audit log (e.g. admin_individual_meal_added)', async (ctx) => {
    if (!env) return ctx.skip();
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      setDoc(doc(deliveryDb, 'auditLogs', 'log-delivery-admin-action'), {
        performedBy: DELIVERY_UID,
        performedByRole: 'delivery_partner',
        performedByName: 'Delivery Partner',
        action: 'admin_individual_meal_added',
        entityType: 'order',
        entityId: 'ord-1',
        timestamp: new Date(),
      })
    );
  });

  it('DENY: Accounts cannot create admin_* audit log', async (ctx) => {
    if (!env) return ctx.skip();
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      setDoc(doc(accountsDb, 'auditLogs', 'log-accounts-admin-action'), {
        performedBy: ACCOUNTS_UID,
        performedByRole: 'accounts',
        performedByName: 'Accounts Staff',
        action: 'admin_subscription_plan_changed',
        entityType: 'subscription',
        entityId: 'sub-1',
        timestamp: new Date(),
      })
    );
  });

  it('ALLOW: Admin can create admin_* audit log', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, 'auditLogs', 'log-admin-legit-action'), {
        performedBy: ADMIN_UID,
        performedByRole: 'admin',
        performedByName: 'Admin User',
        action: 'admin_subscription_plan_changed',
        entityType: 'subscription',
        entityId: 'sub-1',
        timestamp: new Date(),
      })
    );
  });

  it('ALLOW: Customer can create normal non-admin audit log (e.g. meal_cancelled)', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertSucceeds(
      setDoc(doc(custDb, 'auditLogs', 'log-cust-normal-action'), {
        performedBy: CUSTOMER_A_UID,
        performedByRole: 'customer',
        performedByName: 'Customer A',
        action: 'meal_cancelled',
        entityType: 'order',
        entityId: 'ord-1',
        timestamp: new Date(),
      })
    );
  });

  it('DENY: Audit log cannot be modified or deleted by anyone (immutable)', async (ctx) => {
    if (!env) return ctx.skip();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'auditLogs', 'log-immutable'), {
        performedBy: ADMIN_UID,
        performedByRole: 'admin',
        action: 'admin_subscription_plan_changed',
        timestamp: new Date(),
      });
    });

    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(adminDb, 'auditLogs', 'log-immutable'), {
        action: 'tampered_action',
      })
    );
  });

  // ── Phase 3A: Subscription Creation & Negotiated Pricing Security Tests ───

  it('DENY: Customer cannot create subscription with negotiatedPricing', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-negotiated'), {
        id: 'sub-cust-negotiated',
        customerId: CUSTOMER_A_UID,
        status: 'pending_payment',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        pricePerDaySnapshot: 159,
        pricingMatrixSnapshot: {
          breakfast: 60,
          lunch: 65,
          dinner: 65,
          breakfast_lunch: 115,
          lunch_dinner: 115,
          breakfast_dinner: 115,
          breakfast_lunch_dinner: 159,
        },
        deliveryAddressId: 'addr-1',
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'opt-1' },
          { mealType: 'dinner', selectedOptionId: 'opt-2' },
        ],
        startDate: '2026-10-10',
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        negotiatedPricing: { breakfast: 20, lunch: 20, dinner: 20 },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Customer cannot create subscription with status "active"', async (ctx) => {
    if (!env) return ctx.skip();
    const custDb = env.authenticatedContext(CUSTOMER_A_UID).firestore();
    await assertFails(
      setDoc(doc(custDb, 'subscriptions', 'sub-cust-direct-active'), {
        id: 'sub-cust-direct-active',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        pricePerDaySnapshot: 159,
        pricingMatrixSnapshot: {
          breakfast: 60,
          lunch: 65,
          dinner: 65,
          breakfast_lunch: 115,
          lunch_dinner: 115,
          breakfast_dinner: 115,
          breakfast_lunch_dinner: 159,
        },
        deliveryAddressId: 'addr-1',
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'opt-1' },
          { mealType: 'dinner', selectedOptionId: 'opt-2' },
        ],
        startDate: '2026-10-10',
        billingCycle: 'monthly',
        autoRenew: true,
        depositAmount: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  it('DENY: Non-admin staff (kitchen, delivery, accounts) cannot create customer subscriptions', async (ctx) => {
    if (!env) return ctx.skip();
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      setDoc(doc(kitchenDb, 'subscriptions', 'sub-kitchen-create'), {
        id: 'sub-kitchen-create',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        pricePerDaySnapshot: 159,
        deliveryAddressId: 'addr-1',
        mealPreferences: [{ mealType: 'lunch', selectedOptionId: null }],
        startDate: '2026-10-10',
        billingCycle: 'monthly',
      })
    );
  });

  it('DENY: Kitchen cannot inject negotiatedPricing on subscription', async (ctx) => {
    if (!env) return ctx.skip();
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      setDoc(doc(kitchenDb, 'subscriptions', 'sub-kitchen-neg'), {
        id: 'sub-kitchen-neg',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        negotiatedPricing: { breakfast: 10, lunch: 10, dinner: 10 },
      })
    );
  });

  it('DENY: Delivery Partner cannot inject negotiatedPricing on subscription', async (ctx) => {
    if (!env) return ctx.skip();
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      setDoc(doc(deliveryDb, 'subscriptions', 'sub-delivery-neg'), {
        id: 'sub-delivery-neg',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        negotiatedPricing: { breakfast: 10, lunch: 10, dinner: 10 },
      })
    );
  });

  it('DENY: Accounts cannot inject negotiatedPricing on subscription', async (ctx) => {
    if (!env) return ctx.skip();
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      setDoc(doc(accountsDb, 'subscriptions', 'sub-accounts-neg'), {
        id: 'sub-accounts-neg',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 1,
        negotiatedPricing: { breakfast: 10, lunch: 10, dinner: 10 },
      })
    );
  });

  it('ALLOW: Admin can create subscription with negotiatedPricing and active status', async (ctx) => {
    if (!env) return ctx.skip();
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(adminDb, 'subscriptions', 'sub-admin-create-negotiated'), {
        id: 'sub-admin-create-negotiated',
        customerId: CUSTOMER_A_UID,
        status: 'active',
        planId: 'basic-plan',
        planTier: 'basic',
        quantity: 2,
        pricePerDaySnapshot: 130,
        pricingMatrixSnapshot: {
          breakfast: 60,
          lunch: 65,
          dinner: 65,
          breakfast_lunch: 115,
          lunch_dinner: 115,
          breakfast_dinner: 115,
          breakfast_lunch_dinner: 159,
        },
        negotiatedPricing: {
          breakfast: 40,
          lunch: 50,
          dinner: 50,
          breakfast_lunch: 80,
          lunch_dinner: 90,
          breakfast_dinner: 80,
          breakfast_lunch_dinner: 130,
        },
        deliveryAddressId: 'addr-1',
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: null },
          { mealType: 'lunch', selectedOptionId: 'opt-1' },
          { mealType: 'dinner', selectedOptionId: 'opt-2' },
        ],
        startDate: '2026-10-10',
        endDate: '2026-10-25',
        billingCycle: 'monthly',
        autoRenew: false,
        depositAmount: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });
});
