import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '@firebase/firestore';

const PROJECT_ID = 'demo-settings-sec';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 Phase E6 — Operational & Business Settings Security Rules', () => {
  let env: RulesTestEnvironment;
  const ADMIN_UID = 'uid-admin-settings';
  const CUSTOMER_UID = 'uid-customer-settings';
  const KITCHEN_UID = 'uid-kitchen-settings';
  const DELIVERY_UID = 'uid-delivery-settings';
  const ACCOUNTS_UID = 'uid-accounts-settings';

  const validOperationalSettings = {
    id: 'business',
    operations: {
      orderCutoffTime: '20:00',
      kitchenTimings: { start: '06:00', end: '22:00' },
      cancellationCutoffTimes: {
        breakfast: '05:00',
        lunch: '10:30',
        dinner: '16:00',
      },
      deliveryWindows: {
        breakfast: { start: '07:30', end: '09:00' },
        lunch: { start: '12:30', end: '14:00' },
        dinner: { start: '19:30', end: '21:00' },
      },
      businessHolidays: [],
    },
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
      // Offline / no running emulator
    }
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  beforeEach(async (ctx) => {
    if (!env) {
      ctx.skip();
      return;
    }
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (secCtx) => {
      const db = secCtx.firestore();
      // Setup role users
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
      await setDoc(doc(db, 'users', CUSTOMER_UID), { id: CUSTOMER_UID, role: 'customer', isActive: true });
      await setDoc(doc(db, 'users', KITCHEN_UID), { id: KITCHEN_UID, role: 'kitchen', isActive: true });
      await setDoc(doc(db, 'users', DELIVERY_UID), { id: DELIVERY_UID, role: 'delivery_partner', isActive: true });
      await setDoc(doc(db, 'users', ACCOUNTS_UID), { id: ACCOUNTS_UID, role: 'accounts', isActive: true });

      // Seed default business settings
      await setDoc(doc(db, 'settings', 'business'), validOperationalSettings);
    });
  });

  describe('Unauthenticated Access', () => {
    it('unauthenticated user cannot read settings', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'settings', 'business')));
    });

    it('unauthenticated user cannot write settings', async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, 'settings', 'business'), validOperationalSettings));
    });
  });

  describe('Role-Based Read Permissions', () => {
    it('admin can read operational settings', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'business')));
    });

    it('customer can read operational settings', async () => {
      const db = env.authenticatedContext(CUSTOMER_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'business')));
    });

    it('kitchen can read operational settings', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'business')));
    });

    it('delivery partner can read operational settings', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'business')));
    });

    it('accounts can read operational settings', async () => {
      const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'settings', 'business')));
    });
  });

  describe('Role-Based Write Permissions (Enforce Admin Authority)', () => {
    it('admin can update operational cutoffs and delivery windows', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'settings', 'business'), {
          'operations.cancellationCutoffTimes.lunch': '11:15',
          'operations.deliveryWindows.lunch': { start: '13:00', end: '14:30' },
        }),
      );
    });

    it('customer CANNOT update operational settings', async () => {
      const db = env.authenticatedContext(CUSTOMER_UID).firestore();
      await assertFails(
        updateDoc(doc(db, 'settings', 'business'), {
          'operations.cancellationCutoffTimes.lunch': '12:00',
        }),
      );
    });

    it('kitchen CANNOT update operational settings', async () => {
      const db = env.authenticatedContext(KITCHEN_UID).firestore();
      await assertFails(
        updateDoc(doc(db, 'settings', 'business'), {
          'operations.cancellationCutoffTimes.lunch': '12:00',
        }),
      );
    });

    it('delivery partner CANNOT update operational settings', async () => {
      const db = env.authenticatedContext(DELIVERY_UID).firestore();
      await assertFails(
        updateDoc(doc(db, 'settings', 'business'), {
          'operations.deliveryWindows.lunch': { start: '11:00', end: '15:00' },
        }),
      );
    });

    it('accounts CANNOT update operational settings', async () => {
      const db = env.authenticatedContext(ACCOUNTS_UID).firestore();
      await assertFails(
        updateDoc(doc(db, 'settings', 'business'), {
          'operations.cancellationCutoffTimes.dinner': '18:00',
        }),
      );
    });

    it('settings document CANNOT be deleted even by admin', async () => {
      const db = env.authenticatedContext(ADMIN_UID).firestore();
      await assertFails(deleteDoc(doc(db, 'settings', 'business')));
    });
  });
});
