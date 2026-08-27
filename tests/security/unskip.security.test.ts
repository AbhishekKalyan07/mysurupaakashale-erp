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

  // A future date (year 2099) so all cutoff checks pass relative to server time
  const FUTURE_DATE = '2099-12-31';
  // A past date so all cutoff checks fail
  const PAST_DATE = '2020-01-01';

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
      await setDoc(doc(db, 'users', KITCHEN_UID),     { id: KITCHEN_UID, role: 'kitchen', kitchenId: 'kitchen-1' });

      // Subscriptions
      await setDoc(doc(db, 'subscriptions', 'sub-a'), { customerId: CUSTOMER_A_UID });
      await setDoc(doc(db, 'subscriptions', 'sub-b'), { customerId: CUSTOMER_B_UID });

      // Existing skip for future date (for update/delete tests)
      await setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', FUTURE_DATE), {
        date: FUTURE_DATE,
        mealTypes: ['breakfast', 'lunch'],
        createdBy: CUSTOMER_A_UID
      });

      // Existing skip for past date
      await setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', PAST_DATE), {
        date: PAST_DATE,
        mealTypes: ['lunch'],
        createdBy: CUSTOMER_A_UID
      });

      // Orders for future date
      await setDoc(doc(db, 'orders', 'order-cancelled-a-lunch'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'cancelled',
        date: FUTURE_DATE,
        mealType: 'lunch',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      await setDoc(doc(db, 'orders', 'order-cancelled-a-breakfast'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'cancelled',
        date: FUTURE_DATE,
        mealType: 'breakfast',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      await setDoc(doc(db, 'orders', 'order-cancelled-a-dinner'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'cancelled',
        date: FUTURE_DATE,
        mealType: 'dinner',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      await setDoc(doc(db, 'orders', 'order-scheduled-a'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'scheduled',
        date: FUTURE_DATE,
        mealType: 'dinner',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      // Orders for past date (cutoff already passed)
      await setDoc(doc(db, 'orders', 'order-past-a'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'cancelled',
        date: PAST_DATE,
        mealType: 'lunch',
        price: 150
      });
      await setDoc(doc(db, 'orders', 'order-past-scheduled'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'scheduled',
        date: PAST_DATE,
        mealType: 'breakfast',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      // Locked operational order
      await setDoc(doc(db, 'orders', 'order-locked-a'), {
        customerId: CUSTOMER_A_UID,
        subscriptionId: 'sub-a',
        status: 'picked_up',
        date: FUTURE_DATE,
        mealType: 'lunch',
        price: 150,
        kitchenId: 'kitchen-1'
      });
      // Kitchen operations test orders
      await setDoc(doc(db, 'orders', 'kitchen-scheduled'), {
        status: 'scheduled',
        kitchenId: 'kitchen-1'
      });
      await setDoc(doc(db, 'orders', 'kitchen-packing'), {
        status: 'packing',
        kitchenId: 'kitchen-1'
      });
      await setDoc(doc(db, 'orders', 'kitchen-packed'), {
        status: 'packed',
        kitchenId: 'kitchen-1'
      });

      // Daily Production States
      await setDoc(doc(db, 'dailyProductionStates', FUTURE_DATE), {
        date: FUTURE_DATE,
        status: 'open'
      });
      await setDoc(doc(db, 'dailyProductionStates', PAST_DATE), {
        date: PAST_DATE,
        status: 'open'
      });
    });
  });

  afterAll(async () => env.cleanup());

  // =========================================================================
  // PART 3 — 13 Required Skip/Cancel Cutoff Security Tests
  // =========================================================================

  describe('Skip/Cancel Cutoff Security (13 required tests)', () => {
    // Test 1: Customer A breakfast skip before cutoff → ALLOW
    it('1. Customer A breakfast skip creation before cutoff → ALLOW', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // FUTURE_DATE is far in the future, so all cutoffs have not passed
      await assertSucceeds(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2099-12-30'), {
        date: '2099-12-30',
        mealTypes: ['breakfast'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 2: Customer A breakfast skip after cutoff → DENY
    it('2. Customer A breakfast skip creation after cutoff → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // PAST_DATE is in the past, so all cutoffs have passed
      await assertFails(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2020-01-02'), {
        date: '2020-01-02',
        mealTypes: ['breakfast'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 3: Customer A lunch skip before cutoff → ALLOW
    it('3. Customer A lunch skip creation before cutoff → ALLOW', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2099-12-29'), {
        date: '2099-12-29',
        mealTypes: ['lunch'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 4: Customer A lunch skip after cutoff → DENY
    it('4. Customer A lunch skip creation after cutoff → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2020-01-03'), {
        date: '2020-01-03',
        mealTypes: ['lunch'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 5: Customer A dinner skip before cutoff → ALLOW
    it('5. Customer A dinner skip creation before cutoff → ALLOW', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2099-12-28'), {
        date: '2099-12-28',
        mealTypes: ['dinner'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 6: Customer A dinner skip after cutoff → DENY
    it('6. Customer A dinner skip creation after cutoff → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2020-01-04'), {
        date: '2020-01-04',
        mealTypes: ['dinner'],
        createdBy: CUSTOMER_A_UID
      }));
    });

    // Test 7: Customer A scheduled order → cancelled before cutoff → ALLOW
    it('7. Customer A cancels scheduled order before cutoff → ALLOW', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-scheduled-a'), {
        status: 'cancelled',
        updatedAt: new Date()
      }));
    });

    // Test 8: Customer A scheduled order → cancelled after cutoff → DENY
    it('8. Customer A cancels scheduled order after cutoff → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-past-scheduled'), {
        status: 'cancelled',
        updatedAt: new Date()
      }));
    });

    // Test 9: Customer A unskip (cancel → scheduled) before cutoff → ALLOW
    it('9. Customer A unskip (cancelled → scheduled) before cutoff → ALLOW', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-cancelled-a-lunch'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    // Test 10: Customer A unskip after cutoff → DENY
    it('10. Customer A unskip (cancelled → scheduled) after cutoff → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-past-a'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    // Test 11: Customer B modifying Customer A skip → DENY
    it('11. Customer B cannot modify Customer A skip → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', FUTURE_DATE)));
    });

    // Test 12: Client-provided fake cutoff timestamp → DENY
    // (The rules use server-authoritative request.time — client cannot supply a timestamp to bypass)
    it('12. Fake/client-provided cutoff timestamp cannot bypass server rules → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Attempt to create a skip for a past date even though client would prefer "now"
      // The rule uses request.time (server-side) — client cannot override it
      await assertFails(setDoc(doc(db, 'subscriptions', 'sub-a', 'skips', '2020-06-15'), {
        date: '2020-06-15',
        mealTypes: ['breakfast'],
        createdBy: CUSTOMER_A_UID,
        // Even if client sends a future "clientTime" field, it is irrelevant — rules use request.time
        clientTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString()
      }));
    });

    // Test 13: Locked operational order manipulation → DENY
    it('13. Customer cannot modify locked operational order (picked_up) → DENY', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-locked-a'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });
  });

  // =========================================================================
  // Legacy tests preserved
  // =========================================================================

  describe('Unskip Cutoff Security (legacy)', () => {
    it('ALLOW: Customer can remove skip for future date (cutoff has not passed)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', FUTURE_DATE)));
    });

    it('DENY: Customer B cannot remove Customer A skip', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', FUTURE_DATE)));
    });

    it('DENY: Customer cannot remove skip for a date in the past (cutoff has passed)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'subscriptions', 'sub-a', 'skips', PAST_DATE)));
    });
  });

  describe('Unskip Order Restoration (legacy)', () => {
    it('ALLOW: Customer can restore existing eligible cancelled order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(updateDoc(doc(db, 'orders', 'order-cancelled-a-lunch'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer cannot change price while restoring order', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-cancelled-a-lunch'), {
        status: 'scheduled',
        price: 0,
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer B cannot restore Customer A order', async () => {
      const db = env.authenticatedContext(CUSTOMER_B_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-cancelled-a-lunch'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });

    it('DENY: Customer cannot restore past cancelled order (cutoff passed)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-past-a'), {
        status: 'scheduled',
        updatedAt: new Date()
      }));
    });
  });

  describe('Kitchen Rules Security (legacy)', () => {
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
          date: FUTURE_DATE,
          kitchenId: 'kitchen-1'
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
          date: FUTURE_DATE,
          kitchenId: 'kitchen-1'
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

  // =========================================================================
  // unskipRequests Schema and Security Validation
  // =========================================================================
  describe('unskipRequests Security Boundary', () => {
    // Base valid request payload (using FUTURE_DATE so cutoff always passes)
    const validRequest = {
      customerId: CUSTOMER_A_UID,
      subscriptionId: 'sub-a',
      date: '2099-12-31',
      mealTypes: ['lunch'],
      status: 'processed',
      createdAt: new Date(),
    };

    // 1. Valid own request before lunch cutoff → ALLOW
    it('1. ALLOW: Valid own request with future date (before cutoff)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'unskipRequests', 'req-valid'), {
        ...validRequest,
        mealTypes: ['lunch'],
      }));
    });

    // 2. Valid own request: breakfast before cutoff → ALLOW
    it('2. ALLOW: Valid own request for breakfast with future date', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'unskipRequests', 'req-valid-bfast'), {
        ...validRequest,
        mealTypes: ['breakfast'],
      }));
    });

    // 3. Valid own request: dinner before cutoff → ALLOW
    it('3. ALLOW: Valid own request for dinner with future date', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertSucceeds(setDoc(doc(db, 'unskipRequests', 'req-valid-dinner'), {
        ...validRequest,
        mealTypes: ['dinner'],
      }));
    });

    // 4. Past date (all cutoffs have passed) → DENY
    it('4. DENY: Past date request (cutoff passed)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-past'), {
        ...validRequest,
        date: '2020-01-01',
        mealTypes: ['lunch'],
      }));
    });

    // 5. Wrong subscription (belongs to Customer B) → DENY
    it('5. DENY: Subscription belongs to another customer', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-wrong-sub'), {
        ...validRequest,
        subscriptionId: 'sub-b', // owned by CUSTOMER_B_UID
      }));
    });

    // 6. Fake / non-existent subscriptionId → DENY
    it('6. DENY: Non-existent subscriptionId', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-fake-sub'), {
        ...validRequest,
        subscriptionId: 'non-existent-sub',
      }));
    });

    // 7. Invalid meal type → DENY
    it('7. DENY: Invalid meal type value', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-bad-meal'), {
        ...validRequest,
        mealTypes: ['brunch'],
      }));
    });

    // 8. Empty mealTypes → DENY
    it('8. DENY: Empty mealTypes array', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-empty-meals'), {
        ...validRequest,
        mealTypes: [],
      }));
    });

    // 9. Extra price field → DENY
    it('9. DENY: Extra price field (schema must be exact)', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-extra-price'), {
        ...validRequest,
        price: 0,
      }));
    });

    // 10. Extra quantity field → DENY
    it('10. DENY: Extra quantity field', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-extra-qty'), {
        ...validRequest,
        quantity: 100,
      }));
    });

    // 11. Extra zone field → DENY
    it('11. DENY: Extra zone field', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-extra-zone'), {
        ...validRequest,
        zoneId: 'zone-1',
      }));
    });

    // 12. Extra plan field → DENY
    it('12. DENY: Extra plan field', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-extra-plan'), {
        ...validRequest,
        planId: 'plan-1',
      }));
    });

    // 13. Fake orderId / processed flag → DENY
    it('13. DENY: Extra orderId field', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-extra-orderid'), {
        ...validRequest,
        orderId: 'ord_sub-a_2099-12-31_lunch',
      }));
    });

    // 14. Malformed date (wrong length) → DENY
    it('14. DENY: Malformed date string', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-bad-date'), {
        ...validRequest,
        date: '99-1-1',
      }));
    });

    // 15. customerId mismatch → DENY
    it('15. DENY: customerId does not match authenticated user', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-id-mismatch'), {
        ...validRequest,
        customerId: CUSTOMER_B_UID,
      }));
    });

    // 16. Unauthenticated → DENY
    it('16. DENY: Unauthenticated cannot create unskipRequest', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, 'unskipRequests', 'req-anon'), validRequest));
    });
  });
});
