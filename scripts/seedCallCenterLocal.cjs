process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT_ID = 'demo-test';

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const auth = getAuth();

async function main() {
  console.log('Seeding comprehensive Call-Center test data into Firebase Emulator...');

  const testPass = 'local-emulator-pass';
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

  // 1. Ensure Admin User
  let adminUid;
  try {
    const rec = await auth.getUserByEmail('admin@test.com');
    adminUid = rec.uid;
    await auth.updateUser(adminUid, { password: testPass });
  } catch {
    const rec = await auth.createUser({
      email: 'admin@test.com',
      password: testPass,
      displayName: 'Admin Manager',
    });
    adminUid = rec.uid;
  }
  await db.collection('users').doc(adminUid).set({
    id: adminUid,
    email: 'admin@test.com',
    role: 'admin',
    fullName: 'Admin Manager',
    displayId: 'ADM-001',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // 2. Ensure Customer User
  let custUid;
  try {
    const rec = await auth.getUserByEmail('customer@test.com');
    custUid = rec.uid;
    await auth.updateUser(custUid, { password: testPass });
  } catch {
    const rec = await auth.createUser({
      email: 'customer@test.com',
      password: testPass,
      displayName: 'Ramesh Kumar',
    });
    custUid = rec.uid;
  }
  const customerAddress = {
    id: 'addr-1',
    label: 'Home',
    line1: '124 5th Main, Saraswathipuram',
    city: 'Mysuru',
    pincode: '570009',
    isDefault: true,
  };
  await db.collection('users').doc(custUid).set({
    id: custUid,
    email: 'customer@test.com',
    role: 'customer',
    fullName: 'Ramesh Kumar',
    phone: '9876543210',
    displayId: 'MP-C001',
    isActive: true,
    addresses: [customerAddress],
    defaultAddressId: 'addr-1',
    zoneId: 'zone-1',
    deliveryPartnerId: 'dp-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // 3. Ensure Delivery Zones
  await db.collection('delivery_zones').doc('zone-1').set({
    id: 'zone-1',
    name: 'Saraswathipuram & Gokulam',
    pincodes: ['570001', '570002', '570009'],
    kitchenId: 'kitchen-central',
    isActive: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });

  // 4. Ensure Meal Plan
  await db.collection('mealPlans').doc('plan-1').set({
    id: 'plan-1',
    name: 'Standard Daily Thali',
    tier: 'standard',
    description: 'Fresh wholesome vegetarian meals',
    pricePerDay: 140,
    isActive: true,
    currency: 'INR',
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: [{ id: 'opt_b1', label: 'Idli Sambar Vada', items: ['2 Idlis', '1 Vada', 'Sambar', 'Chutney'] }]
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          { id: 'opt_l1', label: 'South Indian Thali', items: ['Rice', 'Sambar', 'Rasam', 'Palya', 'Curd'] },
          { id: 'opt_l2', label: 'North Indian Thali', items: ['3 Phulkas', 'Dal Tadka', 'Paneer Sabzi', 'Jeera Rice'] },
        ]
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          { id: 'opt_d1', label: 'Light Dinner', items: ['3 Whole Wheat Phulkas', 'Mixed Veg Curry', 'Dal'] },
          { id: 'opt_d2', label: 'Khichdi & Kadhi', items: ['Moong Dal Khichdi', 'Gujarati Kadhi', 'Papad'] },
        ]
      }
    ],
    pricingMatrix: {
      breakfast: 40,
      lunch: 60,
      dinner: 60,
      breakfast_lunch: 95,
      lunch_dinner: 115,
      breakfast_dinner: 95,
      breakfast_lunch_dinner: 140,
    }
  }, { merge: true });

  // 5. Ensure Active Subscription
  const subId = 'sub-callcenter-1';
  await db.collection('subscriptions').doc(subId).set({
    id: subId,
    customerId: custUid,
    planId: 'plan-1',
    planTier: 'standard',
    status: 'active',
    startDate: '2026-09-01',
    endDate: '2026-10-31',
    billingCycle: 'monthly',
    autoRenew: true,
    quantity: 1,
    deliveryAddressId: 'addr-1',
    zoneId: 'zone-1',
    pricePerDaySnapshot: 140,
    depositAmount: 1000,
    pricingMatrixSnapshot: {
      breakfast: 40,
      lunch: 60,
      dinner: 60,
      breakfast_lunch: 95,
      lunch_dinner: 115,
      breakfast_dinner: 95,
      breakfast_lunch_dinner: 140,
    },
    mealPreferences: [
      { mealType: 'breakfast', selectedOptionId: 'opt_b1' },
      { mealType: 'lunch', selectedOptionId: 'opt_l1' },
      { mealType: 'dinner', selectedOptionId: 'opt_d1' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // 6. Ensure Orders for Today
  const scheduledOrders = [
    {
      id: `ord_${subId}_${todayStr}_breakfast`,
      subscriptionId: subId,
      customerId: custUid,
      date: todayStr,
      mealType: 'breakfast',
      status: 'scheduled',
      kitchenStatus: 'scheduled',
      price: 40,
      selectedOptionId: 'opt_b1',
      mealName: 'Idli Sambar Vada',
      itemsLabel: 'Standard - Breakfast (Idli Sambar Vada)',
      source: 'subscription',
      currency: 'INR',
      zoneId: 'zone-1',
      isAddon: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: `ord_${subId}_${todayStr}_lunch`,
      subscriptionId: subId,
      customerId: custUid,
      date: todayStr,
      mealType: 'lunch',
      status: 'scheduled',
      kitchenStatus: 'scheduled',
      price: 60,
      selectedOptionId: 'opt_l1',
      mealName: 'South Indian Thali',
      itemsLabel: 'Standard - Lunch (South Indian Thali)',
      source: 'subscription',
      currency: 'INR',
      zoneId: 'zone-1',
      isAddon: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: `ord_${subId}_${todayStr}_dinner`,
      subscriptionId: subId,
      customerId: custUid,
      date: todayStr,
      mealType: 'dinner',
      status: 'scheduled',
      kitchenStatus: 'scheduled',
      price: 60,
      selectedOptionId: 'opt_d1',
      mealName: 'Light Dinner',
      itemsLabel: 'Standard - Dinner (Light Dinner)',
      source: 'subscription',
      currency: 'INR',
      zoneId: 'zone-1',
      isAddon: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const o of scheduledOrders) {
    await db.collection('orders').doc(o.id).set(o, { merge: true });
  }

  // 7. Ensure Invoice for customer
  const invId = `inv_${subId}_2026-09`;
  await db.collection('invoices').doc(invId).set({
    id: invId,
    invoiceNumber: 'INV-2026-09-001',
    customerId: custUid,
    subscriptionId: subId,
    billingPeriodStart: '2026-09-01',
    billingPeriodEnd: '2026-09-30',
    subtotal: 4200,
    totalAmount: 4200,
    currency: 'INR',
    status: 'issued',
    createdAt: new Date().toISOString(),
    lineItems: [
      { description: 'Standard Monthly Plan (Sep 2026)', quantity: 1, unitPrice: 4200, amount: 4200 },
    ],
  }, { merge: true });

  console.log('✅ Call-Center test data successfully populated into emulator!');
  console.log('Admin login: admin@test.com / local-emulator-pass');
  console.log('Customer login: customer@test.com / local-emulator-pass');
  console.log(`Customer: Ramesh Kumar (ID: ${custUid})`);
  console.log(`Subscription: ${subId} (status: active, autoRenew: true)`);
  console.log(`Today's Meals seeded: Breakfast (₹40), Lunch (₹60), Dinner (₹60)`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
