import axios from 'axios';

const PROJECT_ID = 'demo-test';
const FIRESTORE_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_URL = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

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
    // 1. Create User in Auth
    const authRes = await axios.post(`${AUTH_URL}/accounts:signUp?key=fake-api-key`, {
      email: u.email,
      password: u.password,
      returnSecureToken: true
    });
    const uid = authRes.data.localId;

    // We cannot easily set custom claims via REST, so our frontend/backend must be resilient 
    // to reading roles from Firestore for tests, or we just rely on Firestore users collection.

    // 2. Create User in Firestore
    const docData = {
      fields: {
        id: { stringValue: uid },
        email: { stringValue: u.email },
        role: { stringValue: u.role },
        name: { stringValue: `${u.role.charAt(0).toUpperCase() + u.role.slice(1)} User` },
        isActive: { booleanValue: true },
        createdAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };

    await axios.post(`${FIRESTORE_URL}/users?documentId=${uid}`, docData);
  }
}

export async function setupData() {
  await clearEmulatorData();
  await seedUsers();
  console.log('Emulator data reset and seeded successfully.');
}
