import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'admin-1'), { role: 'admin', isActive: true });
    await setDoc(doc(db, 'users', 'cust-1'), { role: 'customer', deliveryPartnerId: 'partner-1' });
  });
});

describe('mealDeliveryPartners Security Rules', () => {
  const adminAuth = { sub: 'admin-1', email: 'admin@mysurupaakashale.com' };
  const customerAuth = { sub: 'cust-1', email: 'cust@example.com' };

  it('DENY: Normal customer cannot modify mealDeliveryPartners', async () => {
    const db = testEnv.authenticatedContext('cust-1', customerAuth).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'cust-1'), {
      mealDeliveryPartners: { breakfast: 'partner-2' }
    }));
  });

  it('DENY: Normal customer cannot modify deliveryPartnerId', async () => {
    const db = testEnv.authenticatedContext('cust-1', customerAuth).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'cust-1'), {
      deliveryPartnerId: 'partner-2'
    }));
  });

  it('ALLOW: Authorized admin can modify mealDeliveryPartners', async () => {
    const db = testEnv.authenticatedContext('admin-1', adminAuth).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'cust-1'), {
      mealDeliveryPartners: { breakfast: 'partner-2' }
    }));
  });
});
