import {
  serverTimestamp,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { BaseRepository, createConverter } from "./BaseRepository";
import { auditRepository } from "./auditRepository";
import type { Addon, CreateAddonInput, UpdateAddonInput } from "@/shared/types";

export const INITIAL_ADDONS: Addon[] = [
  {
    id: "addon_vada",
    name: "Medu Vada (1 pc)",
    price: 25,
    unitPrice: 25,
    applicableMealTypes: ["breakfast"],
    validMealSlots: ["breakfast"],
    isActive: true,
    description: "Crispy fried medu vada with coconut chutney & sambar",
  },
  {
    id: "addon_kesaribath",
    name: "Kesari Bath",
    price: 30,
    unitPrice: 30,
    applicableMealTypes: ["breakfast"],
    validMealSlots: ["breakfast"],
    isActive: true,
    description: "Traditional semolina sweet prepared with pure ghee and dry fruits",
  },
  {
    id: "addon_paneer",
    name: "Paneer Add-on",
    price: 40,
    unitPrice: 40,
    applicableMealTypes: ["lunch", "dinner"],
    validMealSlots: ["lunch", "dinner"],
    isActive: true,
    description: "Rich cottage cheese paneer gravy curry",
  },
  {
    id: "addon_curd",
    name: "Curd / Buttermilk",
    price: 20,
    unitPrice: 20,
    applicableMealTypes: ["lunch", "dinner"],
    validMealSlots: ["lunch", "dinner"],
    isActive: true,
    description: "Fresh homestyle churned curd / spiced buttermilk",
  },
  {
    id: "addon_sweet",
    name: "Gulab Jamun (2 pcs)",
    price: 35,
    unitPrice: 35,
    applicableMealTypes: ["lunch", "dinner"],
    validMealSlots: ["lunch", "dinner"],
    isActive: true,
    description: "Warm soft gulab jamuns in fragrant cardamom syrup",
  },
  {
    id: "addon_chapati",
    name: "Extra Chapati (2 pcs)",
    price: 25,
    unitPrice: 25,
    applicableMealTypes: ["lunch", "dinner"],
    validMealSlots: ["lunch", "dinner"],
    isActive: true,
    description: "Freshly made hot whole wheat phulkas / chapatis",
  },
];

export class AddonRepository extends BaseRepository<Addon> {
  private static cachedAddons: Addon[] = [...INITIAL_ADDONS];

  constructor() {
    super(db, "addons", createConverter<Addon>());
  }

  static getInMemoryCache(): Addon[] {
    return [...AddonRepository.cachedAddons];
  }

  static setInMemoryCache(addons: Addon[]) {
    AddonRepository.cachedAddons = [...addons];
  }

  seedMemoryCache(addons: Addon[]) {
    AddonRepository.cachedAddons = [...addons];
  }

  /**
   * List all add-ons from Firestore, synchronizing to in-memory cache.
   * If Firestore collection is empty, automatically provisions the baseline add-ons.
   */
  async listAll(): Promise<Addon[]> {
    try {
      const snap = await getDocs(this.collectionRef);
      if (!snap.empty) {
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            unitPrice: data.price ?? data.unitPrice ?? 0,
            validMealSlots: data.applicableMealTypes ?? data.validMealSlots ?? [],
          };
        });
        AddonRepository.cachedAddons = items;
        return items;
      }

      // Provision initial catalog if completely empty in Firestore
      await this.provisionBaselineCatalog();
      return AddonRepository.cachedAddons;
    } catch {
      // In-memory fallback
      return AddonRepository.cachedAddons;
    }
  }

  /**
   * Provisions initial catalog items into Firestore safely if not already present.
   */
  async provisionBaselineCatalog(): Promise<void> {
    try {
      for (const addon of INITIAL_ADDONS) {
        const docRef = doc(this.collectionRef, addon.id);
        await setDoc(docRef, {
          ...addon,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      AddonRepository.cachedAddons = [...INITIAL_ADDONS];
    } catch (err) {
      console.warn("[AddonRepository] Failed to provision baseline catalog:", err);
    }
  }

  async getById(id: string): Promise<Addon | null> {
    try {
      const item = await super.getById(id);
      if (item) {
        return {
          ...item,
          unitPrice: item.price ?? item.unitPrice ?? 0,
          validMealSlots: item.applicableMealTypes ?? item.validMealSlots ?? [],
        };
      }
    } catch {
      // Fallback to cache
    }
    return AddonRepository.cachedAddons.find((a) => a.id === id) || null;
  }

  /**
   * Create an add-on item in the authoritative catalog.
   */
  async createAddon(
    input: CreateAddonInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<Addon> {
    if (!input.name || !input.name.trim()) {
      throw new Error("Add-on name is required.");
    }
    if (typeof input.price !== "number" || input.price <= 0) {
      throw new Error("Add-on price must be a positive number.");
    }
    const mealSlots = input.applicableMealTypes || (input as any).mealTypes;
    if (!mealSlots || mealSlots.length === 0) {
      throw new Error("At least one meal slot must be selected.");
    }
    const validMealTypes = ["breakfast", "lunch", "dinner"];
    const invalidTypes = mealSlots.filter((m: string) => !validMealTypes.includes(m));
    if (invalidTypes.length > 0) {
      throw new Error(`Invalid meal types: ${invalidTypes.join(", ")}`);
    }

    const cleanSlug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const addonId = `addon_${cleanSlug || Date.now()}`;

    const newAddon: Addon = {
      id: addonId,
      name: input.name.trim(),
      price: input.price,
      unitPrice: input.price,
      applicableMealTypes: [...mealSlots],
      validMealSlots: [...mealSlots],
      isActive: input.isActive !== undefined ? input.isActive : true,
      description: input.description?.trim() || "",
      createdBy: actorId || "admin",
      updatedBy: actorId || "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(this.collectionRef, addonId);
    await setDoc(docRef, newAddon);

    // Update in-memory cache
    const existingIndex = AddonRepository.cachedAddons.findIndex((a) => a.id === addonId);
    if (existingIndex >= 0) {
      AddonRepository.cachedAddons[existingIndex] = newAddon;
    } else {
      AddonRepository.cachedAddons.push(newAddon);
    }

    // Audit log
    await auditRepository.logAction(
      "addon_created",
      actorId || "admin",
      actorRole,
      actorName,
      addonId,
      "addon",
      {
        addonId,
        name: newAddon.name,
        price: newAddon.price,
        applicableMealTypes: newAddon.applicableMealTypes,
        isActive: newAddon.isActive,
      },
    );

    return newAddon;
  }

  /**
   * Update an existing add-on item in the authoritative catalog.
   */
  async updateAddon(
    id: string,
    updates: UpdateAddonInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<Addon> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Add-on ${id} not found.`);
    }

    if (updates.price !== undefined && (typeof updates.price !== "number" || updates.price <= 0)) {
      throw new Error("Add-on price must be a positive number.");
    }
    const mealSlots = updates.applicableMealTypes || (updates as any).mealTypes;
    if (mealSlots !== undefined) {
      if (mealSlots.length === 0) {
        throw new Error("At least one meal slot must be selected.");
      }
      const validMealTypes = ["breakfast", "lunch", "dinner"];
      const invalidTypes = mealSlots.filter((m: string) => !validMealTypes.includes(m));
      if (invalidTypes.length > 0) {
        throw new Error(`Invalid meal types: ${invalidTypes.join(", ")}`);
      }
    }

    const payload: Partial<Addon> = {
      updatedAt: serverTimestamp(),
      updatedBy: actorId || "admin",
    };

    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.price !== undefined) {
      payload.price = updates.price;
      payload.unitPrice = updates.price;
    }
    if (mealSlots !== undefined) {
      payload.applicableMealTypes = [...mealSlots];
      payload.validMealSlots = [...mealSlots];
    }
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.isActive !== undefined) payload.isActive = updates.isActive;

    const docRef = doc(this.collectionRef, id);
    await updateDoc(docRef, payload);

    // Update in-memory cache
    const updatedRecord: Addon = {
      ...existing,
      ...payload,
      id,
      price: payload.price ?? existing.price,
      unitPrice: payload.price ?? existing.price,
      applicableMealTypes: payload.applicableMealTypes ?? existing.applicableMealTypes,
      validMealSlots: payload.applicableMealTypes ?? existing.validMealSlots,
      isActive: payload.isActive !== undefined ? payload.isActive : existing.isActive,
    };

    const cacheIndex = AddonRepository.cachedAddons.findIndex((a) => a.id === id);
    if (cacheIndex >= 0) {
      AddonRepository.cachedAddons[cacheIndex] = updatedRecord;
    } else {
      AddonRepository.cachedAddons.push(updatedRecord);
    }

    // Determine audit action
    let action = "addon_updated";
    if (updates.isActive !== undefined && updates.isActive !== existing.isActive) {
      action = updates.isActive ? "addon_enabled" : "addon_disabled";
    }

    await auditRepository.logAction(
      action,
      actorId || "admin",
      actorRole,
      actorName,
      id,
      "addon",
      {
        addonId: id,
        previousValues: {
          name: existing.name,
          price: existing.price,
          applicableMealTypes: existing.applicableMealTypes,
          isActive: existing.isActive,
        },
        newValues: {
          name: updatedRecord.name,
          price: updatedRecord.price,
          applicableMealTypes: updatedRecord.applicableMealTypes,
          isActive: updatedRecord.isActive,
        },
      },
    );

    return updatedRecord;
  }

  /**
   * Enable or disable an add-on item.
   */
  async toggleStatus(
    id: string,
    isActive: boolean,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<Addon> {
    return await this.updateAddon(id, { isActive }, actorId, actorRole, actorName);
  }
}

export const addonRepository = new AddonRepository();
