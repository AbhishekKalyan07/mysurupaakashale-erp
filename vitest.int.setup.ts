import { vi } from 'vitest';

// Unmock all firebase modules since we want to connect to the real emulators
vi.unmock('firebase/app');
vi.unmock('firebase/auth');
vi.unmock('firebase/firestore');
vi.unmock('firebase/storage');

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

process.env.VITE_USE_FIREBASE_EMULATORS = 'true';
process.env.VITE_FIREBASE_PROJECT_ID = 'demo-test';
process.env.VITE_FIREBASE_API_KEY = 'demo-key';

// Removed afterEach database clear because it wipes the database concurrently
// while other tests (like Cloud Functions) are still running.
// Individual test files should clear their own isolated databases (e.g., using env.clearFirestore())

// ---- Emulator host handling -------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
try {
  // Attempt to locate firebase.json relative to the project root (process.cwd())
  let firebaseJsonPath = path.resolve(process.cwd(), 'firebase.json');
  let config;
  try {
    config = JSON.parse(readFileSync(firebaseJsonPath, 'utf-8'));
  } catch (_e) {
    // Fallback to directory of this file if not found in cwd
    firebaseJsonPath = path.resolve(__dirname, 'firebase.json');
    config = JSON.parse(readFileSync(firebaseJsonPath, 'utf-8'));
  }
  const port = config?.emulators?.firestore?.port;
  const firestoreHost = port ? `127.0.0.1:${port}` : '127.0.0.1:8085';
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  console.warn('[vitest.int.setup] FIRESTORE_EMULATOR_HOST set to', firestoreHost);
  console.log('DIAG: FIRESTORE_EMULATOR_HOST =', process.env.FIRESTORE_EMULATOR_HOST);
  console.log('DIAG: FIREBASE_AUTH_EMULATOR_HOST =', process.env.FIREBASE_AUTH_EMULATOR_HOST);
  console.log('DIAG: GCLOUD_PROJECT =', process.env.GCLOUD_PROJECT);
  console.log('DIAG: FIREBASE_PROJECT_ID =', process.env.FIREBASE_PROJECT_ID);
} catch (e) {
  console.warn('Failed to set FIRESTORE_EMULATOR_HOST from firebase.json', e);
}

