import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
});

const db = getFirestore();

async function run() {
  const today = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' in local time
  console.log(`Patching orders for date: ${today}`);
  
  const ordersSnap = await db.collection('orders').where('date', '==', today).where('source', '==', 'subscription').get();
  
  const plansSnap = await db.collection('mealPlans').get();
  const mealPlans = plansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const subsSnap = await db.collection('subscriptions').get();
  const subscriptions = new Map(subsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));

  const batch = db.batch();
  let count = 0;

  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    const sub: any = subscriptions.get(order.subscriptionId);
    
    if (sub) {
      // 1. Fix price
      const price = Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / (sub.mealPreferences?.length || 1));
      
      // 2. Fix itemsLabel
      const pref = sub.mealPreferences?.find((p: any) => p.mealType === order.mealType);
      let optionLabel = '';
      if (pref && pref.selectedOptionId) {
        const plan: any = mealPlans.find((p: any) => p.id === sub.planId);
        if (plan) {
          const slot = plan.mealSlots?.find((s: any) => s.mealType === pref.mealType);
          const option = slot?.options?.find((o: any) => o.id === pref.selectedOptionId);
          if (option) optionLabel = ` (${option.label})`;
        }
      }
      const itemsLabel = `Subscription - ${order.mealType}${optionLabel}`;

      // Only update if different
      if (order.price !== price || order.itemsLabel !== itemsLabel) {
        batch.update(doc.ref, { price, itemsLabel });
        count++;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully patched ${count} orders!`);
  } else {
    console.log('No orders needed patching.');
  }
}

run().catch(console.error);
