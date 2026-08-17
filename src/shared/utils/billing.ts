import type { Subscription, Order, MealPlanPricing } from '@/shared/types';

export function calculateAccruedBill(
  orders: Order[],
  subscription: Subscription
): number {
  if (!subscription) return 0;

  // Filter orders for this subscription that are NOT purely cancelled before cutoff.
  // Chargeable statuses include: delivered, picked_up, out_for_delivery, failed_delivery, returned_delivery.
  // If a cancellation happened after the cutoff, it shouldn't just be 'cancelled' if we strictly follow the rules,
  // but in the current schema if the kitchen lock is on, cancelOrdersForSkipDay throws an error instead of setting 'cancelled'.
  // So 'cancelled' strictly means a successful before-cutoff cancellation. 
  // All other non-cancelled orders (and non-scheduled) are chargeable.
  const subOrders = orders.filter(
    o => o.subscriptionId === subscription.id && o.status !== 'cancelled' && o.status !== 'scheduled'
  );

  // Group by date, and prevent duplicate charging for the same meal/date
  const groupedOrders: Record<string, Set<string>> = {};
  for (const order of subOrders) {
    if (!groupedOrders[order.date]) {
      groupedOrders[order.date] = new Set<string>();
    }
    groupedOrders[order.date].add(order.mealType);
  }

  let totalBill = 0;

  for (const date in groupedOrders) {
    const mealTypes = Array.from(groupedOrders[date]);
    
    // Sort meal types to match pricing matrix keys (breakfast -> lunch -> dinner)
    const sortedMeals = [];
    if (mealTypes.includes('breakfast')) sortedMeals.push('breakfast');
    if (mealTypes.includes('lunch')) sortedMeals.push('lunch');
    if (mealTypes.includes('dinner')) sortedMeals.push('dinner');
    
    const key = sortedMeals.join('_') as keyof MealPlanPricing;
    
    const matrix = subscription.pricingMatrixSnapshot;
    
    let dailyCharge = 0;
    if (matrix && matrix[key] !== undefined) {
      dailyCharge = matrix[key];
    } else {
      // Legacy fallback: sum up the individual order prices
      // Since we deduped by mealType, we just get the original order objects for the deduped meals
      const uniqueOrders = [];
      const seenMeals = new Set<string>();
      for (const order of subOrders) {
        if (order.date === date && !seenMeals.has(order.mealType)) {
          seenMeals.add(order.mealType);
          uniqueOrders.push(order);
        }
      }
      dailyCharge = uniqueOrders.reduce((sum, order) => sum + (order.price || 0), 0);
    }
    
    totalBill += dailyCharge * (subscription.quantity || 1);
  }
  
  return totalBill;
}
