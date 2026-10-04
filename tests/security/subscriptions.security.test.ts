import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-sub';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Subscriptions Security Rules', () => {
  let env: RulesTestEnvironment;
  const CUSTOMER_UID = 'uid-customer-sub';
  const CUSTOMER_B_UID = 'uid-customer-sub-b';
  const ADMIN_UID = 'uid-admin-sub';
  const KITCHEN_UID = 'uid-kitchen-sub';
  const DELIVERY_UID = 'uid-delivery-sub';
  const ACCOUNTS_UID = 'uid-accounts-sub';

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
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID), { id: CUSTOMER_B_UID, role: 'customer', isActive: true });
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', isActive: true, kitchenId: 'kitchen-1' });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });
      
      await setDoc(doc(db, 'mealPlans', 'plan-1'), {
        id: 'plan-1',
        name: 'Standard Plan',
        pricePerDay: 100,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 }
      });

      await setDoc(doc(db, 'settings', 'business'), {
        pricing: { securityDepositAmount: 1000 }
      });

      await setDoc(doc(db, 'subscriptions', 'sub-active'), {
        id: 'sub-active',
        customerId: CUSTOMER_UID,
        status: 'active',
        quantity: 1,
        mealPreferences: [{ mealType: 'breakfast' }],
        pauseStartDate: null,
        pauseEndDate: null,
        updatedAt: new Date()
      });

      await setDoc(doc(db, 'subscriptions', 'sub-customer-b'), {
        id: 'sub-customer-b',
        customerId: CUSTOMER_B_UID,
        status: 'active',
        quantity: 1,
        mealPreferences: [{ mealType: 'breakfast' }],
        pauseStartDate: null,
        pauseEndDate: null,
        updatedAt: new Date()
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('ALLOW: Customer can create subscription with valid pricingMatrix', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'subscriptions', 'new-sub'), {
      id: 'new-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('ALLOW: Customer can create subscription when deliveryPartnerId is omitted', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'subscriptions', 'new-sub-omitted-dp'), {
      id: 'new-sub-omitted-dp',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      // deliveryPartnerId intentionally omitted to verify defensive rule evaluation
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot assign deliveryPartnerId on subscription creation', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'tampered-dp-sub'), {
      id: 'tampered-dp-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: 'unauthorized-dp-id', // Tampered non-null deliveryPartnerId
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot create subscription with tampered pricingMatrix', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'tampered-sub'), {
      id: 'tampered-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 10,
      pricingMatrixSnapshot: { breakfast: 1, lunch: 2, dinner: 3, breakfast_lunch_dinner: 6 }, // Tampered
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot create subscription with tampered depositAmount', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'tampered-deposit-sub'), {
      id: 'tampered-deposit-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1, // Tampered
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('ALLOW: Admin can create subscription bypassing depositAmount check', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'subscriptions', 'admin-sub'), {
      id: 'admin-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 500, // Allowed for Admin
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot update price snapshots on existing subscription', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-active'), {
      pricePerDaySnapshot: 10,
      pricingMatrixSnapshot: { breakfast: 1 }
    }));
  });

  it('ALLOW: Customer can update quantity and meal preferences', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'subscriptions', 'sub-active'), {
      quantity: 2,
      mealPreferences: [{ mealType: 'lunch' }],
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer A cannot create a subscription for Customer B', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'spoofed-customer-sub'), {
      id: 'spoofed-customer-sub',
      customerId: CUSTOMER_B_UID, // Spoofed: authenticated customer is CUSTOMER_UID
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it("DENY: Customer A cannot modify Customer B's subscription", async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-customer-b'), {
      quantity: 5,
      updatedAt: new Date()
    }));
  });

  it('DENY: Kitchen user cannot create customer subscription', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(setDoc(doc(kitchenDb, 'subscriptions', 'kitchen-created-sub'), {
      id: 'kitchen-created-sub',
      customerId: KITCHEN_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Delivery Partner cannot create customer subscription', async () => {
    const dpDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(setDoc(doc(dpDb, 'subscriptions', 'dp-created-sub'), {
      id: 'dp-created-sub',
      customerId: DELIVERY_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Accounts user cannot create customer subscription', async () => {
    const accDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(setDoc(doc(accDb, 'subscriptions', 'acc-created-sub'), {
      id: 'acc-created-sub',
      customerId: ACCOUNTS_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Unauthenticated user cannot create subscription', async () => {
    const anonDb = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'subscriptions', 'anon-sub'), {
      id: 'anon-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot self-activate by creating subscription with status active', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'self-active-sub'), {
      id: 'self-active-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'active', // Rejected: customers cannot self-activate to bypass payment verification
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: null,
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot assign non-null latestPaymentId on creation', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'subscriptions', 'forged-payment-sub'), {
      id: 'forged-payment-sub',
      customerId: CUSTOMER_UID,
      planId: 'plan-1',
      planTier: 'standard',
      quantity: 1,
      pricePerDaySnapshot: 140,
      pricingMatrixSnapshot: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 },
      deliveryAddressId: 'addr-1',
      zoneId: 'zone-1',
      mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }],
      status: 'pending_payment',
      startDate: '2025-01-01',
      endDate: null,
      billingCycle: 'monthly',
      autoRenew: true,
      latestPaymentId: 'forged-payment-id', // Rejected: client cannot forge payment reference
      depositAmount: 1000,
      deliveryPartnerId: null,
      pauseStartDate: null,
      pauseEndDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  it("DENY: Customer A cannot pause or resume Customer B's subscription", async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    // Attempting to pause Customer B's subscription
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-customer-b'), {
      status: 'paused',
      pauseStartDate: '2025-02-01',
      pauseEndDate: '2025-02-05',
      updatedAt: new Date()
    }));

    // Attempting to resume Customer B's subscription
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-customer-b'), {
      status: 'active',
      pauseStartDate: null,
      pauseEndDate: null,
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer cannot transition pending_payment directly to active via updateDoc', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    // Create pending subscription first via admin context to test customer update
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subscriptions', 'sub-pending'), {
        id: 'sub-pending',
        customerId: CUSTOMER_UID,
        status: 'pending_payment',
        quantity: 1,
        mealPreferences: [{ mealType: 'breakfast' }],
        pauseStartDate: null,
        pauseEndDate: null,
        updatedAt: new Date()
      });
    });

    // Customer attempts to write status: 'active'
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-pending'), {
      status: 'active',
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer A cannot change customerId to another UID on subscription update', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-active'), {
      customerId: CUSTOMER_B_UID,
      updatedAt: new Date()
    }));
  });

  it('DENY: Customer A cannot access or mutate Customer B address', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', CUSTOMER_B_UID, 'addresses', 'addr-b'), {
        id: 'addr-b',
        line1: 'B Street',
        city: 'Mysuru',
        pincode: '570001'
      });
    });

    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', CUSTOMER_B_UID, 'addresses', 'addr-b')));
    await assertFails(setDoc(doc(db, 'users', CUSTOMER_B_UID, 'addresses', 'addr-tamper'), {
      id: 'addr-tamper',
      line1: 'Tampered',
      city: 'Mysuru'
    }));
  });

  it('DENY: Customer A cannot mutate Customer B profile', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', CUSTOMER_B_UID), {
      name: 'Tampered Profile'
    }));
  });

  it('DENY: Customer A cannot mutate or cancel Customer B order', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'order-b-test'), {
        customerId: CUSTOMER_B_UID,
        status: 'scheduled',
        date: '2026-10-05',
        mealType: 'lunch',
        kitchenId: 'kitchen-1',
        zoneId: 'zone-1'
      });
    });

    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'orders', 'order-b-test'), {
      status: 'cancelled'
    }));
  });

  it('DENY: Customer A cannot create payment for Customer B', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(db, 'payments', 'pay-b-tamper'), {
      customerId: CUSTOMER_B_UID,
      subscriptionId: 'sub-customer-b',
      amount: 1000,
      status: 'pending',
      createdAt: new Date()
    }));
  });
});
