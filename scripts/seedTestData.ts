import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getAuth } from 'firebase-admin/auth';

// Ensure emulator env vars are set
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

dotenv.config({ path: path.resolve(import.meta.dirname, '../.env.local') });

if (!getApps().length) {
  initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'mysuru-paakashale-erp' });
}

const db = getFirestore();
const auth = getAuth();

async function seedTestData() {
  console.log('Seeding Test Data...');

  try {
    // 1. Ensure test customer exists
    const userRecord = await auth.getUserByEmail('customer@mysuru.com').catch(() => null);
    if (!userRecord) {
      console.log('Test customer not found. Please run seedTestUsers.ts first.');
      process.exit(1);
    }
    
    const customerId = userRecord.uid;

    // 2. Create a Mock Plan if it doesn't exist
    const plansSnap = await db.collection('meal_plans').limit(1).get();
    let planId = 'test-plan-1';
    let planTier = 'basic';
    if (plansSnap.empty) {
      console.log('No plans found, creating a mock plan...');
      await db.collection('meal_plans').doc(planId).set({
        name: 'Basic Test Plan',
        tier: 'basic',
        pricePerDay: 159,
        pricingMatrix: {
          breakfast: 60,
          lunch: 65,
          dinner: 65,
          breakfast_lunch: 115,
          lunch_dinner: 115,
          breakfast_dinner: 115,
          breakfast_lunch_dinner: 159,
        },
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } else {
      planId = plansSnap.docs[0].id;
      planTier = plansSnap.docs[0].data().tier || 'basic';
    }

    // 3. Create an active Subscription for the test customer
    const subscriptionId = 'test-sub-1';
    const subRef = db.collection('subscriptions').doc(subscriptionId);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 2); // Started 2 days ago
    
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 28); // Ends in 28 days

    await subRef.set({
      customerId: customerId,
      customerName: 'Test Customer',
      planId: planId,
      planTier: planTier,
      quantity: 1,
      pricePerDaySnapshot: 159,
      pricingMatrixSnapshot: {
        breakfast: 60,
        lunch: 65,
        dinner: 65,
        breakfast_lunch: 115,
        lunch_dinner: 115,
        breakfast_dinner: 115,
        breakfast_lunch_dinner: 159,
      },
      mealPreferences: [
        { mealType: 'breakfast', selectedOptionId: null },
        { mealType: 'lunch', selectedOptionId: 'lunch-opt-1' },
      ],
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      billingCycle: 'monthly',
      autoRenew: true,
      status: 'active',
      depositAmount: 1000,
      deliveryAddressId: 'addr-1',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log(`Created test subscription for customer: ${customerId}`);

    // 4. Create an active Order for today
    const orderId = `ord_${subscriptionId}_${new Date().toISOString().split('T')[0]}_lunch`;
    await db.collection('orders').doc(orderId).set({
      subscriptionId: subscriptionId,
      customerId: customerId,
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      displayId: 'MP-T001',
      date: new Date().toISOString().split('T')[0],
      mealType: 'lunch',
      mealName: 'Test Lunch Meal',
      kitchenId: 'test-kitchen',
      deliveryPartnerId: null,
      status: 'scheduled',
      kitchenStatus: 'pending',
      price: 65,
      deliveryWindow: { start: '12:30', end: '13:30' },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log(`Created test order for today: ${orderId}`);
    
    console.log('Done seeding test data!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedTestData();
