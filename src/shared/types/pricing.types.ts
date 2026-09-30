import type { Timestamp } from "./common.types";
import type { MealPlanPricing } from "./mealPlan.types";

export interface StandardPricingStructure {
  meals: {
    breakfast: number;
    lunch: number;
    dinner: number;
  };
  combos: {
    lunch_dinner: number;
    all_three: number;
    breakfast_lunch?: number;
    breakfast_dinner?: number;
  };
}

export type BasePricingMatrix = MealPlanPricing;

export type PricingConfigStatus = "active" | "scheduled" | "archived" | "draft";

export interface PricingConfiguration {
  id: string;
  name?: string;
  scope?: string; // e.g. "general" | "basic" | "regular"
  pricing: {
    standard: StandardPricingStructure;
    [key: string]: any;
  } | MealPlanPricing;
  effectiveFrom: string; // YYYY-MM-DD (Asia/Kolkata calendar date)
  effectiveTo?: string | null; // YYYY-MM-DD (Asia/Kolkata calendar date) or null for ongoing
  status: PricingConfigStatus;
  note?: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  createdBy: string;
  updatedBy: string;
}
