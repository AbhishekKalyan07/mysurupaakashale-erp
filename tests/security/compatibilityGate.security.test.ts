import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from '@firebase/firestore';

const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const oldRulesContent = fs.readFileSync(path.resolve(__dirname, 'old.firestore.rules'), 'utf8');
const newRulesContent = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');

withEmulator('🔐 Compatibility Gate: Old/New Frontend & Rules Matrix', () => {

  // =========================================================================
  // COMBINATION A: Old Frontend + Old Rules
  // =========================================================================
  describe('Combination A: Old Frontend + Old Rules', () => {
    let envOld: RulesTestEnvironment;
    const CUST_A = 'cust-old-frontend-old-rules';

    beforeAll(async () => {
      envOld = await initializeTestEnvironment({
        projectId: 'demo-compat-a',
        firestore: { rules: oldRulesContent },
      });
    });

    afterAll(async () => {
      if (envOld) await envOld.cleanup();
    });

    beforeEach(async () => {
      await envOld.clearFirestore();
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'mealPlans', 'plan-std'), {
          id: 'plan-std',
          tier: 'standard',
          pricePerDay: 100,
          pricingMatrix: { lunch: 60, dinner: 60, lunch_dinner: 120 },
        });
        await setDoc(doc(db, 'deliveryZones', 'zone-1'), {
          id: 'zone-1',
          pincodes: ['570001'],
          kitchenId: 'k1',
          isActive: true,
        });
      });
    });

    it('A1. Old registration succeeds without addressIds', async () => {
      const db = envOld.authenticatedContext(CUST_A, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'users', CUST_A), {
          id: CUST_A,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
        })
      );
    });

    it('A2. Old address creation updates root addresses array only', async () => {
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_A), {
          id: CUST_A,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
        });
      });

      const db = envOld.authenticatedContext(CUST_A, { role: 'customer' }).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'users', CUST_A), {
          addresses: [
            {
              id: 'addr-1',
              label: 'Home',
              line1: '123 Main St',
              city: 'Mysuru',
              pincode: '570001',
              isDefault: true,
            },
          ],
          defaultAddressId: 'addr-1',
        })
      );
    });

    it('A3. Old subscription creation succeeds under Old Rules without mirror doc', async () => {
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_A), {
          id: CUST_A,
          role: 'customer',
          creditBalance: 0,
          addresses: [
            {
              id: 'addr-1',
              label: 'Home',
              line1: '123 Main St',
              city: 'Mysuru',
              pincode: '570001',
              isDefault: true,
            },
          ],
          defaultAddressId: 'addr-1',
        });
      });

      const db = envOld.authenticatedContext(CUST_A, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'subscriptions', 'sub-old-1'), {
          id: 'sub-old-1',
          customerId: CUST_A,
          planId: 'plan-std',
          planTier: 'standard',
          quantity: 1,
          pricePerDaySnapshot: 60,
          pricingMatrixSnapshot: { lunch: 60, dinner: 60, lunch_dinner: 120 },
          deliveryAddressId: 'addr-1',
          mealPreferences: [{ mealType: 'lunch' }],
          status: 'pending_payment',
          startDate: '2026-11-10',
          endDate: null,
          billingCycle: 'monthly',
          autoRenew: true,
          depositAmount: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    });
  });

  // =========================================================================
  // COMBINATION B: New Frontend + Old Rules
  // =========================================================================
  describe('Combination B: New Frontend + Old Rules', () => {
    let envOld: RulesTestEnvironment;
    const CUST_B = 'cust-new-frontend-old-rules';

    beforeAll(async () => {
      envOld = await initializeTestEnvironment({
        projectId: 'demo-compat-b',
        firestore: { rules: oldRulesContent },
      });
    });

    afterAll(async () => {
      if (envOld) await envOld.cleanup();
    });

    beforeEach(async () => {
      await envOld.clearFirestore();
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'mealPlans', 'plan-std'), {
          id: 'plan-std',
          tier: 'standard',
          pricePerDay: 100,
          pricingMatrix: { lunch: 60, dinner: 60, lunch_dinner: 120 },
        });
        await setDoc(doc(db, 'deliveryZones', 'zone-1'), {
          id: 'zone-1',
          pincodes: ['570001'],
          kitchenId: 'k1',
          isActive: true,
        });
      });
    });

    it('B1. New registration initializes addressIds: [] under Old Rules', async () => {
      const db = envOld.authenticatedContext(CUST_B, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'users', CUST_B), {
          id: CUST_B,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
          addressIds: [],
        })
      );
    });

    it('B2. New atomic address creation (root + mirror) succeeds under Old Rules', async () => {
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_B), {
          id: CUST_B,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
          addressIds: [],
        });
      });

      const db = envOld.authenticatedContext(CUST_B, { role: 'customer' }).firestore();
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', CUST_B);
      const addrRef = doc(db, 'users', CUST_B, 'addresses', 'addr-new-1');

      const addrData = {
        id: 'addr-new-1',
        label: 'Home',
        line1: '456 New Rd',
        city: 'Mysuru',
        pincode: '570001',
        isDefault: true,
      };

      batch.update(userRef, {
        addresses: [addrData],
        addressIds: ['addr-new-1'],
        defaultAddressId: 'addr-new-1',
        updatedAt: new Date(),
      });
      batch.set(addrRef, addrData);

      await assertSucceeds(batch.commit());
    });

    it('B3. New atomic address deletion succeeds under Old Rules', async () => {
      await envOld.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', CUST_B), {
          id: CUST_B,
          role: 'customer',
          creditBalance: 0,
          addresses: [
            {
              id: 'addr-new-1',
              label: 'Home',
              line1: '456 New Rd',
              city: 'Mysuru',
              pincode: '570001',
              isDefault: true,
            },
          ],
          addressIds: ['addr-new-1'],
          defaultAddressId: 'addr-new-1',
        });
        await setDoc(doc(db, 'users', CUST_B, 'addresses', 'addr-new-1'), {
          id: 'addr-new-1',
          line1: '456 New Rd',
          city: 'Mysuru',
          pincode: '570001',
        });
      });

      const db = envOld.authenticatedContext(CUST_B, { role: 'customer' }).firestore();
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', CUST_B), {
        addresses: [],
        addressIds: [],
        defaultAddressId: null,
        updatedAt: new Date(),
      });
      batch.delete(doc(db, 'users', CUST_B, 'addresses', 'addr-new-1'));

      await assertSucceeds(batch.commit());
    });
  });

  // =========================================================================
  // COMBINATION C: Old Frontend + New Rules (CRITICAL GATE)
  // =========================================================================
  describe('Combination C: Old Frontend + New Rules', () => {
    let envNew: RulesTestEnvironment;
    const CUST_C = 'cust-old-frontend-new-rules';

    beforeAll(async () => {
      envNew = await initializeTestEnvironment({
        projectId: 'demo-compat-c',
        firestore: { rules: newRulesContent },
      });
    });

    afterAll(async () => {
      if (envNew) await envNew.cleanup();
    });

    beforeEach(async () => {
      await envNew.clearFirestore();
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'mealPlans', 'plan-std'), {
          id: 'plan-std',
          tier: 'standard',
          pricePerDay: 100,
          pricingMatrix: { lunch: 60, dinner: 60, lunch_dinner: 120 },
          optionIds: ['opt-l1', 'opt-d1'],
          lunchOptionIds: ['opt-l1'],
          dinnerOptionIds: ['opt-d1'],
        });
        await setDoc(doc(db, 'deliveryZones', 'zone-1'), {
          id: 'zone-1',
          pincodes: ['570001'],
          kitchenId: 'k1',
          isActive: true,
        });
      });
    });

    it('C1. Old registration without addressIds succeeds under New Rules', async () => {
      const db = envNew.authenticatedContext(CUST_C, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'users', CUST_C), {
          id: CUST_C,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
        })
      );
    });

    it('C2. Old-client address creation without addressIds or mirror: SAFELY DENIED under New Rules', async () => {
      // Legacy user doc without addressIds
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_C), {
          id: CUST_C,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
        });
      });

      const db = envNew.authenticatedContext(CUST_C, { role: 'customer' }).firestore();
      // Old client attempts to update only root `addresses` -> DENIED by fixed rules
      await assertFails(
        updateDoc(doc(db, 'users', CUST_C), {
          addresses: [
            {
              id: 'addr-legacy-1',
              label: 'Home',
              line1: '789 Legacy St',
              city: 'Mysuru',
              pincode: '570001',
              isDefault: true,
            },
          ],
          defaultAddressId: 'addr-legacy-1',
        })
      );

      // Verify that user doc remains unchanged and NO mirror doc exists
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const userSnap = await getDoc(doc(ctx.firestore(), 'users', CUST_C));
        expect(userSnap.data()?.addresses).toEqual([]);
        const mirrorSnap = await getDoc(doc(ctx.firestore(), 'users', CUST_C, 'addresses', 'addr-legacy-1'));
        expect(mirrorSnap.exists()).toBe(false);
      });
    });

    it('C3. CRITICAL: Subscription creation FAILS under New Rules if customer used Old Frontend address creation', async () => {
      // Setup customer having root address but NO addressIds and NO mirror subcollection doc
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_C), {
          id: CUST_C,
          role: 'customer',
          creditBalance: 0,
          addresses: [
            {
              id: 'addr-legacy-1',
              label: 'Home',
              line1: '789 Legacy St',
              city: 'Mysuru',
              pincode: '570001',
              isDefault: true,
            },
          ],
          defaultAddressId: 'addr-legacy-1',
        });
      });

      const db = envNew.authenticatedContext(CUST_C, { role: 'customer' }).firestore();

      // Customer attempts to create subscription referencing 'addr-legacy-1'
      // Under New Rules: isValidCustomerAddressAndZone checks exists(userPath) &&
      // get(userPath).data.get('addressIds', null) != null && exists(addrPath).
      // Both fail closed -> PERMISSION_DENIED!
      await assertFails(
        setDoc(doc(db, 'subscriptions', 'sub-fail-legacy'), {
          id: 'sub-fail-legacy',
          customerId: CUST_C,
          planId: 'plan-std',
          planTier: 'standard',
          quantity: 1,
          pricePerDaySnapshot: 60,
          pricingMatrixSnapshot: { lunch: 60, dinner: 60, lunch_dinner: 120 },
          deliveryAddressId: 'addr-legacy-1',
          mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt-l1' }],
          status: 'pending_payment',
          startDate: '2026-11-10',
          endDate: null,
          billingCycle: 'monthly',
          autoRenew: true,
          depositAmount: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    });

    it('C4. Old client address deletion when addressIds was already populated: SAFELY DENIED under New Rules', async () => {
      // Setup customer where new client previously added addressIds: ['addr-1']
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', CUST_C), {
          id: CUST_C,
          role: 'customer',
          creditBalance: 0,
          addresses: [{ id: 'addr-1', line1: '123 St', pincode: '570001' }],
          addressIds: ['addr-1'],
          defaultAddressId: 'addr-1',
        });
        await setDoc(doc(db, 'users', CUST_C, 'addresses', 'addr-1'), {
          id: 'addr-1',
          line1: '123 St',
          pincode: '570001',
        });
      });

      const db = envNew.authenticatedContext(CUST_C, { role: 'customer' }).firestore();

      // Old client attempts to delete address by updating ONLY root `addresses: []` without touching `addressIds`
      // Denied under fixed rules because newAddrs.size() != newIds.size()
      await assertFails(
        updateDoc(doc(db, 'users', CUST_C), {
          addresses: [],
          defaultAddressId: null,
        })
      );

      // Verify resulting state: addresses was preserved, no corrupt partial state
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const userSnap = await getDoc(doc(ctx.firestore(), 'users', CUST_C));
        const data = userSnap.data()!;
        expect(data.addresses.length).toBe(1);
        expect(data.addressIds.length).toBe(1);
      });
    });

    it('C5. Old client cannot modify protected profile fields under New Rules', async () => {
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_C), {
          id: CUST_C,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
        });
      });

      const db = envNew.authenticatedContext(CUST_C, { role: 'customer' }).firestore();
      await assertFails(
        updateDoc(doc(db, 'users', CUST_C), {
          role: 'admin',
        })
      );
      await assertFails(
        updateDoc(doc(db, 'users', CUST_C), {
          creditBalance: 500,
        })
      );
    });
  });

  // =========================================================================
  // COMBINATION D: New Frontend + New Rules
  // =========================================================================
  describe('Combination D: New Frontend + New Rules', () => {
    let envNew: RulesTestEnvironment;
    const CUST_D = 'cust-new-frontend-new-rules';
    const CUST_OTHER = 'cust-other-user';
    const ADMIN_UID = 'admin-user-d';

    beforeAll(async () => {
      envNew = await initializeTestEnvironment({
        projectId: 'demo-compat-d',
        firestore: { rules: newRulesContent },
      });
    });

    afterAll(async () => {
      if (envNew) await envNew.cleanup();
    });

    beforeEach(async () => {
      await envNew.clearFirestore();
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin', isActive: true });
        await setDoc(doc(db, 'mealPlans', 'plan-std'), {
          id: 'plan-std',
          tier: 'standard',
          pricePerDay: 100,
          pricingMatrix: { lunch: 60, dinner: 60, lunch_dinner: 120 },
          optionIds: ['opt-l1', 'opt-d1'],
          lunchOptionIds: ['opt-l1'],
          dinnerOptionIds: ['opt-d1'],
        });
        await setDoc(doc(db, 'deliveryZones', 'zone-1'), {
          id: 'zone-1',
          pincodes: ['570001'],
          kitchenId: 'k1',
          isActive: true,
        });
      });
    });

    it('D1. Registration with addressIds: [] succeeds under New Rules', async () => {
      const db = envNew.authenticatedContext(CUST_D, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'users', CUST_D), {
          id: CUST_D,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
          addressIds: [],
        })
      );
    });

    it('D2. Atomic address creation (root + mirror) succeeds and maintains consistency', async () => {
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', CUST_D), {
          id: CUST_D,
          role: 'customer',
          creditBalance: 0,
          addresses: [],
          addressIds: [],
        });
      });

      const db = envNew.authenticatedContext(CUST_D, { role: 'customer' }).firestore();
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', CUST_D);
      const addrRef = doc(db, 'users', CUST_D, 'addresses', 'addr-d1');

      const addrData = {
        id: 'addr-d1',
        label: 'Home',
        line1: '100 Mysore Palace Rd',
        city: 'Mysuru',
        pincode: '570001',
        isDefault: true,
      };

      batch.update(userRef, {
        addresses: [addrData],
        addressIds: ['addr-d1'],
        defaultAddressId: 'addr-d1',
        updatedAt: new Date(),
      });
      batch.set(addrRef, addrData);

      await assertSucceeds(batch.commit());

      // Verify mirror doc exists
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const mirrorSnap = await getDoc(doc(ctx.firestore(), 'users', CUST_D, 'addresses', 'addr-d1'));
        expect(mirrorSnap.exists()).toBe(true);
      });
    });

    it('D3. Deletion at arbitrary index (middle of 3 items) succeeds under New Rules', async () => {
      const addrs = [
        { id: 'addr-0', line1: '0', pincode: '570001' },
        { id: 'addr-1', line1: '1', pincode: '570001' },
        { id: 'addr-2', line1: '2', pincode: '570001' },
      ];
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', CUST_D), {
          id: CUST_D,
          role: 'customer',
          creditBalance: 0,
          addresses: addrs,
          addressIds: ['addr-0', 'addr-1', 'addr-2'],
          defaultAddressId: 'addr-0',
        });
        for (const a of addrs) {
          await setDoc(doc(db, 'users', CUST_D, 'addresses', a.id), a);
        }
      });

      const db = envNew.authenticatedContext(CUST_D, { role: 'customer' }).firestore();
      // Delete middle address 'addr-1'
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', CUST_D), {
        addresses: [addrs[0], addrs[2]],
        addressIds: ['addr-0', 'addr-2'],
        updatedAt: new Date(),
      });
      batch.delete(doc(db, 'users', CUST_D, 'addresses', 'addr-1'));

      await assertSucceeds(batch.commit());
    });

    it('D4. Subscription creation succeeds with verified address mirror and meal-plan options', async () => {
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', CUST_D), {
          id: CUST_D,
          role: 'customer',
          creditBalance: 0,
          addresses: [{ id: 'addr-d1', line1: '100 Mysore Rd', pincode: '570001', zoneId: 'zone-1' }],
          addressIds: ['addr-d1'],
          defaultAddressId: 'addr-d1',
        });
        await setDoc(doc(db, 'users', CUST_D, 'addresses', 'addr-d1'), {
          id: 'addr-d1',
          line1: '100 Mysore Rd',
          pincode: '570001',
          zoneId: 'zone-1',
        });
      });

      const db = envNew.authenticatedContext(CUST_D, { role: 'customer' }).firestore();
      await assertSucceeds(
        setDoc(doc(db, 'subscriptions', 'sub-d1'), {
          id: 'sub-d1',
          customerId: CUST_D,
          planId: 'plan-std',
          planTier: 'standard',
          quantity: 1,
          pricePerDaySnapshot: 60,
          pricingMatrixSnapshot: { lunch: 60, dinner: 60, lunch_dinner: 120 },
          deliveryAddressId: 'addr-d1',
          zoneId: 'zone-1',
          mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt-l1' }],
          status: 'pending_payment',
          startDate: '2026-11-10',
          endDate: null,
          billingCycle: 'monthly',
          autoRenew: true,
          depositAmount: 1000,
          latestPaymentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    });

    it('D5. IDOR Protection: Customer B cannot read or write Customer A address or subscription', async () => {
      await envNew.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', CUST_D), {
          id: CUST_D,
          role: 'customer',
          creditBalance: 0,
          addresses: [{ id: 'addr-d1', line1: '100 Mysore Rd', pincode: '570001' }],
          addressIds: ['addr-d1'],
          defaultAddressId: 'addr-d1',
        });
        await setDoc(doc(db, 'users', CUST_D, 'addresses', 'addr-d1'), {
          id: 'addr-d1',
          line1: '100 Mysore Rd',
          pincode: '570001',
        });
        await setDoc(doc(db, 'subscriptions', 'sub-d1'), {
          id: 'sub-d1',
          customerId: CUST_D,
          status: 'pending_payment',
        });
      });

      const dbOther = envNew.authenticatedContext(CUST_OTHER, { role: 'customer' }).firestore();
      await assertFails(getDoc(doc(dbOther, 'users', CUST_D, 'addresses', 'addr-d1')));
      await assertFails(getDoc(doc(dbOther, 'subscriptions', 'sub-d1')));
      await assertFails(deleteDoc(doc(dbOther, 'users', CUST_D, 'addresses', 'addr-d1')));
    });
  });
});
