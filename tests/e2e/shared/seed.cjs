process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT_ID = 'demo-test';

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const auth = getAuth();

async function seedUsers() {
  const testPass = process.env.TEST_USER_PASSWORD || 'local-emulator-pass';
  const users = [
    { email: 'admin@test.com',    password: testPass, role: 'admin',            fullName: 'Admin User' },
    { email: 'kitchen@test.com',  password: testPass, role: 'kitchen',          fullName: 'Kitchen User' },
    { email: 'delivery@test.com', password: testPass, role: 'delivery_partner', fullName: 'Delivery User' },
    { email: 'customer@test.com', password: testPass, role: 'customer',         fullName: 'Customer User', phone: '9876543210' },
    { email: 'accounts@test.com', password: testPass, role: 'accounts',         fullName: 'Accounts User' },
  ];

  console.log('Seeding users via external node script...');
  for (const u of users) {
    let uid;
    console.log('Creating user:', u.email);
    try {
      const userRecord = await auth.createUser({
        email: u.email,
        password: u.password,
        displayName: u.fullName,
      });
      uid = userRecord.uid;
      console.log('User created with uid:', uid);
    } catch (err) {
      console.log('Error creating user:', u.email, err.code);
      if (err.code === 'auth/email-already-exists') {
        const existingUser = await auth.getUserByEmail(u.email);
        uid = existingUser.uid;
        await auth.updateUser(uid, { password: u.password });
      } else {
        throw err;
      }
    }

    if (uid) {
      await db.collection('users').doc(uid).set({
        id:          uid,
        email:       u.email,
        role:        u.role,
        fullName:    u.fullName,
        ...(u.phone ? { phone: u.phone } : {}),
        displayId:   `TEST-${u.role.toUpperCase().replace('_', '')}-001`,
        isActive:    true,
        addresses:   [],
        defaultAddressId: null,
        photoUrl:    null,
        googleConnected:  false,
        passwordCreated:  true,
        emailVerified:    false,
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      });
    }
  }
}

async function seedOrders() {
  const customerEmail = 'customer@test.com';
  const customerUser = await auth.getUserByEmail(customerEmail);
  const uid = customerUser.uid;

  // Calculate today's date in Asia/Kolkata
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);

  // Seed plan-1 with options
  await db.collection('mealPlans').doc('plan-1').set({
    id: 'plan-1',
    name: 'Standard Plan',
    tier: 'regular',
    description: 'Standard plan with daily meals',
    pricePerDay: 300,
    isActive: true,
    currency: 'INR',
    mealSlots: [
      {
        mealType: 'breakfast',
        isCustomerSelectable: false,
        options: []
      },
      {
        mealType: 'lunch',
        isCustomerSelectable: true,
        options: [
          { id: 'lunch-opt-1', label: 'Lunch Option 1', items: ['Thali', 'Rice'] },
          { id: 'lunch-opt-2', label: 'Lunch Option 2', items: ['Roti', 'Curry'] }
        ]
      },
      {
        mealType: 'dinner',
        isCustomerSelectable: true,
        options: [
          { id: 'dinner-opt-1', label: 'Dinner Option 1', items: ['Phulka', 'Sabzi'] },
          { id: 'dinner-opt-2', label: 'Dinner Option 2', items: ['Khichdi', 'Kadhi'] }
        ]
      }
    ],
    pricingMatrix: { breakfast: 100, lunch: 100, dinner: 100 }
  });

  // Seed kitchen and delivery zone for operational order generation
  await db.collection('kitchens').doc('kitchen-1').set({
    id: 'kitchen-1',
    name: 'Main Kitchen',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await db.collection('deliveryZones').doc('zone-1').set({
    id: 'zone-1',
    name: 'Central Zone',
    kitchenId: 'kitchen-1',
    pincodes: ['570001'],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const subId = 'sub-e2e-1';
  // Seed an active subscription
  await db.collection('subscriptions').doc(subId).set({
    id: subId,
    customerId: uid,
    planId: 'plan-1',
    status: 'active',
    startDate: todayStr,
    endDate: '2099-12-31',
    zoneId: 'zone-1',
    kitchenId: 'kitchen-1',
    mealPreferences: [
      { mealType: 'breakfast', selectedOptionId: null },
      { mealType: 'lunch', selectedOptionId: 'lunch-opt-1' },
      { mealType: 'dinner', selectedOptionId: 'dinner-opt-1' }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pricePerDaySnapshot: 300,
    pricingMatrixSnapshot: { breakfast: 100, lunch: 100, dinner: 100 }
  });

  // Seed a negotiated pricing subscription
  const subNegotiatedId = 'sub-e2e-neg';
  await db.collection('subscriptions').doc(subNegotiatedId).set({
    id: subNegotiatedId,
    customerId: uid,
    planId: 'plan-1',
    status: 'active',
    startDate: todayStr,
    endDate: '2099-12-31',
    zoneId: 'zone-1',
    kitchenId: 'kitchen-1',
    mealPreferences: [{ mealType: 'breakfast' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pricePerDaySnapshot: 300,
    pricingMatrixSnapshot: { breakfast: 100, lunch: 100, dinner: 100 },
    negotiatedPricing: { breakfast: 85 } // negotiated price
  });

  // Seed today's orders
  const orders = [
    {
      id: `ord_${subId}_${todayStr}_dinner`,
      subscriptionId: subId,
      customerId: uid,
      date: todayStr,
      mealType: 'dinner',
      status: 'scheduled',
      kitchenStatus: 'scheduled',
      price: 100,
      selectedOptionId: 'dinner-opt-1',
      mealName: 'Dinner Option 1',
      itemsLabel: 'Subscription - dinner (Dinner Option 1)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: `ord_${subNegotiatedId}_${todayStr}_breakfast`,
      subscriptionId: subNegotiatedId,
      customerId: uid,
      date: todayStr,
      mealType: 'breakfast',
      status: 'scheduled',
      price: 85,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  for (const o of orders) {
    await db.collection('orders').doc(o.id).set(o);
  }
  console.log('Orders and subscriptions seeded.');
}

seedUsers().then(seedOrders).then(() => {
  console.log('Seed complete.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
