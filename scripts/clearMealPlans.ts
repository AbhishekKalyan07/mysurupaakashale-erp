// scripts/clearMealPlans.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deletes every document in the mealPlans collection.
// ONLY runs against the local Firebase Emulator (blocked by enforceEmulatorGuard).
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as dotenv from 'dotenv';

// 1. Load .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// 2. Point at local emulators before the guard check
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// 3. Guard – blocks immediately if not targeting a safe emulator environment
import { enforceEmulatorGuard } from '../src/shared/lib/environmentGuard.node';
enforceEmulatorGuard();

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test',
  });
}

const db = getFirestore();

async function clearMealPlans() {
  console.log('Clearing meal plans...');
  const snapshot = await db.collection('mealPlans').get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log('Deleted ' + snapshot.size + ' meal plans.');
}

clearMealPlans().catch(console.error);
