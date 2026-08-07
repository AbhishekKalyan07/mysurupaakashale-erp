/**
 * Hardcoded mapping of meal types/options to base ingredient quantities.
 * This is used to project the required raw materials based on generated orders.
 * 
 * Quantities are per single meal.
 * Units: Kg or Liters (as appropriate for the ingredient).
 */

export interface IngredientMapping {
  [ingredientName: string]: number;
}

export const RECIPE_BOOK: Record<string, IngredientMapping> = {
  'breakfast': {
    'Rice': 0.1,
    'Dal': 0.05,
    'Oil': 0.02,
    'Curd': 0.1
  },
  'lunch': {
    'Rice': 0.25,
    'Dal': 0.1,
    'Oil': 0.03,
    'Curd': 0.15
  },
  'dinner': {
    'Rice': 0.15,
    'Dal': 0.08,
    'Oil': 0.02,
    'Curd': 0.05
  },
  'chapati_meal': {
    'Wheat Flour': 0.2,
    'Dal': 0.1,
    'Oil': 0.02,
    'Curd': 0.1
  }
};
