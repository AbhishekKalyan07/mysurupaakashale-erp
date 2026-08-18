process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
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
  const users = [
    { email: 'admin@test.com',    password: 'password123', role: 'admin',            fullName: 'Admin User' },
    { email: 'kitchen@test.com',  password: 'password123', role: 'kitchen',          fullName: 'Kitchen User' },
    { email: 'delivery@test.com', password: 'password123', role: 'delivery_partner', fullName: 'Delivery User' },
    { email: 'customer@test.com', password: 'password123', role: 'customer',         fullName: 'Customer User', phone: '9876543210' },
    { email: 'accounts@test.com', password: 'password123', role: 'accounts',         fullName: 'Accounts User' },
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

seedUsers().then(() => {
  console.log('Seed complete.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
