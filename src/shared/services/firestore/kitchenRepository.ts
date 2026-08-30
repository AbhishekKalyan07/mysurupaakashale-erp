import { collection, doc, getDoc, getDocs, query, QueryConstraint } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Kitchen } from '@/shared/types/kitchen.types';

export const kitchenRepository = {
  async getById(id: string): Promise<Kitchen | null> {
    const d = await getDoc(doc(db, 'kitchens', id));
    if (!d.exists()) return null;
    return { id: d.id, ...d.data() } as Kitchen;
  },

  async list(...constraints: QueryConstraint[]): Promise<Kitchen[]> {
    const q = query(collection(db, 'kitchens'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Kitchen));
  }
};
