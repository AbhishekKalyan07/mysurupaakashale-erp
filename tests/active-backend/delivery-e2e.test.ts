import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from '@firebase/firestore';

const withFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withFirestoreEmulator('Delivery Operations E2E Integration', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mysuru-paakashale-delivery-test',
      firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    // Seed initial state
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const today = '2026-07-31';

      await Promise.all([
        setDoc(doc(db, 'users', 'admin'), { id: 'admin', role: 'admin' }),
        setDoc(doc(db, 'users', 'kitchen'), { id: 'kitchen', role: 'kitchen' }),
        setDoc(doc(db, 'users', 'driver1'), { id: 'driver1', role: 'delivery_partner' }),
        setDoc(doc(db, 'users', 'driver2'), { id: 'driver2', role: 'delivery_partner' }),
        setDoc(doc(db, 'users', 'customer1'), { id: 'customer1', role: 'customer' }),
        
        // Orders for driver1
        setDoc(doc(db, 'orders', 'order1'), { date: today, customerId: 'customer1', deliveryPartnerId: 'driver1', status: 'scheduled' }),
        setDoc(doc(db, 'orders', 'order2'), { date: today, customerId: 'customer2', deliveryPartnerId: 'driver1', status: 'scheduled' }),
        
        // Order for driver2
        setDoc(doc(db, 'orders', 'order3'), { date: today, customerId: 'customer3', deliveryPartnerId: 'driver2', status: 'scheduled' }),
        
        // Unassigned order
        setDoc(doc(db, 'orders', 'order4'), { date: today, customerId: 'customer4', deliveryPartnerId: null, status: 'scheduled' }),

        // Initial Day States
        setDoc(doc(db, 'dailyProductionStates', today), { id: today, status: 'open' }),
        setDoc(doc(db, 'dailyDeliveryStates', today), { id: today, status: 'open' })
      ]);
    });
  });

  afterAll(async () => environment.cleanup());

  describe('Kitchen Lifecycle', () => {
    it('Kitchen can advance scheduled -> preparing -> ready_for_pickup', async () => {
      const kitchen = environment.authenticatedContext('kitchen').firestore();
      
      // Preparing
      await assertSucceeds(updateDoc(doc(kitchen, 'orders', 'order1'), { status: 'preparing' }));
      // Ready for pickup
      await assertSucceeds(updateDoc(doc(kitchen, 'orders', 'order1'), { status: 'ready_for_pickup' }));
    });
  });

  describe('Security Rules & State Transitions', () => {
    it('Admin can lock production', async () => {
      const admin = environment.authenticatedContext('admin').firestore();
      await assertSucceeds(updateDoc(doc(admin, 'dailyProductionStates', '2026-07-31'), { status: 'locked' }));
    });

    it('Kitchen cannot update after Production Lock', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'dailyProductionStates', '2026-07-31'), { status: 'locked' });
      });

      const kitchen = environment.authenticatedContext('kitchen').firestore();
      await assertFails(updateDoc(doc(kitchen, 'orders', 'order1'), { status: 'preparing' }));
    });

    it('Drivers cannot skip delivery states', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'orders', 'order1'), { status: 'ready_for_pickup' });
      });

      const driver = environment.authenticatedContext('driver1').firestore();
      // Skip picked_up -> fail
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { status: 'out_for_delivery' }));
      // Skip out_for_delivery -> fail
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { status: 'delivered' }));
      // Valid transition -> succeed
      await assertSucceeds(updateDoc(doc(driver, 'orders', 'order1'), { status: 'picked_up' }));
    });

    it('Drivers can update only assigned orders', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'orders', 'order1'), { status: 'ready_for_pickup' });
        await updateDoc(doc(context.firestore(), 'orders', 'order3'), { status: 'ready_for_pickup' }); // Assigned to driver2
      });

      const driver1 = environment.authenticatedContext('driver1').firestore();
      
      // Own order -> succeed
      await assertSucceeds(updateDoc(doc(driver1, 'orders', 'order1'), { status: 'picked_up' }));
      
      // Other driver's order -> fail
      await assertFails(updateDoc(doc(driver1, 'orders', 'order3'), { status: 'picked_up' }));
    });

    it('Drivers cannot modify customer information, pricing, or subscriptions', async () => {
      const driver = environment.authenticatedContext('driver1').firestore();
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { customerId: 'hacked' }));
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { price: 0 }));
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { planTier: 'premium' }));
    });
  });

  describe('Delivery Workflow & Idempotency', () => {
    it('Valid terminal transitions', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'orders', 'order1'), { status: 'out_for_delivery' });
        await updateDoc(doc(context.firestore(), 'orders', 'order2'), { status: 'out_for_delivery' });
        await updateDoc(doc(context.firestore(), 'orders', 'order3'), { status: 'out_for_delivery' });
      });

      const driver1 = environment.authenticatedContext('driver1').firestore();
      const driver2 = environment.authenticatedContext('driver2').firestore();

      await assertSucceeds(updateDoc(doc(driver1, 'orders', 'order1'), { status: 'delivered' }));
      await assertSucceeds(updateDoc(doc(driver1, 'orders', 'order2'), { status: 'failed_delivery', deliveryResult: { reasonCode: 'no_answer' } }));
      await assertSucceeds(updateDoc(doc(driver2, 'orders', 'order3'), { status: 'returned_delivery', deliveryResult: { reasonCode: 'refused' } }));
    });

    it('Admin can close dispatch and blocks further delivery updates', async () => {
      const admin = environment.authenticatedContext('admin').firestore();
      const driver = environment.authenticatedContext('driver1').firestore();
      const today = '2026-07-31';

      await environment.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'orders', 'order1'), { status: 'ready_for_pickup' });
      });

      // Valid before close
      await assertSucceeds(updateDoc(doc(driver, 'orders', 'order1'), { status: 'picked_up' }));

      // Admin closes dispatch
      await assertSucceeds(updateDoc(doc(admin, 'dailyProductionStates', today), { status: 'closed' }));

      // Invalid after close
      await assertFails(updateDoc(doc(driver, 'orders', 'order1'), { status: 'out_for_delivery' }));
    });
  });

  describe('Driver Sessions (Domain Logic)', () => {
    // Note: Since these tests run purely against firestore rules, the app-level logic 
    // for metrics and driver sessions operates client-side via dailyDeliveryRepository.
    // We mock that behavior here to verify rule constraints on the driverSessions collection.
    
    it('Driver can create/update own session', async () => {
      const driver = environment.authenticatedContext('driver1').firestore();
      await assertSucceeds(setDoc(doc(driver, 'dailyDeliveryStates', '2026-07-31', 'driverSessions', 'driver1'), { status: 'picked_up' }));
    });

    it('Driver cannot update another driver session', async () => {
      const driver = environment.authenticatedContext('driver1').firestore();
      await assertFails(setDoc(doc(driver, 'dailyDeliveryStates', '2026-07-31', 'driverSessions', 'driver2'), { status: 'picked_up' }));
    });
  });

});
