import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-addon-catalog-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E4 — Add-on Catalog Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-addon-cat';
  const CUSTOMER_UID = 'uid-customer-addon-cat';
  const KITCHEN_UID = 'uid-kitchen-addon-cat';
  const DELIVERY_UID = 'uid-delivery-addon-cat';
  const ACCOUNTS_UID = 'uid-accounts-addon-cat';

  const validAddonData = {
    id: 'addon_masala_buttermilk',
    name: 'Masala Buttermilk',
    price: 25,
    unitPrice: 25,
    applicableMealTypes: ['lunch', 'dinner'],
    validMealSlots: ['lunch', 'dinner'],
    isActive: true,
    description: 'Fresh chilled buttermilk with spices',
    createdBy: ADMIN_UID,
    updatedBy: ADMIN_UID,
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
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

      // Seed an active catalog addon
      await setDoc(doc(db, 'addons', 'addon_curd'), {
        id: 'addon_curd',
        name: 'Fresh Curd Cup',
        price: 20,
        unitPrice: 20,
        applicableMealTypes: ['lunch', 'dinner'],
        validMealSlots: ['lunch', 'dinner'],
        isActive: true,
        createdBy: ADMIN_UID,
        updatedBy: ADMIN_UID,
      });
    });
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  // 1. Read permissions
  it('ALLOW: Customer can read add-on catalog', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(custDb, 'addons', 'addon_curd')));
    expect(snap.exists()).toBe(true);
  });

  it('ALLOW: Admin can read add-on catalog', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(adminDb, 'addons', 'addon_curd')));
    expect(snap.exists()).toBe(true);
  });

  it('DENY: Unauthenticated user cannot read add-on catalog', async () => {
    const unauthDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'addons', 'addon_curd')));
  });

  // 2. Admin Write permissions
  it('ALLOW: Admin can create an add-on item', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'addons', 'addon_masala_buttermilk'), validAddonData));
  });

  it('ALLOW: Admin can update an add-on item', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'addons', 'addon_curd'), {
        price: 25,
        unitPrice: 25,
        updatedBy: ADMIN_UID,
      }),
    );
  });

  it('ALLOW: Admin can enable/disable an add-on item', async () => {
    const adminDb = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(adminDb, 'addons', 'addon_curd'), {
        isActive: false,
        updatedBy: ADMIN_UID,
      }),
    );
  });

  // 3. Customer Write Protection
  it('DENY: Customer cannot create an add-on item', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(setDoc(doc(custDb, 'addons', 'addon_forged'), validAddonData));
  });

  it('DENY: Customer cannot update an add-on item or price', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(
      updateDoc(doc(custDb, 'addons', 'addon_curd'), {
        price: 1, // Attempt to lower price
      }),
    );
  });

  it('DENY: Customer cannot delete an add-on item', async () => {
    const custDb = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(deleteDoc(doc(custDb, 'addons', 'addon_curd')));
  });

  // 4. Other Roles Write Protection
  it('DENY: Kitchen cannot modify add-on catalog', async () => {
    const kitchenDb = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      updateDoc(doc(kitchenDb, 'addons', 'addon_curd'), {
        isActive: false,
      }),
    );
  });

  it('DENY: Delivery Partner cannot modify add-on catalog', async () => {
    const deliveryDb = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      updateDoc(doc(deliveryDb, 'addons', 'addon_curd'), {
        price: 50,
      }),
    );
  });

  it('DENY: Accounts cannot modify add-on catalog', async () => {
    const accountsDb = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      updateDoc(doc(accountsDb, 'addons', 'addon_curd'), {
        price: 35,
      }),
    );
  });
});
