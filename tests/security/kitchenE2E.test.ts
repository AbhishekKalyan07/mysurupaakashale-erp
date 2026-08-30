import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertSucceeds,
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, query, collection, where } from '@firebase/firestore';

const PROJECT_ID = 'demo-test';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Kitchen Module E2E Security Tests', () => {
  let env: RulesTestEnvironment;

  const ADMIN_UID = 'uid-admin';
  const KITCHEN_UID = 'uid-kitchen';
  const KITCHEN_ID = 'kitchen_1';

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

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      
      // Seed Kitchen user profile
      await setDoc(doc(db, 'users', KITCHEN_UID), {
        role: 'kitchen',
        kitchenId: KITCHEN_ID
      });

      // Seed a generated order assigned to this kitchen
      await setDoc(doc(db, 'orders', 'ord_1'), {
        customerId: 'cust_1',
        kitchenId: KITCHEN_ID, // <-- this is what we fixed in production
        date: '2026-08-30',
        mealType: 'breakfast',
        status: 'scheduled'
      });
      
      // Seed a generated order assigned to NO kitchen (the bug we fixed)
      await setDoc(doc(db, 'orders', 'ord_null'), {
        customerId: 'cust_2',
        kitchenId: null, // the buggy state
        date: '2026-08-30',
        mealType: 'breakfast',
        status: 'scheduled'
      });

      // Seed a generated order assigned to ANOTHER kitchen
      await setDoc(doc(db, 'orders', 'ord_other'), {
        customerId: 'cust_3',
        kitchenId: 'kitchen_2',
        date: '2026-08-30',
        mealType: 'breakfast',
        status: 'scheduled'
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('Kitchen staff can read orders assigned to their kitchenId', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    
    // Read the order with their kitchenId
    await assertSucceeds(getDoc(doc(kitchenDb, 'orders', 'ord_1')));
    
    // Querying all orders for today should succeed IF filtered by their kitchenId
    const q = query(
      collection(kitchenDb, 'orders'),
      where('date', '==', '2026-08-30'),
      where('kitchenId', '==', KITCHEN_ID)
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.empty).toBe(false);
    expect(snap.docs[0].id).toBe('ord_1');
  });

  it('Kitchen staff cannot read orders assigned to another kitchen (K2)', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    
    // Read the order with K2
    await assertFails(getDoc(doc(kitchenDb, 'orders', 'ord_other')));
  });

  it('Kitchen staff cannot read orders with null kitchenId', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    
    // Read the order with null
    await assertFails(getDoc(doc(kitchenDb, 'orders', 'ord_null')));
  });

  it('Unauthenticated user cannot read orders', async () => {
    const unauthDb = env.unauthenticatedContext().firestore();
    
    await assertFails(getDoc(doc(unauthDb, 'orders', 'ord_1')));
  });
});
