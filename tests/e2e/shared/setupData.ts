import axios from 'axios';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'demo-test';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function clearEmulatorData() {
  console.log('Waiting for emulators to be ready...');
  
  let retries = 10;
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
  console.log('Running seed script...');
  execSync(`node "${path.join(__dirname, 'seed.cjs')}"`, { stdio: 'inherit' });
}

/**
 * Signs in a user via the Firebase Auth Emulator REST API and returns
 * the raw token response (idToken, refreshToken, localId, etc.).
 * This is used to inject real Firebase credentials into Playwright contexts
 * since Playwright's storageState only captures cookies + localStorage,
 * not IndexedDB where the Firebase SDK normally persists auth tokens.
 */
export async function signInViaEmulator(email: string, password: string) {
  const url = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
  const response = await axios.post(url, {
    email,
    password,
    returnSecureToken: true,
  });
  return response.data as {
    idToken: string;
    refreshToken: string;
    localId: string;
    email: string;
    expiresIn: string;
  };
}

export async function setupData() {
  await clearEmulatorData();
  await seedUsers();
  console.log('Emulator data reset and seeded successfully.');
}
