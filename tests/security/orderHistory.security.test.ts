import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { 
  initializeTestEnvironment, 
  RulesTestEnvironment, 
  RulesTestContext 
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test-order-history-rules',
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

describe('Order History Security Rules', () => {
  it('allows a customer to read their own orders', async () => {
    const customer = testEnv.authenticatedContext('customer123', { role: 'customer' });
    
    // Setup data bypasses rules
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/customer123'), { role: 'customer' });
      await setDoc(doc(db, 'orders/order1'), { customerId: 'customer123', status: 'delivered' });
    });

    const db = customer.firestore();
    const docSnap = await getDoc(doc(db, 'orders/order1'));
    expect(docSnap.exists()).toBe(true);
  });

  it('denies a customer from reading another customer orders', async () => {
    const customer = testEnv.authenticatedContext('customer123', { role: 'customer' });
    
    // Setup data bypasses rules
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/customer123'), { role: 'customer' });
      await setDoc(doc(db, 'orders/order2'), { customerId: 'customer456', status: 'delivered' });
    });

    const db = customer.firestore();
    await expect(getDoc(doc(db, 'orders/order2'))).rejects.toThrow();
  });

  it('allows an admin to read any customer orders', async () => {
    const admin = testEnv.authenticatedContext('admin123', { role: 'admin' });
    
    // Setup data bypasses rules
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/admin123'), { role: 'admin' });
      await setDoc(doc(db, 'orders/order1'), { customerId: 'customer123', status: 'delivered' });
    });

    const db = admin.firestore();
    const docSnap = await getDoc(doc(db, 'orders/order1'));
    expect(docSnap.exists()).toBe(true);
  });
});
