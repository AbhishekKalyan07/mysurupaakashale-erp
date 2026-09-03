import type { ID, Timestamp } from './common.types';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

/** Extensible on purpose — new tiers can be added without a schema change. */
export type PlanTier = 'basic' | 'regular' | (string & {});

/**
 * One selectable composition for a given plan + meal slot, e.g. for
 * Basic-plan lunch: "Rice, Sambar, Pickle" or "Ragi ball, Sambar, Buttermilk".
 * Kept as a labelled bundle (not decomposed into a recipe/ingredient graph) —
 * that's the right level of detail for subscriptions and Kitchen prep lists;
 * ingredient-level costing would be a deliberate later extension, not this one.
 */
export interface MealOption {
  id: string;
  label: string;
  items: string[]; // e.g. ["Rice", "Sambar", "Pickle"] — shown as a bullet list in the UI
}

export interface MealSlotConfig {
  mealType: MealType;
  /** false for breakfast: it follows the day's rotating DailyMenu instead of a customer pick. */
  isCustomerSelectable: boolean;
  options: MealOption[];
}

export interface MealPlanPricing {
  breakfast: number;
  lunch: number;
  dinner: number;
  breakfast_lunch: number;
  lunch_dinner: number;
  breakfast_dinner: number;
  breakfast_lunch_dinner: number;
}

/**
 * Firestore: `mealPlans/{planId}`.
 * Publicly readable (no auth) so prospective customers can browse pricing
 * before signing up — see firestore.rules. Admin-writable only.
 */
export interface MealPlan {
  id: ID;
  tier: PlanTier;
  name: string;
  description: string;
  pricePerDay: number; // Legacy total bundle price (INR)
  pricingMatrix?: MealPlanPricing; // Exact combination pricing (INR)
  currency: 'INR';
  mealSlots: MealSlotConfig[];
  deliveryIncluded: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PublishStatus = 'draft' | 'published' | 'archived';

export interface MealMenu {
  name: string;
  items: string[];
  description: string;
  isAvailable: boolean;
}

/**
 * Firestore: `dailyMenus/{menuId}`.
 * The daily menu offering for a specific date. 
 * Managed by Kitchen or Admin.
 */
export interface DailyMenu {
  id: ID; // Auto-generated ID
  date: string; // YYYY-MM-DD
  status: PublishStatus;
  breakfast: MealMenu;
  lunch: MealMenu;
  dinner: MealMenu;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null;
  publishedBy: ID | null;
}
