import { db } from '@/shared/lib/firebase';
import type { UserProfile } from '@/shared/types';
import type { Role } from '@/shared/constants/roles';
import { BaseRepository, createConverter } from './BaseRepository';

import {
  collection,
  query,
  where,
  limit,
  startAfter,
  getDocs,
  doc,
  runTransaction,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

class UserRepository extends BaseRepository<UserProfile> {
  constructor() {
    super(db, 'users', createConverter<UserProfile>());
  }

  async getCustomersPaginated(
    pageSize: number,
    lastDocSnap?: QueryDocumentSnapshot<UserProfile>,
  ): Promise<{ customers: UserProfile[]; lastDoc: QueryDocumentSnapshot<UserProfile> | null }> {
    const constraints: QueryConstraint[] = [
      where('role', '==', 'customer'),
      limit(pageSize),
    ];

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const converter = createConverter<UserProfile>();
    const colRef = collection(db, 'users').withConverter(converter);
    const snapshot = await getDocs(query(colRef, ...constraints));

    const customers = snapshot.docs.map((d) => d.data());
    return {
      customers,
      lastDoc:
        snapshot.docs.length === pageSize
          ? (snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<UserProfile>)
          : null,
    };
  }

  async generateNextDisplayId(role: Role, fullName?: string): Promise<string> {
    const counterRef = doc(db, 'settings', 'userCounters');

    if (role === 'customer' && fullName) {
      const firstLetter = fullName.trim().charAt(0).toUpperCase();
      const validLetter = /^[A-Z]$/.test(firstLetter) ? firstLetter : 'U';
      const fieldName = `customer_${validLetter}`;

      return runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 0;

        if (counterDoc.exists()) {
          const data = counterDoc.data();
          if (typeof data[fieldName] === 'number') {
            count = data[fieldName];
          }
        } else {
          transaction.set(counterRef, { [fieldName]: count });
        }

        const newCount = count + 1;
        transaction.set(counterRef, { [fieldName]: newCount }, { merge: true });

        const paddedCount = newCount.toString().padStart(3, '0');
        return `MP-${validLetter}${paddedCount}`;
      });
    }

    const prefixMap: Record<Role, string> = {
      customer: 'CUST',
      admin: 'ADMIN',
      kitchen: 'KTCH',
      delivery_partner: 'DLVY',
      accounts: 'ACCT'
    };
    const prefix = prefixMap[role] || 'USER';
    
    return runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let count = 1000; // Starting number
      
      if (counterDoc.exists()) {
        const data = counterDoc.data();
        if (typeof data[role] === 'number') {
          count = data[role];
        }
      } else {
        // If the settings/userCounters document doesn't exist, create it
        transaction.set(counterRef, { [role]: count });
      }
      
      const newCount = count + 1;
      transaction.set(counterRef, { [role]: newCount }, { merge: true });
      
      return `${prefix}-${newCount}`;
    });
  }
}

/** Singleton — one Firestore collection reference reused across the whole app. */
export const userRepository = new UserRepository();
