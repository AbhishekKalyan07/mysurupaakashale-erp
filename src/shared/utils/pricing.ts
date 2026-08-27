import type { Subscription } from '../types';

export function calculateDailyPrice(sub: Subscription): number {
  if (!sub.pricingMatrixSnapshot) return sub.pricePerDaySnapshot;

  const meals = sub.mealPreferences.map(m => m.mealType);
  
  if (meals.length === 0) return 0;
  
  let key = '';
  if (meals.includes('breakfast') && meals.includes('lunch') && meals.includes('dinner')) {
    key = 'breakfast_lunch_dinner';
  } else if (meals.includes('breakfast') && meals.includes('lunch')) {
    key = 'breakfast_lunch';
  } else if (meals.includes('lunch') && meals.includes('dinner')) {
    key = 'lunch_dinner';
  } else if (meals.includes('breakfast') && meals.includes('dinner')) {
    key = 'breakfast_dinner';
  } else if (meals.includes('breakfast')) {
    key = 'breakfast';
  } else if (meals.includes('lunch')) {
    key = 'lunch';
  } else if (meals.includes('dinner')) {
    key = 'dinner';
  }

  const matrix = sub.pricingMatrixSnapshot as Record<string, number>;
  return matrix[key] || sub.pricePerDaySnapshot;
}
