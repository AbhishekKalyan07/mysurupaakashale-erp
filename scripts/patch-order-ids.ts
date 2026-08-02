import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// IMPORTANT: Requires a service account key at scripts/serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
});

const db = getFirestore();

async function run() {
  const snapshot = await db.collection('orders').get();
  const batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.displayId) {
      const newDisplayId = `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      batch.update(doc.ref, { displayId: newDisplayId });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully patched ${count} orders with a displayId!`);
  } else {
    console.log('No orders needed patching.');
  }
}

run().catch(console.error);
