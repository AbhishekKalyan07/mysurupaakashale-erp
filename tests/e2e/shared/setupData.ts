import axios from 'axios';
import * as admin from 'firebase-admin';

const PROJECT_ID = 'demo-test';

// Set emulator host variables so firebase-admin connects to emulators
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Initialize firebase-admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();
const auth = admin.auth();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function clearEmulatorData() {
  console.log('Waiting for emulators to be ready...');
  
  let retries = 5;
  while (retries > 0) {
    try {
      console.log('Clearing Firestore emulator...');
      await axios.delete(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`);
      
      console.log('Clearing Auth emulator...');
      await axios.delete(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`);
      break; // Success
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log('Emulators not ready yet, retrying in 2s...');
      await sleep(2000);
    }
  }
}

export async function seedUsers() {
  const users = [
    { email: 'admin@test.com', password: 'password123', role: 'admin' },
    { email: 'kitchen@test.com', password: 'password123', role: 'kitchen' },
    { email: 'delivery@test.com', password: 'password123', role: 'delivery' },
    { email: 'customer@test.com', password: 'password123', role: 'customer' },
    { email: 'accounts@test.com', password: 'password123', role: 'accounts' }
  ];

  console.log('Seeding users...');
  for (const u of users) {
    try {
      // 1. Create User in Auth
      const userRecord = await auth.createUser({
        email: u.email,
        password: u.password,
      });
      
      // 2. Create User in Firestore (Admin SDK bypasses security rules)
      await db.collection('users').doc(userRecord.uid).set({
        id: userRecord.uid,
        email: u.email,
        role: u.role,
        name: `${u.role.charAt(0).toUpperCase() + u.role.slice(1)} User`,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      if (err.code !== 'auth/email-already-exists') {
        throw err;
      }
    }
  }
}

export async function setupData() {
  await clearEmulatorData();
  await seedUsers();
  console.log('Emulator data reset and seeded successfully.');
}
