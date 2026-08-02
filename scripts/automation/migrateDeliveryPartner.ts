/**
 * One-time migration: backfill deliveryPartnerId on existing subscriptions.
 *
 * For each active/paused subscription that has a zoneId but no deliveryPartnerId,
 * finds the first delivery partner whose zoneIds[] includes that zone and saves
 * the match to subscription.deliveryPartnerId.
 *
 * Run once after deploying the permanent delivery partner feature:
 *   npx vite-node scripts/automation/migrateDeliveryPartner.ts
 *
 * Safe to re-run — skips subscriptions that already have a deliveryPartnerId.
 * Delete this script after the migration is complete.
 */
import './env';
import { authenticateForAutomation } from './auth';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { where, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Timestamp } from 'firebase/firestore';

async function migrate() {
  console.log('--- Delivery Partner Migration ---');
  await authenticateForAutomation();

  // 1. Fetch all active + paused subscriptions
  const subscriptions = await subscriptionRepository.list(
    where('status', 'in', ['active', 'paused'])
  );
  console.log(`Found ${subscriptions.length} active/paused subscriptions.`);

  // 2. Fetch all active delivery partners
  const deliveryPartners = await userRepository.list(
    where('role', '==', 'delivery_partner'),
    where('isActive', '==', true)
  );
  console.log(`Found ${deliveryPartners.length} active delivery partners.`);

  // 3. Build zone → partners map
  const zoneToPartners = new Map<string, string[]>();
  for (const dp of deliveryPartners) {
    if (dp.role === 'delivery_partner' && dp.zoneIds) {
      for (const zoneId of dp.zoneIds) {
        const existing = zoneToPartners.get(zoneId) || [];
        existing.push(dp.id);
        zoneToPartners.set(zoneId, existing);
      }
    }
  }

  // 4. Filter subscriptions that need backfill
  const toUpdate = subscriptions.filter(
    (sub) => !sub.deliveryPartnerId && sub.zoneId
  );
  console.log(`${toUpdate.length} subscriptions need backfill (have zoneId but no deliveryPartnerId).`);

  if (toUpdate.length === 0) {
    console.log('Nothing to migrate. Done.');
    process.exit(0);
  }

  // 5. Batch update (max 500 per batch)
  const BATCH_SIZE = 400;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const sub of chunk) {
      try {
        const partners = zoneToPartners.get(sub.zoneId!);
        if (!partners || partners.length === 0) {
          console.log(`  SKIP sub ${sub.id} — no partner covers zone "${sub.zoneId}"`);
          skipped++;
          continue;
        }

        // Pick the first matching partner (same logic as the old order generation)
        const partnerId = partners[0];
        batch.update(doc(db, 'subscriptions', sub.id), {
          deliveryPartnerId: partnerId,
          updatedAt: serverTimestamp() as unknown as Timestamp,
        });
        updated++;
      } catch (e) {
        console.error(`  ERROR processing sub ${sub.id}:`, e);
        errors++;
      }
    }

    try {
      await batch.commit();
      console.log(`  Batch committed: ${Math.min(i + BATCH_SIZE, toUpdate.length)}/${toUpdate.length}`);
    } catch (e) {
      console.error(`  BATCH ERROR:`, e);
      // Increment errors for all items in this batch that we tried to update
      errors += chunk.length - skipped; 
      // Rollback the updated count for this failed batch
      updated -= (chunk.length - skipped);
    }
  }

  console.log(`\n--- Migration Complete ---`);
  console.log(`Subscriptions scanned: ${subscriptions.length}`);
  console.log(`Already assigned: ${subscriptions.length - toUpdate.length}`);
  console.log(`Migrated successfully: ${updated}`);
  console.log(`No matching delivery partner: ${skipped}`);
  console.log(`Errors: ${errors}`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
