import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from '@firebase/firestore';

const withFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withFirestoreEmulator('active Firestore RBAC rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mysuru-paakashale-rules-test',
      firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await Promise.all([
        setDoc(doc(database, 'users', 'admin'), { id: 'admin', role: 'admin' }),
        setDoc(doc(database, 'users', 'customer'), { id: 'customer', role: 'customer' }),
        setDoc(doc(database, 'users', 'kitchen'), { id: 'kitchen', role: 'kitchen' }),
        setDoc(doc(database, 'users', 'delivery'), { id: 'delivery', role: 'delivery_partner' }),
        setDoc(doc(database, 'users', 'accounts'), { id: 'accounts', role: 'accounts' }),
        setDoc(doc(database, 'orders', 'customer-order'), { customerId: 'customer', deliveryPartnerId: 'delivery', status: 'scheduled' }),
        setDoc(doc(database, 'orders', 'other-order'), { customerId: 'other', deliveryPartnerId: 'other-delivery', status: 'scheduled' }),
        setDoc(doc(database, 'payments', 'payment'), { customerId: 'customer', status: 'pending', amount: 100 }),
      ]);
    });
  });

  afterAll(async () => environment.cleanup());

  it('denies anonymous reads and limits customers to their own order', async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'orders', 'customer-order')));
    const customer = environment.authenticatedContext('customer').firestore();
    await assertSucceeds(getDoc(doc(customer, 'orders', 'customer-order')));
    await assertFails(getDoc(doc(customer, 'orders', 'other-order')));
  });

  it('allows kitchen staff to update operational order status', async () => {
    const kitchen = environment.authenticatedContext('kitchen').firestore();
    await assertSucceeds(updateDoc(doc(kitchen, 'orders', 'customer-order'), { status: 'preparing' }));
  });

  it('limits delivery staff to their assigned order', async () => {
    const delivery = environment.authenticatedContext('delivery').firestore();
    await assertSucceeds(updateDoc(doc(delivery, 'orders', 'customer-order'), { status: 'out_for_delivery' }));
    await assertFails(updateDoc(doc(delivery, 'orders', 'other-order'), { status: 'out_for_delivery' }));
  });

  it('allows accounts to read payments but not modify them', async () => {
    const accounts = environment.authenticatedContext('accounts').firestore();
    await assertSucceeds(getDoc(doc(accounts, 'payments', 'payment')));
    await assertFails(updateDoc(doc(accounts, 'payments', 'payment'), { status: 'verified' }));
  });

  it('allows admins to verify payments', async () => {
    const admin = environment.authenticatedContext('admin').firestore();
    await assertSucceeds(updateDoc(doc(admin, 'payments', 'payment'), { status: 'verified' }));
  });
});
