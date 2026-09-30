import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import type {
  MealPlan,
  MealType,
  CreateMealPlanInput,
  UpdateMealPlanInput,
  CreateMealOptionInput,
  UpdateMealOptionInput,
} from "@/shared/types/mealPlan.types";
import { BaseRepository, createConverter } from "./BaseRepository";
import { auditRepository } from "./auditRepository";

export const INITIAL_MEAL_PLANS: MealPlan[] = [
  {
    id: "basic-plan",
    tier: "basic",
    name: "Basic Plan",
    description: "Including 3 times food with 3 times separate delivery.",
    pricePerDay: 159,
    pricingMatrix: {
      breakfast: 60,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 115,
      lunch_dinner: 115,
      breakfast_dinner: 115,
      breakfast_lunch_dinner: 159,
    },
    currency: "INR",
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 1,
    createdAt: null as any,
    updatedAt: null as any,
    mealSlots: [
      {
        mealType: "breakfast",
        isCustomerSelectable: false,
        options: [
          {
            id: "basic-breakfast-1",
            label: "As Per Breakfast Menu",
            items: ["Breakfast Menu Item"],
            isActive: true,
            isCustomerSelectable: false,
          },
        ],
      },
      {
        mealType: "lunch",
        isCustomerSelectable: true,
        options: [
          {
            id: "basic-lunch-1",
            label: "Rice & Sambar",
            items: ["Pickle", "Rice", "Sambar"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "basic-lunch-2",
            label: "Ragi Ball",
            items: ["1 Ragi Ball", "Sambar", "Buttermilk"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "basic-lunch-3",
            label: "Chapati & Sagu",
            items: ["3 Chapati", "Sagu", "Buttermilk"],
            isActive: true,
            isCustomerSelectable: true,
          },
        ],
      },
      {
        mealType: "dinner",
        isCustomerSelectable: true,
        options: [
          {
            id: "basic-dinner-1",
            label: "Rice & Sambar",
            items: ["Rice", "Sambar", "Palya"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "basic-dinner-2",
            label: "Ragi Ball",
            items: ["1 Ragi Ball", "Sambar", "Palya"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "basic-dinner-3",
            label: "Chapati & Palya",
            items: ["3 Chapati", "Palya"],
            isActive: true,
            isCustomerSelectable: true,
          },
        ],
      },
    ],
  },
  {
    id: "regular-plan",
    tier: "regular",
    name: "Regular Plan",
    description: "Including 3 times food with 3 times separate delivery.",
    pricePerDay: 210,
    pricingMatrix: {
      breakfast: 60,
      lunch: 85,
      dinner: 85,
      breakfast_lunch: 140,
      lunch_dinner: 140,
      breakfast_dinner: 140,
      breakfast_lunch_dinner: 210,
    },
    currency: "INR",
    deliveryIncluded: true,
    isActive: true,
    sortOrder: 2,
    createdAt: null as any,
    updatedAt: null as any,
    mealSlots: [
      {
        mealType: "breakfast",
        isCustomerSelectable: false,
        options: [
          {
            id: "regular-breakfast-1",
            label: "As Per Breakfast Menu",
            items: ["Breakfast Menu Item"],
            isActive: true,
            isCustomerSelectable: false,
          },
        ],
      },
      {
        mealType: "lunch",
        isCustomerSelectable: true,
        options: [
          {
            id: "regular-lunch-1",
            label: "Ragi Ball Meal",
            items: ["Pickle", "Rice", "Sambar", "1 Ragi Ball", "Buttermilk"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "regular-lunch-2",
            label: "Chapati Meal",
            items: ["Pickle", "Rice", "Sambar", "1 Chapati", "Sagu/Palya", "Buttermilk"],
            isActive: true,
            isCustomerSelectable: true,
          },
        ],
      },
      {
        mealType: "dinner",
        isCustomerSelectable: true,
        options: [
          {
            id: "regular-dinner-1",
            label: "Chapati Meal",
            items: ["Rice", "Sambar", "1 Chapati", "Palya", "Curd"],
            isActive: true,
            isCustomerSelectable: true,
          },
          {
            id: "regular-dinner-2",
            label: "Ragi Ball Meal",
            items: ["Rice", "Sambar", "1 Ragi Ball", "Curd"],
            isActive: true,
            isCustomerSelectable: true,
          },
        ],
      },
    ],
  },
];

export class MealPlanRepository extends BaseRepository<MealPlan> {
  private static cachedPlans: MealPlan[] = [...INITIAL_MEAL_PLANS];

  constructor() {
    super(db, "mealPlans", createConverter<MealPlan>());
  }

  static getInMemoryCache(): MealPlan[] {
    return [...MealPlanRepository.cachedPlans];
  }

  static setInMemoryCache(plans: MealPlan[]) {
    MealPlanRepository.cachedPlans = [...plans];
  }

  seedMemoryCache(plans: MealPlan[]) {
    MealPlanRepository.cachedPlans = [...plans];
  }

  /**
   * List all meal plans from Firestore, synchronizing to in-memory cache.
   * If Firestore collection is completely empty, automatically provisions baseline plans.
   */
  async listAll(includeInactive: boolean = false): Promise<MealPlan[]> {
    try {
      const snap = await getDocs(this.collectionRef);
      if (!snap.empty) {
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
          };
        });
        MealPlanRepository.cachedPlans = items;
        const sorted = [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        return includeInactive ? sorted : sorted.filter((p) => p.isActive !== false);
      }

      // Provision initial catalog if completely empty in Firestore
      await this.provisionBaselinePlans();
      const cached = [...MealPlanRepository.cachedPlans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      return includeInactive ? cached : cached.filter((p) => p.isActive !== false);
    } catch {
      // In-memory fallback
      const cached = [...MealPlanRepository.cachedPlans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      return includeInactive ? cached : cached.filter((p) => p.isActive !== false);
    }
  }

  /**
   * Provisions initial plans into Firestore safely if not already present.
   */
  async provisionBaselinePlans(): Promise<void> {
    try {
      for (const plan of INITIAL_MEAL_PLANS) {
        const docRef = doc(this.collectionRef, plan.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          await setDoc(docRef, {
            ...plan,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      MealPlanRepository.cachedPlans = [...INITIAL_MEAL_PLANS];
    } catch (err) {
      console.warn("[MealPlanRepository] Failed to provision baseline plans:", err);
    }
  }

  async getById(id: string): Promise<MealPlan | null> {
    try {
      const item = await super.getById(id);
      if (item) return item;
    } catch {
      // Fallback to cache
    }
    return (
      MealPlanRepository.cachedPlans.find(
        (p) => p.id === id || (id === "plan-1" && p.id === "basic-plan"),
      ) || null
    );
  }

  /**
   * Create a new MealPlan in the authoritative catalog.
   */
  async createPlan(
    input: CreateMealPlanInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal plans.");
    }
    if (!input.name || !input.name.trim()) {
      throw new Error("Plan name is required.");
    }
    if (typeof input.pricePerDay !== "number" || input.pricePerDay <= 0) {
      throw new Error("Plan price per day must be a positive number.");
    }

    const cleanSlug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const planId = cleanSlug ? `plan-${cleanSlug}` : `plan-${Date.now()}`;

    // Standard default meal slots if none provided
    const mealSlots = input.mealSlots && input.mealSlots.length > 0
      ? input.mealSlots
      : [
          {
            mealType: "breakfast" as MealType,
            isCustomerSelectable: false,
            options: [
              {
                id: `${planId}-breakfast-1`,
                label: "As Per Breakfast Menu",
                items: ["Breakfast Menu Item"],
                isActive: true,
                isCustomerSelectable: false,
              },
            ],
          },
          {
            mealType: "lunch" as MealType,
            isCustomerSelectable: true,
            options: [
              {
                id: `${planId}-lunch-1`,
                label: "Standard Lunch",
                items: ["Rice", "Sambar", "Palya"],
                isActive: true,
                isCustomerSelectable: true,
              },
            ],
          },
          {
            mealType: "dinner" as MealType,
            isCustomerSelectable: true,
            options: [
              {
                id: `${planId}-dinner-1`,
                label: "Standard Dinner",
                items: ["Chapati", "Sagu", "Curd"],
                isActive: true,
                isCustomerSelectable: true,
              },
            ],
          },
        ];

    // Enforce breakfast rule: breakfast must always remain non-selectable
    const sanitizedSlots = mealSlots.map((slot) => {
      if (slot.mealType === "breakfast") {
        return {
          ...slot,
          isCustomerSelectable: false,
          options: (slot.options || []).map((o) => ({
            ...o,
            isCustomerSelectable: false,
          })),
        };
      }
      return slot;
    });

    const newPlan: MealPlan = {
      id: planId,
      tier: input.tier || "basic",
      name: input.name.trim(),
      description: input.description?.trim() || "",
      pricePerDay: input.pricePerDay,
      pricingMatrix: input.pricingMatrix || {
        breakfast: Math.round(input.pricePerDay * 0.3),
        lunch: Math.round(input.pricePerDay * 0.35),
        dinner: Math.round(input.pricePerDay * 0.35),
        breakfast_lunch: Math.round(input.pricePerDay * 0.65),
        lunch_dinner: Math.round(input.pricePerDay * 0.7),
        breakfast_dinner: Math.round(input.pricePerDay * 0.65),
        breakfast_lunch_dinner: input.pricePerDay,
      },
      currency: "INR",
      deliveryIncluded: input.deliveryIncluded !== false,
      isActive: input.isActive !== false,
      sortOrder: input.sortOrder || (MealPlanRepository.cachedPlans.length + 1),
      mealSlots: sanitizedSlots,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };

    const docRef = doc(this.collectionRef, planId);
    await setDoc(docRef, newPlan);

    // Update in-memory cache
    const existingIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === planId);
    if (existingIndex >= 0) {
      MealPlanRepository.cachedPlans[existingIndex] = newPlan;
    } else {
      MealPlanRepository.cachedPlans.push(newPlan);
    }

    // Audit log
    await auditRepository.logAction(
      "meal_plan_created",
      actorId || "admin",
      actorRole,
      actorName,
      planId,
      "meal_plan",
      {
        planId,
        name: newPlan.name,
        tier: newPlan.tier,
        pricePerDay: newPlan.pricePerDay,
        isActive: newPlan.isActive,
      },
    );

    return newPlan;
  }

  /**
   * Update an existing MealPlan metadata in the authoritative catalog.
   */
  async updatePlan(
    id: string,
    updates: UpdateMealPlanInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal plans.");
    }
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Meal plan ${id} not found.`);
    }

    if (updates.pricePerDay !== undefined && (typeof updates.pricePerDay !== "number" || updates.pricePerDay <= 0)) {
      throw new Error("Plan price per day must be a positive number.");
    }

    const payload: Partial<MealPlan> = {
      updatedAt: serverTimestamp() as any,
    };

    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.tier !== undefined) payload.tier = updates.tier;
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.pricePerDay !== undefined) payload.pricePerDay = updates.pricePerDay;
    if (updates.pricingMatrix !== undefined) payload.pricingMatrix = updates.pricingMatrix;
    if (updates.deliveryIncluded !== undefined) payload.deliveryIncluded = updates.deliveryIncluded;
    if (updates.isActive !== undefined) payload.isActive = updates.isActive;
    if (updates.sortOrder !== undefined) payload.sortOrder = updates.sortOrder;

    if (updates.mealSlots !== undefined) {
      payload.mealSlots = updates.mealSlots.map((slot) => {
        if (slot.mealType === "breakfast") {
          return {
            ...slot,
            isCustomerSelectable: false,
            options: (slot.options || []).map((o) => ({
              ...o,
              isCustomerSelectable: false,
            })),
          };
        }
        return slot;
      });
    }

    const docRef = doc(this.collectionRef, id);
    await updateDoc(docRef, payload);

    const updatedRecord: MealPlan = {
      ...existing,
      ...payload,
      id,
    };

    const cacheIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === id);
    if (cacheIndex >= 0) {
      MealPlanRepository.cachedPlans[cacheIndex] = updatedRecord;
    } else {
      MealPlanRepository.cachedPlans.push(updatedRecord);
    }

    await auditRepository.logAction(
      "meal_plan_updated",
      actorId || "admin",
      actorRole,
      actorName,
      id,
      "meal_plan",
      {
        planId: id,
        previous: {
          name: existing.name,
          pricePerDay: existing.pricePerDay,
          isActive: existing.isActive,
        },
        updated: payload,
      },
    );

    return updatedRecord;
  }

  /**
   * Toggle active/inactive status of a MealPlan.
   */
  async togglePlanStatus(
    id: string,
    isActive: boolean,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal plans.");
    }
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Meal plan ${id} not found.`);
    }

    const docRef = doc(this.collectionRef, id);
    await updateDoc(docRef, {
      isActive,
      updatedAt: serverTimestamp(),
    });

    const updatedRecord: MealPlan = {
      ...existing,
      isActive,
    };

    const cacheIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === id);
    if (cacheIndex >= 0) {
      MealPlanRepository.cachedPlans[cacheIndex] = updatedRecord;
    }

    const action = isActive ? "meal_plan_enabled" : "meal_plan_disabled";
    await auditRepository.logAction(
      action,
      actorId || "admin",
      actorRole,
      actorName,
      id,
      "meal_plan",
      {
        planId: id,
        isActive,
      },
    );

    return updatedRecord;
  }

  /**
   * Add a new meal option to an existing plan and meal slot.
   */
  async addMealOption(
    planId: string,
    mealType: MealType,
    input: CreateMealOptionInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal options.");
    }
    if (mealType === "breakfast" && input.isCustomerSelectable === true) {
      throw new Error("Breakfast options cannot be made customer-selectable.");
    }
    const plan = await this.getById(planId);
    if (!plan) {
      throw new Error(`Meal plan ${planId} not found.`);
    }

    if (!input.label || !input.label.trim()) {
      throw new Error("Option label is required.");
    }

    // Breakfast rule enforcement
    const isCustomerSelectable =
      mealType === "breakfast"
        ? false
        : input.isCustomerSelectable !== undefined
          ? input.isCustomerSelectable
          : true;

    const cleanSlug = input.label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const optionId = `${planId}-${mealType}-${cleanSlug || Date.now()}`;

    const newOption = {
      id: optionId,
      label: input.label.trim(),
      items: input.items && input.items.length > 0 ? input.items : [input.label.trim()],
      description: input.description?.trim() || "",
      isActive: input.isActive !== false,
      isCustomerSelectable,
    };

    const updatedSlots = (plan.mealSlots || []).map((slot) => {
      if (slot.mealType === mealType) {
        return {
          ...slot,
          options: [...(slot.options || []), newOption],
        };
      }
      return slot;
    });

    // If slot didn't exist, append it
    if (!updatedSlots.some((s) => s.mealType === mealType)) {
      updatedSlots.push({
        mealType,
        isCustomerSelectable: mealType !== "breakfast",
        options: [newOption],
      });
    }

    const docRef = doc(this.collectionRef, planId);
    await updateDoc(docRef, {
      mealSlots: updatedSlots,
      updatedAt: serverTimestamp(),
    });

    const updatedPlan: MealPlan = {
      ...plan,
      mealSlots: updatedSlots,
    };

    const cacheIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === planId);
    if (cacheIndex >= 0) {
      MealPlanRepository.cachedPlans[cacheIndex] = updatedPlan;
    }

    await auditRepository.logAction(
      "meal_option_created",
      actorId || "admin",
      actorRole,
      actorName,
      optionId,
      "meal_option",
      {
        planId,
        mealType,
        optionId,
        label: newOption.label,
        items: newOption.items,
        isActive: newOption.isActive,
        isCustomerSelectable: newOption.isCustomerSelectable,
      },
    );

    return updatedPlan;
  }

  /**
   * Update an existing meal option in a plan.
   */
  async updateMealOption(
    planId: string,
    mealType: MealType,
    optionId: string,
    updates: UpdateMealOptionInput,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal options.");
    }
    if (mealType === "breakfast" && updates.isCustomerSelectable === true) {
      throw new Error("Breakfast options cannot be made customer-selectable.");
    }
    const plan = await this.getById(planId);
    if (!plan) {
      throw new Error(`Meal plan ${planId} not found.`);
    }

    const slot = (plan.mealSlots || []).find((s) => s.mealType === mealType);
    if (!slot) {
      throw new Error(`Slot ${mealType} not found in plan ${planId}.`);
    }

    const option = (slot.options || []).find((o) => o.id === optionId);
    if (!option) {
      throw new Error(`Option ${optionId} not found in plan ${planId} for ${mealType}.`);
    }

    const isCustomerSelectable =
      mealType === "breakfast"
        ? false
        : updates.isCustomerSelectable !== undefined
          ? updates.isCustomerSelectable
          : option.isCustomerSelectable;

    const updatedOptions = slot.options.map((o) => {
      if (o.id === optionId) {
        return {
          ...o,
          label: updates.label !== undefined ? updates.label.trim() : o.label,
          items: updates.items !== undefined ? updates.items : o.items,
          description: updates.description !== undefined ? updates.description.trim() : o.description,
          isActive: updates.isActive !== undefined ? updates.isActive : o.isActive,
          isCustomerSelectable,
        };
      }
      return o;
    });

    const updatedSlots = plan.mealSlots.map((s) => {
      if (s.mealType === mealType) {
        return {
          ...s,
          options: updatedOptions,
        };
      }
      return s;
    });

    const docRef = doc(this.collectionRef, planId);
    await updateDoc(docRef, {
      mealSlots: updatedSlots,
      updatedAt: serverTimestamp(),
    });

    const updatedPlan: MealPlan = {
      ...plan,
      mealSlots: updatedSlots,
    };

    const cacheIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === planId);
    if (cacheIndex >= 0) {
      MealPlanRepository.cachedPlans[cacheIndex] = updatedPlan;
    }

    await auditRepository.logAction(
      "meal_option_updated",
      actorId || "admin",
      actorRole,
      actorName,
      optionId,
      "meal_option",
      {
        planId,
        mealType,
        optionId,
        updates,
      },
    );

    return updatedPlan;
  }

  /**
   * Toggle active/inactive status of a specific meal option.
   */
  async toggleMealOptionStatus(
    planId: string,
    mealType: MealType,
    optionId: string,
    isActive: boolean,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal options.");
    }
    const plan = await this.getById(planId);
    if (!plan) {
      throw new Error(`Meal plan ${planId} not found.`);
    }

    const slot = (plan.mealSlots || []).find((s) => s.mealType === mealType);
    if (!slot) {
      throw new Error(`Slot ${mealType} not found in plan ${planId}.`);
    }

    const option = (slot.options || []).find((o) => o.id === optionId);
    if (!option) {
      throw new Error(`Option ${optionId} not found in plan ${planId} for ${mealType}.`);
    }

    const updatedOptions = slot.options.map((o) => {
      if (o.id === optionId) {
        return {
          ...o,
          isActive,
        };
      }
      return o;
    });

    const updatedSlots = plan.mealSlots.map((s) => {
      if (s.mealType === mealType) {
        return {
          ...s,
          options: updatedOptions,
        };
      }
      return s;
    });

    const docRef = doc(this.collectionRef, planId);
    await updateDoc(docRef, {
      mealSlots: updatedSlots,
      updatedAt: serverTimestamp(),
    });

    const updatedPlan: MealPlan = {
      ...plan,
      mealSlots: updatedSlots,
    };

    const cacheIndex = MealPlanRepository.cachedPlans.findIndex((p) => p.id === planId);
    if (cacheIndex >= 0) {
      MealPlanRepository.cachedPlans[cacheIndex] = updatedPlan;
    }

    const action = isActive ? "meal_option_enabled" : "meal_option_disabled";
    await auditRepository.logAction(
      action,
      actorId || "admin",
      actorRole,
      actorName,
      optionId,
      "meal_option",
      {
        planId,
        mealType,
        optionId,
        isActive,
      },
    );

    return updatedPlan;
  }

  /**
   * Toggle customerSelectable of a specific meal option (lunch/dinner only).
   */
  async toggleMealOptionSelectable(
    planId: string,
    mealType: MealType,
    optionId: string,
    isCustomerSelectable: boolean,
    actorId?: string,
    actorRole: string = "admin",
    actorName: string = "Admin",
  ): Promise<MealPlan> {
    if (actorRole !== "admin") {
      throw new Error("Unauthorized: Only admin can modify meal options.");
    }
    if (mealType === "breakfast") {
      throw new Error("Breakfast options cannot be made customer-selectable (DailyMenu rotating rule).");
    }

    return this.updateMealOption(
      planId,
      mealType,
      optionId,
      { isCustomerSelectable },
      actorId,
      actorRole,
      actorName,
    );
  }
}

export const mealPlanRepository = new MealPlanRepository();
