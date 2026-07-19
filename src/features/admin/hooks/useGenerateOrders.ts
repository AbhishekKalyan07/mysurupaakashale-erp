import { useState } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Subscription } from '@/shared/types';
import toast from 'react-hot-toast';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';

export function useGenerateOrders() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateOrders = async () => {
    setIsGenerating(true);
    try {
      const today = getTodayIST();
      
      // 1. Fetch active subscriptions
      const subsRef = collection(db, 'subscriptions');
      const q = query(subsRef, where('status', '==', 'active'));
      const snap = await getDocs(q);
      const subscriptions = snap.docs.map(d => d.data() as Subscription);
      
      if (subscriptions.length === 0) {
        toast.error('No active subscriptions found for today.');
        return;
      }
      
      // 2. Generate Orders batch
      const batch = writeBatch(db);
      let count = 0;
      
      for (const sub of subscriptions) {
        for (const pref of sub.mealPreferences) {
          const orderId = crypto.randomUUID();
          batch.set(doc(db, 'orders', orderId), {
            id: orderId,
            customerId: sub.customerId,
            subscriptionId: sub.id,
            date: today,
            mealType: pref.mealType,
            status: 'scheduled',
            planTier: sub.planTier,
            selectedOptionId: pref.selectedOptionId,
            deliveryAddressId: sub.deliveryAddressId,
            zoneId: 'unassigned', // Admin assigns this later
            deliveryPartnerId: null,
            routeSequence: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      }
      
      await batch.commit();
      toast.success(`Successfully generated ${count} orders for ${today}`);
      
    } catch (err: any) {
      console.error('Error generating orders:', err);
      toast.error(err.message || 'Failed to generate orders.');
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateOrders, isGenerating };
}
