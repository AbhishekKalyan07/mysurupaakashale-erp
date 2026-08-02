import './env';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

async function run() {
  await signInWithEmailAndPassword(auth, 'demo-admin@mysurupaakashale.com', 'admin123');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  console.log(`Patching orders for date: ${today}`);
  
  const ordersSnap = await getDocs(query(collection(db, 'orders'), where('date', '==', today), where('source', '==', 'subscription')));
  const plansSnap = await getDocs(collection(db, 'mealPlans'));
  const mealPlans = plansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  const subscriptions = new Map(subsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));

  const batch = writeBatch(db);
  let count = 0;

  for (const docSnap of ordersSnap.docs) {
    const order = docSnap.data();
    const sub: any = subscriptions.get(order.subscriptionId);
    
    if (sub) {
      const price = Math.round((sub.pricePerDaySnapshot * (sub.quantity || 1)) / (sub.mealPreferences?.length || 1));
      
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

      if (order.price !== price || order.itemsLabel !== itemsLabel) {
        batch.update(docSnap.ref, { price, itemsLabel });
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
  process.exit(0);
}

run().catch(console.error);
