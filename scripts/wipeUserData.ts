import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

import * as dotenv from 'dotenv';

// Load env variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const useEmulators = process.env.VITE_USE_FIREBASE_EMULATORS === 'true';
if (useEmulators) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  console.log('🔌 Running in EMULATOR mode. Pointing to local Firestore (8080) and Auth (9099) emulators.');
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test';
const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (!getApps().length) {
  if (useEmulators) {
    initializeApp({ projectId });
    console.log(`Initialized Firebase Admin for Emulator Suite (Project: ${projectId})`);
  } else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({
      credential: cert(serviceAccount),
      projectId
    });
    console.log(`Initialized Firebase Admin using serviceAccountKey.json for project: ${projectId}`);
  } else {
    // Fallback to Application Default Credentials with Project ID
    initializeApp({
      projectId
    });
    console.log(`Initialized Firebase Admin using Application Default Credentials for project: ${projectId}`);
  }
}

const db = getFirestore();
const auth = getAuth();

// Helper class to manage Firestore batch deletes (max 500 operations per batch)
class BatchWriter {
  private db: any;
  private batch: any;
  private count: number;

  constructor(db: any) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
  }

  async delete(ref: any) {
    this.batch.delete(ref);
    this.count++;
    if (this.count >= 500) {
      await this.commit();
    }
  }

  async commit() {
    if (this.count > 0) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
    }
  }
}

async function deleteCollectionWithSubcollections(
  collectionName: string,
  subcollections: string[] = []
) {
  console.log(`Checking collection: '${collectionName}'...`);
  const colRef = db.collection(collectionName);
  const snapshot = await colRef.get();
  
  if (snapshot.empty) {
    console.log(`Collection '${collectionName}' is empty.`);
    return;
  }

  console.log(`Clearing collection '${collectionName}' (${snapshot.size} parent documents)...`);
  const batchWriter = new BatchWriter(db);
  let parentCount = 0;
  let subCount = 0;

  for (const doc of snapshot.docs) {
    // Delete subcollections first
    for (const subcol of subcollections) {
      const subcolRef = doc.ref.collection(subcol);
      const subcolSnap = await subcolRef.get();
      for (const subdoc of subcolSnap.docs) {
        await batchWriter.delete(subdoc.ref);
        subCount++;
      }
    }
    // Delete parent doc
    await batchWriter.delete(doc.ref);
    parentCount++;
  }

  await batchWriter.commit();
  console.log(`Successfully deleted ${parentCount} parent docs and ${subCount} subcollection docs in '${collectionName}'.`);
}

async function deleteAllAuthUsers() {
  console.log('Fetching Firebase Auth users...');
  let nextPageToken: string | undefined = undefined;
  let totalDeleted = 0;

  do {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    const uids = listUsersResult.users.map((user) => user.uid);
    if (uids.length > 0) {
      await auth.deleteUsers(uids);
      totalDeleted += uids.length;
      console.log(`Deleted batch of ${uids.length} auth users...`);
    }
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);

  console.log(`Total Firebase Auth users deleted: ${totalDeleted}`);
}

async function resetUserCounters() {
  const counterRef = db.collection('settings').doc('userCounters');
  await counterRef.set({});
  console.log("Reset 'settings/userCounters' to empty state.");
}

const collectionsToClear = [
  { name: 'users', subs: ['addresses'] },
  { name: 'userPhones', subs: [] },
  { name: 'subscriptions', subs: ['skips'] },
  { name: 'orders', subs: ['workflowHistory'] },
  { name: 'dailyProductionStates', subs: [] },
  { name: 'dailyMenus', subs: [] },
  { name: 'dailyDeliveryStates', subs: ['driverSessions'] },
  { name: 'payments', subs: [] },
  { name: 'invoices', subs: [] },
  { name: 'auditLogs', subs: [] },
  { name: 'attendance', subs: [] },
  { name: 'analytics', subs: [] },
  { name: 'payroll', subs: [] },
  { name: 'salaryProfiles', subs: [] },
  { name: 'notifications', subs: [] },
  { name: 'leaves', subs: [] },
  { name: 'feedback', subs: [] },
  { name: 'orderGenerationRuns', subs: [] },
  { name: 'deliveries', subs: [] },
];

async function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  console.log('\n======================================================');
  console.log('⚠️  DANGER ZONE: FIREBASE USER AND TRANSACTION DATA WIPE');
  console.log('======================================================');
  console.log('This script will permanently delete:');
  console.log('1. All users in Firebase Authentication');
  console.log('2. Documents in collections: ' + collectionsToClear.map(c => c.name).join(', '));
  console.log('3. All associated subcollections (addresses, skips, workflowHistory, driverSessions)\n');
  console.log('It will NOT delete:');
  console.log('- mealPlans (pricing catalog)');
  console.log('- settings/business (business configuration)');
  console.log('- deliveryZones (defined locations)\n');

  const answer = await askQuestion('Are you sure you want to proceed? Type "WIPE DATA" to confirm: ');
  rl.close();

  if (answer.trim() !== 'WIPE DATA') {
    console.log('Wipe cancelled. No changes made.');
    process.exit(0);
  }

  console.log('\nStarting database wipe...');
  
  try {
    // 1. Clear Firestore collections
    for (const col of collectionsToClear) {
      await deleteCollectionWithSubcollections(col.name, col.subs);
    }

    // 2. Reset counters
    await resetUserCounters();

    // 3. Clear Auth Users
    await deleteAllAuthUsers();

    console.log('\n✅ Database wiped successfully! Ready for client handoff.');
    process.exit(0);
  } catch (error) {
    console.error('Wipe failed with error:', error);
    process.exit(1);
  }
}

run();
