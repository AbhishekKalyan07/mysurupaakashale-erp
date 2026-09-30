import type { Subscription, MealType, MealPreference, Addon } from "@/shared/types";
import type { BasePricingMatrix } from "@/shared/types/pricing.types";
import { pricingRepository, PricingRepository } from "../firestore/pricingRepository";
import { addonRepository, AddonRepository, INITIAL_ADDONS } from "../firestore/addonRepository";
import { getTodayIST } from "@/shared/lib/date";

export type AddonItem = Addon;

export const AVAILABLE_ADDONS: AddonItem[] = INITIAL_ADDONS;


export function flattenPricingMatrix(obj: any): Record<string, number> {
  if (!obj) return {};
  const result: Record<string, number> = {};

  const meals = obj.standard?.meals || obj.meals;
  if (meals && typeof meals === "object") {
    for (const [k, v] of Object.entries(meals)) {
      if (typeof v === "number") result[k] = v;
    }
  }

  const combos = obj.standard?.combos || obj.combos;
  if (combos && typeof combos === "object") {
    for (const [k, v] of Object.entries(combos)) {
      if (typeof v === "number") {
        result[k] = v;
        if (k === "all_three") {
          result.breakfast_lunch_dinner = v;
        }
      }
    }
  }

  // Also include direct keys on obj if numbers
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && k !== "id") {
      result[k] = v;
      if (k === "all_three") {
        result.breakfast_lunch_dinner = v;
      }
    }
  }

  return result;
}

export function normalizeBasePricingMatrix(
  p: any,
): BasePricingMatrix {
  const flat = flattenPricingMatrix(p);

  const breakfast = flat.breakfast ?? 60;
  const lunch = flat.lunch ?? 85;
  const dinner = flat.dinner ?? 85;

  const breakfast_lunch = flat.breakfast_lunch ?? breakfast + lunch;
  const lunch_dinner = flat.lunch_dinner ?? lunch + dinner;
  const breakfast_dinner = flat.breakfast_dinner ?? breakfast + dinner;
  const breakfast_lunch_dinner =
    flat.all_three ?? flat.breakfast_lunch_dinner ?? breakfast + lunch + dinner;

  return {
    breakfast,
    lunch,
    dinner,
    breakfast_lunch,
    lunch_dinner,
    breakfast_dinner,
    breakfast_lunch_dinner,
  };
}

/**
 * PricingService provides a single source of truth for pricing matrices and add-ons.
 * Resolves pricing following the canonical precedence rule:
 *   1️⃣ negotiatedPricing (customer-specific custom agreement)
 *   2️⃣ pricingMatrixSnapshot (captured at subscription inception)
 *   3️⃣ effective base pricing (from effective-dated PricingConfiguration for target service date)
 *   4️⃣ FALLBACK_MATRIX (canonical default baseline when unseeded)
 */
class PricingService {
  public static readonly FALLBACK_MATRIX: Record<string, Record<string, number>> = {
    basic: {
      breakfast: 60,
      lunch: 65,
      dinner: 65,
      breakfast_lunch: 115,
      lunch_dinner: 115,
      breakfast_dinner: 115,
      breakfast_lunch_dinner: 159,
    },
    regular: {
      breakfast: 60,
      lunch: 85,
      dinner: 85,
      breakfast_lunch: 140,
      lunch_dinner: 140,
      breakfast_dinner: 140,
      breakfast_lunch_dinner: 210,
    },
  };

  /**
   * Resolves the synchronous effective base pricing for a target date and scope/tier.
   * Checks in-memory cache first, falling back to static FALLBACK_MATRIX.
   */
  resolveSyncBasePricing(targetDate?: string, scope?: string): BasePricingMatrix {
    const date = targetDate || getTodayIST();
    const cache = PricingRepository.getInMemoryCache();
    const targetScope = scope || "general";

    const candidates = cache.filter((c) => {
      const matchScope =
        (c.scope || "general") === targetScope ||
        (c.scope || "general") === "general";
      if (!matchScope) return false;
      return c.effectiveFrom <= date && (!c.effectiveTo || c.effectiveTo >= date);
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const aExact = (a.scope || "general") === targetScope ? 1 : 0;
        const bExact = (b.scope || "general") === targetScope ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        if (a.effectiveFrom !== b.effectiveFrom) {
          return b.effectiveFrom.localeCompare(a.effectiveFrom);
        }
        return (b.id || "").localeCompare(a.id || "");
      });
      return normalizeBasePricingMatrix(candidates[0].pricing);
    }

    const tier =
      (scope as keyof typeof PricingService.FALLBACK_MATRIX) || "regular";
    return normalizeBasePricingMatrix(
      PricingService.FALLBACK_MATRIX[tier] ||
        PricingService.FALLBACK_MATRIX.regular,
    );
  }

  /**
   * Asynchronously resolves effective base pricing from Firestore/cache for a given calendar date.
   */
  async getEffectivePricing(
    targetDate?: string,
    scope?: string,
  ): Promise<BasePricingMatrix> {
    const date = targetDate || getTodayIST();
    const targetScope = scope || "general";
    try {
      const config = await pricingRepository.getEffectiveForDate(
        date,
        targetScope,
      );
      if (config) {
        return normalizeBasePricingMatrix(config.pricing);
      }
    } catch {
      // In-memory/static fallback
    }
    return this.resolveSyncBasePricing(date, targetScope);
  }

  /**
   * Returns the effective pricing matrix for a subscription.
   * Strictly respects canonical precedence:
   *   negotiatedPricing -> pricingMatrixSnapshot -> effective base pricing
   */
  getPricingMatrix(
    subscription: Subscription,
    targetDate?: string,
  ): Record<string, number> {
    const tier =
      (subscription.planTier as keyof typeof PricingService.FALLBACK_MATRIX) ||
      "regular";
    const date = targetDate || subscription.startDate || getTodayIST();
    const basePricing = this.resolveSyncBasePricing(date, tier);
    const snapshot = flattenPricingMatrix((subscription as any).pricingMatrixSnapshot);
    const negotiated = flattenPricingMatrix((subscription as any).negotiatedPricing);

    return {
      ...basePricing,
      ...snapshot,
      ...negotiated,
    };
  }

  calculateMealPrice(
    subscription: Subscription,
    mealType: string,
    quantityOrDate?: number | string,
    targetDate?: string,
  ): number {
    let qty = 1;
    let dateStr: string | undefined;

    if (typeof quantityOrDate === "number") {
      qty = quantityOrDate;
      dateStr = targetDate;
    } else if (typeof quantityOrDate === "string") {
      dateStr = quantityOrDate;
    }

    const matrix = this.getPricingMatrix(subscription, dateStr);
    const unitPrice = matrix[mealType] ?? 0;
    return unitPrice * qty;
  }

  calculateAggregatedAmount(
    subscription: Subscription,
    key: string,
    quantity: number,
    targetDate?: string,
  ): number {
    if (!key || quantity <= 0) return 0;

    const flatNegotiated = flattenPricingMatrix((subscription as any).negotiatedPricing);
    if (flatNegotiated[key] !== undefined) {
      return flatNegotiated[key] * quantity;
    }

    const flatSnapshot = flattenPricingMatrix((subscription as any).pricingMatrixSnapshot);
    if (flatSnapshot[key] !== undefined) {
      return flatSnapshot[key] * quantity;
    }

    // Legacy full bundle fallback: when neither negotiated nor snapshot is present,
    // and the customer cancels all preferred meals, pricePerDaySnapshot represents the day rate.
    const hasNegotiated = Object.keys(flatNegotiated).length > 0;
    const hasSnapshot = Object.keys(flatSnapshot).length > 0;
    if (!hasNegotiated && !hasSnapshot) {
      const fullMeals = (subscription.mealPreferences || []).map((m: any) => m.mealType);
      let fullKey = "";
      if (fullMeals.includes("breakfast")) fullKey += "breakfast";
      if (fullMeals.includes("lunch")) fullKey += (fullKey ? "_" : "") + "lunch";
      if (fullMeals.includes("dinner")) fullKey += (fullKey ? "_" : "") + "dinner";
      if (key === fullKey && (subscription as any).pricePerDaySnapshot) {
        return ((subscription as any).pricePerDaySnapshot || 0) * quantity;
      }
    }

    const matrix = this.getPricingMatrix(subscription, targetDate);
    if (matrix[key] !== undefined) {
      return matrix[key] * quantity;
    }

    // If combo key (e.g. lunch_dinner) is not directly present, aggregate its parts
    if (key.includes("_")) {
      const parts = key.split("_");
      const sum = parts.reduce((acc, part) => acc + (matrix[part] ?? 0), 0);
      return sum * quantity;
    }

    return 0;
  }

  /**
   * Returns the monetary value of the meals being cancelled.
   * Uses canonical resolution: negotiatedPricing -> pricingMatrixSnapshot -> effective base pricing.
   */
  calculateCancellationAmount(
    subscription: Subscription,
    cancelledMeals: string[],
    targetDate?: string,
  ): number {
    if (!cancelledMeals || cancelledMeals.length === 0) return 0;
    const ordered: string[] = [];
    if (cancelledMeals.includes("breakfast")) ordered.push("breakfast");
    if (cancelledMeals.includes("lunch")) ordered.push("lunch");
    if (cancelledMeals.includes("dinner")) ordered.push("dinner");
    const key = ordered.join("_");
    const qty = (subscription.quantity || 1) as number;
    return this.calculateAggregatedAmount(subscription, key, qty, targetDate);
  }

  /**
   * Calculates the subscription price for a combination of preferred meals on a target start date.
   */
  async calculateSubscriptionPrice(
    mealPreferences: MealPreference[],
    targetDate?: string,
    planTier: string = "regular",
  ): Promise<number> {
    const matrix = await this.getEffectivePricing(targetDate, planTier);
    const meals = (mealPreferences || []).map((m) => m.mealType);
    if (meals.length === 0) return 0;

    let key = "";
    if (
      meals.includes("breakfast") &&
      meals.includes("lunch") &&
      meals.includes("dinner")
    ) {
      key = "breakfast_lunch_dinner";
    } else if (meals.includes("breakfast") && meals.includes("lunch")) {
      key = "breakfast_lunch";
    } else if (meals.includes("lunch") && meals.includes("dinner")) {
      key = "lunch_dinner";
    } else if (meals.includes("breakfast") && meals.includes("dinner")) {
      key = "breakfast_dinner";
    } else if (meals.includes("breakfast")) {
      key = "breakfast";
    } else if (meals.includes("lunch")) {
      key = "lunch";
    } else if (meals.includes("dinner")) {
      key = "dinner";
    }

    return (matrix as any)[key] ?? 0;
  }

  /**
   * Retrieve available add-on options, optionally filtered by meal slot.
   * Resolves from authoritative addonRepository in-memory cache.
   */
  getAvailableAddons(mealType?: MealType): AddonItem[] {
    const list = AddonRepository.getInMemoryCache();
    if (!mealType) {
      return list.filter((a) => a.isActive);
    }
    return list.filter(
      (a) => a.isActive && a.applicableMealTypes.includes(mealType),
    );
  }

  /**
   * Asynchronously retrieves available add-on options from authoritative Firestore catalog.
   */
  async getAvailableAddonsAsync(mealType?: MealType): Promise<AddonItem[]> {
    const list = await addonRepository.listAll();
    if (!mealType) {
      return list.filter((a) => a.isActive);
    }
    return list.filter(
      (a) => a.isActive && a.applicableMealTypes.includes(mealType),
    );
  }

  /**
   * Retrieve specific add-on metadata from authoritative catalog.
   */
  getAddonById(addonId: string): AddonItem | undefined {
    const list = AddonRepository.getInMemoryCache();
    return list.find((a) => a.id === addonId);
  }

  /**
   * Asynchronously retrieve specific add-on metadata from authoritative Firestore catalog.
   */
  async getAddonByIdAsync(addonId: string): Promise<AddonItem | undefined> {
    const item = await addonRepository.getById(addonId);
    return item || undefined;
  }

  /**
   * Authoritative calculation for an add-on item and quantity.
   */
  calculateAddonPrice(
    addonId: string,
    quantity: number = 1,
  ): { unitPrice: number; total: number; addon: AddonItem } {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer.");
    }
    const addon = this.getAddonById(addonId);
    if (!addon) {
      throw new Error(`Add-on ${addonId} not found.`);
    }
    if (!addon.isActive) {
      throw new Error(`Add-on ${addon.name} is currently not available.`);
    }
    const unitPrice = addon.price;
    const total = unitPrice * quantity;
    return { unitPrice, total, addon };
  }

  /**
   * Asynchronous authoritative calculation for an add-on item and quantity.
   */
  async calculateAddonPriceAsync(
    addonId: string,
    quantity: number = 1,
  ): Promise<{ unitPrice: number; total: number; addon: AddonItem }> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer.");
    }
    const addon = await this.getAddonByIdAsync(addonId);
    if (!addon) {
      throw new Error(`Add-on ${addonId} not found.`);
    }
    if (!addon.isActive) {
      throw new Error(`Add-on ${addon.name} is currently not available.`);
    }
    const unitPrice = addon.price;
    const total = unitPrice * quantity;
    return { unitPrice, total, addon };
  }
}

export const pricingService = new PricingService();
