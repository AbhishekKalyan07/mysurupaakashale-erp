import { db } from '@/shared/lib/firebase';
import type { UserProfile } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';

class UserRepository extends BaseRepository<UserProfile> {
  constructor() {
    super(db, 'users', createConverter<UserProfile>());
  }
}

/** Singleton — one Firestore collection reference reused across the whole app. */
export const userRepository = new UserRepository();
