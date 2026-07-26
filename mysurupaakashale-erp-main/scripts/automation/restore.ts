import { authenticateForAutomation } from './auth';
import { db } from '@/shared/lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';

/**
 * Script to restore a Firebase Firestore backup JSON.
 * Usage: npx vite-node scripts/automation/restore.ts path/to/backup.json
 */
async function runRestore() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx vite-node scripts/automation/restore.ts <path-to-backup.json>');
    process.exit(1);
  }

  try {
    console.log('--- Starting Database Restore ---');
    await authenticateForAutomation();

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`Loaded backup with ${Object.keys(data).length} collections.`);

    for (const [collectionName, documents] of Object.entries(data)) {
      const docs = documents as any[];
      console.log(`Restoring ${docs.length} documents to collection: ${collectionName}`);
      
      const BATCH_SIZE = 400;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batchDocs = docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        
        batchDocs.forEach(docData => {
          const id = docData.id;
          if (!id) return;
          const ref = doc(db, collectionName, id);
          const { id: _, ...rest } = docData; // remove id from data
          batch.set(ref, rest);
        });
        
        await batch.commit();
        console.log(`  Committed batch ${i / BATCH_SIZE + 1}`);
      }
    }

    console.log('--- Database Restore Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Database Restore Failed:', error);
    process.exit(1);
  }
}

runRestore();
