import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-holiday-race',
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Holiday Race Condition', () => {
  it('blocks order creation if a holiday is declared concurrently (after isHoliday read)', async () => {
    const adminContext = testEnv.authenticatedContext('admin_user', { role: 'admin', isActive: true });
    const generatorContext = testEnv.authenticatedContext('gen_user', { role: 'admin', isActive: true });
    const dbAdmin = adminContext.firestore();
    const dbGen = generatorContext.firestore();

    const date = '2026-10-15';
    const holidayId = `holiday_${date}`;
    const orderId1 = `order_gen_${date}_1`;

    // Create user docs so isAdmin() evaluates to true
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'admin_user'), { role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', 'gen_user'), { role: 'admin', isActive: true });
    });

    // 1. Generator reads isHoliday() -> false (because it's not created yet)
    const snapBefore = await getDoc(doc(dbGen, 'holidays', holidayId));
    expect(snapBefore.exists()).toBe(false);

    // 2. Admin concurrently declares the holiday
    await setDoc(doc(dbAdmin, 'holidays', holidayId), {
      id: holidayId,
      date,
      name: 'Concurrent Holiday',
      status: 'active',
      createdBy: 'admin_user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 3. Generator attempts to write the order batch (which is what happens after its local check)
    const batch = writeBatch(dbGen);
    batch.set(doc(dbGen, 'orders', orderId1), {
      id: orderId1,
      date,
      status: 'scheduled',
      mealType: 'lunch',
      customerId: 'cust1',
      planId: 'plan1',
      price: 150,
      currency: 'INR',
      planTier: 'standard',
      createdAt: new Date().toISOString()
    });

    // 4. The rule should explicitly block this because the holiday is now active
    let caughtError = null;
    try {
      await batch.commit();
    } catch (err: any) {
      caughtError = err;
    }
    expect(caughtError).not.toBeNull();
    expect(caughtError.code).toBe('permission-denied');
  });
});
