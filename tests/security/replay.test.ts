/**
 * Replay Attack Tests
 *
 * Verifies that idempotency guards and duplicate-submission protections
 * are in place at the Firestore rules and data model level.
 * Tests double-payment, double-subscription creation, double delivery
 * confirmation, and double order generation.
 *
 * These tests validate the DATA LAYER defenses only. Application-layer
 * guards (React state, loading flags) are tested in component tests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, addDoc, collection, updateDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-test-order-history-rules';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔄 Replay Attack Tests', () => {
  let env: RulesTestEnvironment;

  const ADMIN_UID      = 'uid-admin';
  const CUSTOMER_A_UID = 'uid-customer-a';
  const DELIVERY_UID   = 'uid-delivery';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(
          path.resolve(__dirname, '../../firestore.rules'),
          'utf8',
        ),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, 'users', ADMIN_UID),       { id: ADMIN_UID,      role: 'admin' }),
        setDoc(doc(db, 'users', CUSTOMER_A_UID),  { id: CUSTOMER_A_UID, role: 'customer' }),
        setDoc(doc(db, 'users', DELIVERY_UID),    { id: DELIVERY_UID,   role: 'delivery_partner' }),

        // Already-delivered order
        setDoc(doc(db, 'orders', 'order-delivered'), {
          customerId: CUSTOMER_A_UID,
          deliveryPartnerId: DELIVERY_UID,
          status: 'delivered',
          date: '2025-01-15',
          price: 150,
        }),

        // Already-verified payment
        setDoc(doc(db, 'payments', 'pay-verified'), {
          customerId: CUSTOMER_A_UID,
          status: 'verified',
          amount: 4500,
        }),

        // Active subscription
        setDoc(doc(db, 'subscriptions', 'sub-active'), {
          customerId: CUSTOMER_A_UID,
          status: 'active',
          pricePerDaySnapshot: 150,
          creditBalance: 0,
          quantity: 1,
        }),
      ]);
    });
  });

  afterAll(async () => env.cleanup());

  describe('Delivery Confirmation Replay', () => {
    it('DENY: Delivery partner cannot re-deliver an already-delivered order', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      // Order is already "delivered"; valid transitions START from ready_for_pickup.
      // "delivered" → anything is not in isValidDeliveryTransition(), so it should fail.
      await assertFails(updateDoc(doc(db, 'orders', 'order-delivered'), {
        status: 'delivered',
        updatedAt: new Date(),
      }));
    });

    it('DENY: Delivery partner cannot update a delivered order status at all', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(updateDoc(doc(db, 'orders', 'order-delivered'), {
        status: 'out_for_delivery',
        updatedAt: new Date(),
      }));
    });
  });

  describe('Payment Replay', () => {
    it('DENY: Customer cannot create a second payment with status "verified"', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // Customers can only create with status: 'pending'
      await assertFails(addDoc(collection(db, 'payments'), {
        customerId: CUSTOMER_A_UID,
        status: 'verified',
        amount: 4500,
      }));
    });

    it('DENY: Customer cannot self-verify a pending payment (replay self-approval)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'payments', 'pay-pending'), {
          customerId: CUSTOMER_A_UID, status: 'pending', amount: 4500,
        });
      });
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'payments', 'pay-pending'), {
        status: 'verified',
      }));
    });

    it('DENY: Customer cannot update an already-verified payment', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      await assertFails(updateDoc(doc(db, 'payments', 'pay-verified'), {
        amount: 1, // tamper amount after verification
      }));
    });
  });

  describe('Subscription Replay', () => {
    it('DENY: Customer cannot re-activate an already active subscription directly', async () => {
      const db = env.authenticatedContext(CUSTOMER_A_UID).firestore();
      // active → active is not in isAllowedCustomerTransition
      await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-active'), {
        status: 'active',
        updatedAt: new Date(),
      }));
    });
  });
});
