import type { MealType } from "./mealPlan.types";

export interface Addon {
  id: string;
  name: string;
  price: number;
  unitPrice: number;
  applicableMealTypes: MealType[];
  validMealSlots: MealType[];
  isActive: boolean;
  description?: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

export type AddonItem = Addon;

export interface CreateAddonInput {
  name: string;
  price: number;
  applicableMealTypes?: MealType[];
  mealTypes?: MealType[];
  description?: string;
  isActive?: boolean;
}

export interface UpdateAddonInput {
  name?: string;
  price?: number;
  applicableMealTypes?: MealType[];
  mealTypes?: MealType[];
  description?: string;
  isActive?: boolean;
}
