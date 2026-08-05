import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccountPath) });
}

const db = getFirestore();

async function clearMealPlans() {
  console.log('Clearing meal plans...');
  const snapshot = await db.collection('mealPlans').get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log('Deleted ' + snapshot.size + ' meal plans.');
}

clearMealPlans().catch(console.error);
