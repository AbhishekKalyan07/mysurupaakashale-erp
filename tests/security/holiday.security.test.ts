/**
 * holiday.security.test.ts
 *
 * Tests the firestore.rules for the holidays collection and the 
 * holiday guard in the orders collection.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Read the local firestore.rules file
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-mysuru-paakashale',
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Holiday Security Rules', () => {
  const adminAuth = { uid: 'admin-1', email: 'admin@mysurupaakashale.com', customClaims: { role: 'admin' } };
  const customerAuth = { uid: 'cust-1', email: 'cust@example.com' };
  
  const HOLIDAY_ID = 'holiday_2026-10-02';
  
  const VALID_HOLIDAY_DOC = {
    id: HOLIDAY_ID,
    date: '2026-10-02',
    name: 'Gandhi Jayanti',
    status: 'active',
    createdBy: 'admin-1',
  };

  describe('/holidays/{holidayId}', () => {
    it('allows admin to create a holiday with valid deterministic ID', async () => {
      const adminDb = testEnv.authenticatedContext(adminAuth.uid, adminAuth.customClaims).firestore();
      const ref = doc(adminDb, 'holidays', HOLIDAY_ID);
      await assertSucceeds(setDoc(ref, VALID_HOLIDAY_DOC));
    });

    it('denies admin from creating a holiday with mismatched date in ID', async () => {
      const adminDb = testEnv.authenticatedContext(adminAuth.uid, adminAuth.customClaims).firestore();
      const ref = doc(adminDb, 'holidays', 'holiday_2026-10-02');
      await assertFails(setDoc(ref, {
        ...VALID_HOLIDAY_DOC,
        date: '2026-10-03', // mismatch with ID suffix
      }));
    });

    it('denies non-admin from creating a holiday', async () => {
      const custDb = testEnv.authenticatedContext(customerAuth.uid).firestore();
      const ref = doc(custDb, 'holidays', HOLIDAY_ID);
      await assertFails(setDoc(ref, VALID_HOLIDAY_DOC));
    });

    it('allows signed-in users (e.g. customers/kitchen) to read holidays', async () => {
      // Create first as admin
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'holidays', HOLIDAY_ID), VALID_HOLIDAY_DOC);
      });

      const custDb = testEnv.authenticatedContext(customerAuth.uid).firestore();
      await assertSucceeds(getDoc(doc(custDb, 'holidays', HOLIDAY_ID)));
    });

    it('allows admin to update status to cancelled', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'holidays', HOLIDAY_ID), VALID_HOLIDAY_DOC);
      });

      const adminDb = testEnv.authenticatedContext(adminAuth.uid, adminAuth.customClaims).firestore();
      const ref = doc(adminDb, 'holidays', HOLIDAY_ID);
      await assertSucceeds(updateDoc(ref, { status: 'cancelled' }));
    });

    it('denies physical deletion even by admin', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'holidays', HOLIDAY_ID), VALID_HOLIDAY_DOC);
      });

      const adminDb = testEnv.authenticatedContext(adminAuth.uid, adminAuth.customClaims).firestore();
      const ref = doc(adminDb, 'holidays', HOLIDAY_ID);
      await assertFails(deleteDoc(ref));
    });
  });

  describe('Order creation on a holiday', () => {
    it('denies customer one-time order creation if date is an active holiday', async () => {
      // 1. Create active holiday
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'holidays', HOLIDAY_ID), VALID_HOLIDAY_DOC);
        // Also create the meal plan needed for order validation
        await setDoc(doc(context.firestore(), 'mealPlans', 'plan-1'), {
          pricingMatrix: { lunch: 65 }
        });
      });

      // 2. Customer tries to create order for that date
      const custDb = testEnv.authenticatedContext(customerAuth.uid).firestore();
      const orderRef = doc(custDb, 'orders', 'ord-1');
      await assertFails(setDoc(orderRef, {
        id: 'ord-1',
        displayId: 'O-1234',
        source: 'one_time',
        customerId: customerAuth.uid,
        customerName: 'Test',
        customerCode: 'CUST',
        customerPhone: '123',
        address: 'Addr',
        planId: 'plan-1',
        planTier: 'basic',
        mealType: 'lunch',
        date: '2026-10-02', // Matches active holiday
        itemsLabel: 'Lunch',
        selectedOptionId: 'opt-1',
        price: 65,
        currency: 'INR',
        status: 'scheduled',
        deliveryAddressId: 'addr-1',
        createdAt: 'ts',
        updatedAt: 'ts'
      }));
    });

    it('allows customer one-time order creation if holiday is cancelled', async () => {
      // 1. Create CANCELLED holiday
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'holidays', HOLIDAY_ID), {
          ...VALID_HOLIDAY_DOC,
          status: 'cancelled'
        });
        await setDoc(doc(context.firestore(), 'mealPlans', 'plan-1'), {
          pricingMatrix: { lunch: 65 }
        });
      });

      // 2. Customer tries to create order for that date -> Should succeed
      const custDb = testEnv.authenticatedContext(customerAuth.uid).firestore();
      const orderRef = doc(custDb, 'orders', 'ord-1');
      await assertSucceeds(setDoc(orderRef, {
        id: 'ord-1',
        displayId: 'O-1234',
        source: 'one_time',
        customerId: customerAuth.uid,
        customerName: 'Test',
        customerCode: 'CUST',
        customerPhone: '123',
        address: 'Addr',
        planId: 'plan-1',
        planTier: 'basic',
        mealType: 'lunch',
        date: '2026-10-02', // Matches cancelled holiday
        itemsLabel: 'Lunch',
        selectedOptionId: 'opt-1',
        price: 65,
        currency: 'INR',
        status: 'scheduled',
        deliveryAddressId: 'addr-1',
        createdAt: 'ts',
        updatedAt: 'ts'
      }));
    });
  });
});
