import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-unskip-test';

const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Unskip and Kitchen Security Rules', () => {
  let env: RulesTestEnvironment;

  const ADMIN_UID = 'uid-admin';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const CUSTOMER_B_UID = 'uid-customer-b';
  const KITCHEN_UID = 'uid-kitchen';

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

      // Users
      await setDoc(doc(db, 'users', ADMIN_UID),       { id: ADMIN_UID, role: 'admin' });
      await setDoc(doc(db, 'users', CUSTOMER_A_UID),  { id: CUSTOMER_A_UID, role: 'customer' });
      await setDoc(doc(db, 'users', CUSTOMER_B_UID),  { id: CUSTOMER_B_UID, role: 'customer' });
      await setDoc(doc(db, 'users', KITCHEN_UID),     { id: KITCHEN_UID, role: 'kitchen' });

      // Subscriptions
      await setDoc(doc(db, 'subscriptions', 'sub-a'), { customerId: CUSTOMER_A_UID });
      await setDoc(doc(db, 'subscriptions', 'sub-b'), { customerId: CUSTOMER_B_UID });

      // Orders
      await setDoc(doc(db, 'orders', 'order-cancelled-a'), {
        customerId: CUSTOMER_A_UID,
        status: 'cancelled',
        date: '2026-08-25', // Future date
        mealType: 'lunch',
        price: 150
      });
      await setDoc(doc(db, 'orders', 'order-scheduled-a'), {
        customerId: CUSTOMER_A_UID,
        status: 'scheduled',
        date: '2026-08-25',
        mealType: 'dinner',
        price: 150
      });

      // Skips
      await setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2026-08-25'), {
        date: '2026-08-25',
        mealTypes: ['breakfast', 'lunch'],
        createdBy: CUSTOMER_A_UID
      });

      // Daily Production States
      await setDoc(doc(db, 'dailyProductionStates', '2026-08-25'), {
        date: '2026-08-25',
        status: 'open'
      });
    });
  });

  afterAll(async () => env.cleanup());

  describe('Unskip Cutoff Security', () => {
    it('ALLOW: Customer can remove skip for future date (cutoff has not passed)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Future date, so cutoff is in the future
      await assertSucceeds(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2026-08-25')));
    });

    it('DENY: Customer B cannot remove Customer A skip', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2026-08-25')));
    });

    it('DENY: Customer cannot remove skip for a date in the past (cutoff has passed)', async () => {
      // Seed a past skip
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'subscriptions', 'sub-a', 'skips', '2020-01-01'), {
          date: '2020-01-01',
          mealTypes: ['lunch']
        });
      });
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2020-01-01')));
    });
  });

  describe('Unskip Order Restoration', () => {
    it('ALLOW: Customer can restore existing eligible cancelled order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-cancelled-a'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer cannot change price while restoring order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-cancelled-a'), {
        status: 'scheduled',
        price: 0,
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer B cannot restore Customer A order', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-cancelled-a'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer cannot restore past cancelled order (cutoff passed)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'order-past'), {
          customerId: CUSTOMER_A_UID,
          status: 'cancelled',
          date: '2020-01-01',
          mealType: 'lunch'
        });
        await setDoc(doc(ctx.firestore(), 'dailyProductionStates', '2020-01-01'), {
          status: 'open'
        });
      });
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-past'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });
  });

  describe('Kitchen Rules Security', () => {
    it('ALLOW: Kitchen can transition scheduled -> packing', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-scheduled-a'), {
        status: 'packing',
        kitchenStatus: 'packing',
        packingAt: new Date(),
        updatedAt: new Date()
      }));
    });

    it('ALLOW: Kitchen can transition packing -> packed', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'order-packing'), {
          customerId: CUSTOMER_A_UID,
          status: 'packing',
          kitchenStatus: 'packing',
          date: '2026-08-25'
        });
      });
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-packing'), {
        status: 'packed',
        kitchenStatus: 'packed',
        packedAt: new Date(),
        updatedAt: new Date()
      }));
    });

    it('ALLOW: Kitchen can transition packed -> ready_for_pickup', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'order-packed'), {
          customerId: CUSTOMER_A_UID,
          status: 'packed',
          kitchenStatus: 'packed',
          date: '2026-08-25'
        });
      });
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-packed'), {
        status: 'ready_for_pickup',
        kitchenStatus: 'ready_for_pickup',
        readyAt: new Date(),
        updatedAt: new Date()
      }));
    });

    it('DENY: Kitchen cannot transition scheduled -> ready_for_pickup directly', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-scheduled-a'), {
        status: 'ready_for_pickup',
        kitchenStatus: 'ready_for_pickup',
        readyAt: new Date(),
        updatedAt: new Date()
      }));
    });
  });
});
