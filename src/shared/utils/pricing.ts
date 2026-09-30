import type { Subscription } from "../types";
import { pricingService } from "../services/business/pricingService";

export function calculateDailyPrice(sub: Subscription): number {
  const meals = sub.mealPreferences.map((m) => m.mealType);
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

  // Canonical precedence: negotiatedPricing -> pricingMatrixSnapshot -> effective base pricing
  const negotiated = (sub as any).negotiatedPricing || {};
  if (negotiated[key] !== undefined) {
    return negotiated[key];
  }

  const snapshot = (sub as any).pricingMatrixSnapshot || {};
  if (snapshot[key] !== undefined) {
    return snapshot[key];
  }

  const matrix = pricingService.getPricingMatrix(sub);
  return matrix[key] || sub.pricePerDaySnapshot || 0;
}
