// scripts/migrate-customers.ts
// ─────────────────────────────────────────────────────────────────────────────
// Migration script: Normalizes all customer displayIds to continuous format:
// MP-001, MP-002, MP-003...
//
// Key Invariants:
// 1. Deterministic Ordering: Sorted by createdAt ascending, tie-broken by UID ascending.
// 2. Identity Safety: Firebase Auth UID is UNCHANGED. Document path (users/{uid}) is UNCHANGED.
// 3. Document Ownership: All profile fields, addresses, role remain intact.
// 4. Historical Snapshot Preservation: Historical orders, invoices, and payments are NOT
//    rewritten, preserving historical audit snapshots.
// 5. Counter Continuity: settings/userCounters is synchronized to the max migrated customer count,
//    ensuring the next registered customer receives the exact next continuous number.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });
dotenv.config({ path: resolve(__dirname, '../.env') });

export interface CustomerMigrationResult {
  totalCustomers: number;
  migratedCount: number;
  nextCounterValue: number;
  mappings: Array<{
    uid: string;
    fullName: string;
    oldDisplayId: string | null;
    newDisplayId: string;
    createdAt: string;
  }>;
}

/**
 * Normalizes customer display IDs deterministically to MP-001, MP-002, etc.
 * Safe to call against emulator or production Firestore instance.
 */
export async function migrateCustomerDisplayIds(
  db: Firestore
): Promise<CustomerMigrationResult> {
  const usersCollection = db.collection('users');
  const snapshot = await usersCollection.where('role', '==', 'customer').get();

  const totalCustomers = snapshot.size;
  if (totalCustomers === 0) {
    return {
      totalCustomers: 0,
      migratedCount: 0,
      nextCounterValue: 0,
      mappings: [],
    };
  }

  // Parse and sort documents deterministically:
  // Primary sort: createdAt ascending. Secondary sort: doc.id (UID) ascending.
  const customerList = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    let createdAtMs = 0;

    if (data.createdAt) {
      if (typeof data.createdAt.toMillis === 'function') {
        createdAtMs = data.createdAt.toMillis();
      } else if (typeof data.createdAt._seconds === 'number') {
        createdAtMs = data.createdAt._seconds * 1000;
      } else if (typeof data.createdAt === 'string') {
        const parsed = Date.parse(data.createdAt);
        if (!isNaN(parsed)) createdAtMs = parsed;
      } else if (typeof data.createdAt === 'number') {
        createdAtMs = data.createdAt;
      }
    }

    return {
      ref: docSnap.ref,
      id: docSnap.id,
      data,
      createdAtMs,
      createdAtStr: data.createdAt ? String(data.createdAt) : 'none',
    };
  });

  customerList.sort((a, b) => {
    if (a.createdAtMs !== b.createdAtMs) {
      return a.createdAtMs - b.createdAtMs;
    }
    return a.id.localeCompare(b.id);
  });

  const mappings: CustomerMigrationResult['mappings'] = [];
  let currentSequence = 0;

  // Execute migration in chunks using Firestore Batches
  const BATCH_SIZE = 400;
  for (let i = 0; i < customerList.length; i += BATCH_SIZE) {
    const chunk = customerList.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of chunk) {
      currentSequence++;
      const paddedNumber = currentSequence.toString().padStart(3, '0');
      const newDisplayId = `MP-${paddedNumber}`;
      const oldDisplayId = item.data.displayId || null;

      // Update ONLY customer displayId. Do NOT alter uid, ownership, role, addresses, etc.
      batch.update(item.ref, {
        displayId: newDisplayId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      mappings.push({
        uid: item.id,
        fullName: item.data.fullName || 'Unnamed Customer',
        oldDisplayId,
        newDisplayId,
        createdAt: item.createdAtStr,
      });
    }

    await batch.commit();
  }

  // Synchronize settings/userCounters so subsequent customer registrations continue smoothly
  const counterRef = db.collection('settings').doc('userCounters');
  await counterRef.set(
    {
      customer: currentSequence,
    },
    { merge: true }
  );

  return {
    totalCustomers,
    migratedCount: mappings.length,
    nextCounterValue: currentSequence,
    mappings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Execution
// ─────────────────────────────────────────────────────────────────────────────
async function runCli() {
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (!getApps().length) {
    if (isEmulator) {
      console.log(`[Migration] Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
      initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test',
      });
    } else {
      const saPath = resolve(__dirname, '../serviceAccountKey.json');
      if (fs.existsSync(saPath)) {
        console.log(`[Migration] Connecting to Production Firestore using serviceAccountKey.json`);
        const serviceAccount = require(saPath);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        console.error('[Migration] Error: Neither FIRESTORE_EMULATOR_HOST nor serviceAccountKey.json was found.');
        process.exit(1);
      }
    }
  }

  const db = getFirestore();
  console.log('[Migration] Starting customer display ID migration...');
  const result = await migrateCustomerDisplayIds(db);

  console.log(`[Migration] Finished. Inspected: ${result.totalCustomers}, Migrated: ${result.migratedCount}`);
  for (const m of result.mappings) {
    console.log(`  - Customer "${m.fullName}" (UID: ${m.uid}): ${m.oldDisplayId} -> ${m.newDisplayId}`);
  }
  console.log(`[Migration] settings/userCounters.customer set to: ${result.nextCounterValue}`);
  console.log(`[Migration] Next customer created will receive: MP-${(result.nextCounterValue + 1).toString().padStart(3, '0')}`);
}

// Only run CLI if invoked directly
if (process.argv[1] && process.argv[1].includes('migrate-customers')) {
  runCli()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration] Fatal error during migration:', err);
      process.exit(1);
    });
}
