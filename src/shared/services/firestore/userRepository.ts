import { db } from '@/shared/lib/firebase';
import type { UserProfile } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
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
}

/** Singleton — one Firestore collection reference reused across the whole app. */
export const userRepository = new UserRepository();
