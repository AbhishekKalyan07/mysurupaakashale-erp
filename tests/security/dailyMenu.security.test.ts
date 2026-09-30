import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-dailymenu-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E1 — Daily Menu Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-menu';
  const KITCHEN_UID = 'uid-kitchen-menu';
  const OTHER_KITCHEN_UID = 'uid-other-kitchen';
  const CUSTOMER_UID = 'uid-customer-menu';
  const DELIVERY_UID = 'uid-delivery-menu';
  const ACCOUNTS_UID = 'uid-accounts-menu';

  const KITCHEN_ID = 'kitchen_main';
  const OTHER_KITCHEN_ID = 'kitchen_branch';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Setup users
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), {
        id: KITCHEN_UID,
        role: 'kitchen',
        kitchenId: KITCHEN_ID,
        isActive: true,
      });
      await setDoc(doc(db, 'users', OTHER_KITCHEN_UID), {
        id: OTHER_KITCHEN_UID,
        role: 'kitchen',
        kitchenId: OTHER_KITCHEN_ID,
        isActive: true,
      });
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer', isActive: true });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });

      // Seed a draft menu and a published menu
      await setDoc(doc(db, 'dailyMenus', 'menu-draft-1'), {
        id: 'menu-draft-1',
        date: '2026-10-01',
        status: 'draft',
        kitchenId: KITCHEN_ID,
        breakfast: { name: 'Idli Sambar', items: ['Idli', 'Sambar'], isAvailable: true },
      });

      await setDoc(doc(db, 'dailyMenus', 'menu-published-1'), {
        id: 'menu-published-1',
        date: '2026-10-01',
        status: 'published',
        kitchenId: KITCHEN_ID,
        lunch: { name: 'South Meals', items: ['Rice', 'Sambar'], isAvailable: true },
      });

      await setDoc(doc(db, 'dailyMenus', 'menu-archived-1'), {
        id: 'menu-archived-1',
        date: '2026-09-30',
        status: 'archived',
        kitchenId: KITCHEN_ID,
        lunch: { name: 'Old South Meals', items: ['Rice'], isAvailable: true },
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // 1. Customer read access
  it('ALLOW: Customer can read published daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(db, 'dailyMenus', 'menu-published-1')));
    expect(snap.exists()).toBe(true);
  });

  it('DENY: Customer cannot read draft daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(getDoc(doc(db, 'dailyMenus', 'menu-draft-1')));
  });

  it('DENY: Customer cannot read archived daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(getDoc(doc(db, 'dailyMenus', 'menu-archived-1')));
  });

  // 2. Customer write access
  it('DENY: Customer cannot create a daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'dailyMenus', 'menu-cust-new'), {
        date: '2026-10-02',
        status: 'draft',
        kitchenId: KITCHEN_ID,
      }),
    );
  });

  it('DENY: Customer cannot update a daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'dailyMenus', 'menu-published-1'), {
        status: 'archived',
      }),
    );
  });

  it('DENY: Customer cannot delete a daily menu', async () => {
    const db = env.authenticatedContext(CUSTOMER_UID).firestore();
    await assertFails(deleteDoc(doc(db, 'dailyMenus', 'menu-draft-1')));
  });

  // 3. Other unauthorized roles
  it('DENY: Delivery partner cannot create or update daily menu', async () => {
    const db = env.authenticatedContext(DELIVERY_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'dailyMenus', 'menu-driver-new'), {
        date: '2026-10-02',
        status: 'draft',
        kitchenId: KITCHEN_ID,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'dailyMenus', 'menu-draft-1'), {
        status: 'published',
      }),
    );
  });

  it('DENY: Accounts staff cannot create or update daily menu', async () => {
    const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'dailyMenus', 'menu-acc-new'), {
        date: '2026-10-02',
        status: 'draft',
        kitchenId: KITCHEN_ID,
      }),
    );
  });

  // 4. Kitchen staff permissions
  it('ALLOW: Kitchen staff can read draft menu', async () => {
    const db = env.authenticatedContext(KITCHEN_UID).firestore();
    const snap = await assertSucceeds(getDoc(doc(db, 'dailyMenus', 'menu-draft-1')));
    expect(snap.exists()).toBe(true);
  });

  it('ALLOW: Kitchen staff can create draft menu for their own kitchenId', async () => {
    const db = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'dailyMenus', 'menu-kitchen-new'), {
        date: '2026-10-02',
        status: 'draft',
        kitchenId: KITCHEN_ID,
        breakfast: { name: 'Poha', items: ['Poha'], isAvailable: true },
      }),
    );
  });

  it('DENY: Kitchen staff cannot create published menu directly (must go through approval/admin)', async () => {
    const db = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'dailyMenus', 'menu-kitchen-direct-pub'), {
        date: '2026-10-02',
        status: 'published',
        kitchenId: KITCHEN_ID,
      }),
    );
  });

  it('ALLOW: Kitchen staff can edit draft menu for their own kitchenId', async () => {
    const db = env.authenticatedContext(KITCHEN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'dailyMenus', 'menu-draft-1'), {
        status: 'draft',
        kitchenId: KITCHEN_ID,
        breakfast: { name: 'Masala Dosa', items: ['Dosa', 'Chutney'], isAvailable: true },
      }),
    );
  });

  it('DENY: Kitchen staff cannot edit a menu belonging to a different kitchen', async () => {
    const db = env.authenticatedContext(OTHER_KITCHEN_UID).firestore();
    await assertFails(
      updateDoc(doc(db, 'dailyMenus', 'menu-draft-1'), {
        status: 'draft',
        kitchenId: KITCHEN_ID,
      }),
    );
  });

  // 5. Admin full access
  it('ALLOW: Admin has full access to create, publish, and delete daily menus', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();

    // Admin can create draft
    await assertSucceeds(
      setDoc(doc(db, 'dailyMenus', 'menu-admin-1'), {
        date: '2026-10-03',
        status: 'draft',
        kitchenId: KITCHEN_ID,
      }),
    );

    // Admin can update to published
    await assertSucceeds(
      updateDoc(doc(db, 'dailyMenus', 'menu-admin-1'), {
        status: 'published',
      }),
    );

    // Admin can delete
    await assertSucceeds(deleteDoc(doc(db, 'dailyMenus', 'menu-admin-1')));
  });
});
