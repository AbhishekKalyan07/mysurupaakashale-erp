import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-meal-plan-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E5 — Meal Plan Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-meal-plan';
  const CUSTOMER_UID = 'uid-customer-meal-plan';
  const KITCHEN_UID = 'uid-kitchen-meal-plan';
  const DELIVERY_UID = 'uid-delivery-meal-plan';
  const ACCOUNTS_UID = 'uid-accounts-meal-plan';

  const validPlanData = {
    id: 'test-custom-plan',
    name: 'Test Gourmet Plan',
    tier: 'standard',
    pricePerDay: 250,
    isActive: true,
    sortOrder: 3,
    description: 'Fresh healthy meals delivered daily',
    mealSlots: [
      {
        mealType: 'breakfast',
        slotName: 'Breakfast',
        isCustomerSelectable: false,
        options: [
          {
            id: 'opt_bf_fixed',
            name: 'Chef Daily Breakfast',
            mealType: 'breakfast',
            items: ['Idli', 'Vada', 'Chutney'],
            isActive: true,
            isCustomerSelectable: false,
          },
        ],
      },
      {
        mealType: 'lunch',
        slotName: 'Lunch',
        isCustomerSelectable: true,
        options: [
          {
            id: 'opt_lunch_millet',
            name: 'Millet Meals',
            mealType: 'lunch',
            items: ['Foxtail Millet', 'Sambar', 'Poriyal'],
            isActive: true,
            isCustomerSelectable: true,
          },
        ],
      },
    ],
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
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

      // Seed an active baseline plan
      await setDoc(doc(db, 'mealPlans', 'basic-plan'), {
        id: 'basic-plan',
        name: 'Basic Plan',
        tier: 'budget',
        pricePerDay: 159,
        isActive: true,
        mealSlots: [
          {
            mealType: 'lunch',
            slotName: 'Lunch',
            isCustomerSelectable: true,
            options: [
              {
                id: 'opt_lunch_rice',
                name: 'Traditional Meals',
                mealType: 'lunch',
                items: ['Rice', 'Sambar'],
                isActive: true,
                isCustomerSelectable: true,
              },
            ],
          },
        ],
      });
    });
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  // 1. Read permissions
  it('ALLOW: Customer can read meal plans', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(custDb, 'mealPlans', 'basic-plan')));
    expect(snap.exists()).toBe(true);
  });

  it('ALLOW: Unauthenticated user can read meal plans (public catalog)', async () => {
    const unauthDb = env.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(getDoc(doc(unauthDb, 'mealPlans', 'basic-plan')));
    expect(snap.exists()).toBe(true);
  });

  it('ALLOW: Admin can read meal plans', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(adminDb, 'mealPlans', 'basic-plan')));
    expect(snap.exists()).toBe(true);
  });

  // 2. Admin Write permissions
  it('ALLOW: Admin can create a meal plan with valid pricePerDay', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'mealPlans', 'test-custom-plan'), validPlanData));
  });

  it('DENY: Admin cannot create a meal plan with invalid or zero pricePerDay', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      setDoc(doc(adminDb, 'mealPlans', 'test-invalid-plan'), {
        ...validPlanData,
        pricePerDay: 0,
      }),
    );
  });

  it('ALLOW: Admin can update plan metadata and options', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'mealPlans', 'basic-plan'), {
        description: 'Updated daily comforting home meals',
        pricePerDay: 169,
      }),
    );
  });

  it('ALLOW: Admin can enable or disable a plan', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'mealPlans', 'basic-plan'), {
        isActive: false,
      }),
    );
  });

  // 3. Customer Write Protection
  it('DENY: Customer cannot create a meal plan', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(custDb, 'mealPlans', 'forged-plan'), validPlanData));
  });

  it('DENY: Customer cannot update a meal plan or forge options', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'mealPlans', 'basic-plan'), {
        pricePerDay: 1, // Attempt to tamper with price
      }),
    );
  });

  it('DENY: Customer cannot delete a meal plan', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(deleteDoc(doc(custDb, 'mealPlans', 'basic-plan')));
  });

  // 4. Other Roles Write Protection
  it('DENY: Kitchen cannot modify meal plans', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      updateDoc(doc(kitchenDb, 'mealPlans', 'basic-plan'), {
        name: 'Tampered Kitchen Plan',
      }),
    );
  });

  it('DENY: Delivery Partner cannot modify meal plans', async () => {
    const delivDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      updateDoc(doc(delivDb, 'mealPlans', 'basic-plan'), {
        isActive: false,
      }),
    );
  });

  it('DENY: Accounts cannot modify meal plans', async () => {
    const accDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      updateDoc(doc(accDb, 'mealPlans', 'basic-plan'), {
        pricePerDay: 99,
      }),
    );
  });
});
