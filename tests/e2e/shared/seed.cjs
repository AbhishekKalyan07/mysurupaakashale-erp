const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const PROJECT_ID = 'demo-test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const auth = getAuth();

async function seedUsers() {
  const users = [
    { email: 'admin@test.com', password: 'password123', role: 'admin' },
    { email: 'kitchen@test.com', password: 'password123', role: 'kitchen' },
    { email: 'delivery@test.com', password: 'password123', role: 'delivery' },
    { email: 'customer@test.com', password: 'password123', role: 'customer' },
    { email: 'accounts@test.com', password: 'password123', role: 'accounts' }
  ];

  console.log('Seeding users via external node script...');
  for (const u of users) {
    try {
      const userRecord = await auth.createUser({
        email: u.email,
        password: u.password,
      });
      
      await db.collection('users').doc(userRecord.uid).set({
        id: userRecord.uid,
        email: u.email,
        role: u.role,
        name: `${u.role.charAt(0).toUpperCase() + u.role.slice(1)} User`,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      if (err.code !== 'auth/email-already-exists') {
        throw err;
      }
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
