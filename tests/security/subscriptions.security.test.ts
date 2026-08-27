import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-security-subscriptions';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Subscriptions Security Rules', () => {
  let env: RulesTestEnvironment;
  const CUSTOMER_UID = 'uid-customer-sub';
  const ADMIN_UID = 'uid-admin-sub';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer' });
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin' });
      
      await setDoc(doc(db, 'mealPlans', 'plan-1'), {
        id: 'plan-1',
        name: 'Standard Plan',
        pricePerDay: 100,
        pricingMatrix: { breakfast: 40, lunch: 60, dinner: 60, breakfast_lunch_dinner: 140 }
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

});
