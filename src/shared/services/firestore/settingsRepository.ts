import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { BusinessSettings } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';

class SettingsRepository extends BaseRepository<BusinessSettings> {
  constructor() {
    super(db, 'settings', createConverter<BusinessSettings>());
  }

  async getBusinessSettings(): Promise<BusinessSettings | null> {
    const docRef = doc(db, 'settings', 'business');
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as BusinessSettings) : null;
  }
}

export const settingsRepository = new SettingsRepository();
