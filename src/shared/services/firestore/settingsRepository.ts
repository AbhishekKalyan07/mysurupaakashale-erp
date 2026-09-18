import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import type { BusinessSettings } from "@/shared/types";
import { BaseRepository, createConverter } from "./BaseRepository";

class SettingsRepository extends BaseRepository<BusinessSettings> {
  constructor() {
    super(db, "settings", createConverter<BusinessSettings>());
  }

  async getBusinessSettings(): Promise<BusinessSettings | null> {
    const docRef = doc(db, "settings", "business");
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as BusinessSettings) : null;
  }

  async saveBusinessSettings(data: Partial<BusinessSettings>): Promise<void> {
    const docRef = doc(db, "settings", "business");
    await setDoc(docRef, { ...data, id: "business" }, { merge: true });
  }
}

export const settingsRepository = new SettingsRepository();
