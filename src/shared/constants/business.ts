import { isToday, isBefore, parseISO } from 'date-fns';
import type { MealType } from '../types/mealPlan.types';

export const MEAL_READY_TIMES: Record<MealType, { hour: number; minute: number }> = {
  breakfast: { hour: 7, minute: 30 },
  lunch: { hour: 12, minute: 30 },
  dinner: { hour: 19, minute: 30 },
};

/**
 * Determines if an order should be considered "Ready for Pickup" automatically
 * based on its meal type and the current time, bypassing manual kitchen entry.
 */
export function isOrderAutoReady(orderDate: string, mealType: MealType): boolean {
  const now = new Date();
  const orderDateObj = parseISO(orderDate);
  
  // Strip time from today's date for accurate comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (isBefore(orderDateObj, todayStart)) {
     // Order is from a past date, so it's definitely past its ready time
     return true;
  }
  
  if (!isToday(orderDateObj)) {
     // Order is in the future
     return false;
  }
  
  const readyTime = MEAL_READY_TIMES[mealType];
  const readyDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), readyTime.hour, readyTime.minute, 0);
  
  return now >= readyDate;
}
