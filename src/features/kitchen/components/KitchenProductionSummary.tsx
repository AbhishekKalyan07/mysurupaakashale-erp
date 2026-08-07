import { useMemo } from 'react';
import type { Order } from '@/shared/types';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { ChefHat } from 'lucide-react';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { RECIPE_BOOK } from '@/shared/config/recipeBook';

interface Props {
  orders: Order[];
}

export function KitchenProductionSummary({ orders }: Props) {
  const summary = useMemo(() => {
    const result: Record<string, Record<string, number>> = {
      breakfast: {},
      lunch: {},
      dinner: {}
    };

    orders.forEach(order => {
      // Only count active orders (exclude cancelled/skipped, maybe delivered?)
      // We'll count anything that is scheduled, preparing, packing, packed, ready_for_pickup
      if (['cancelled', 'skipped'].includes(order.status)) return;
      
      const mealType = order.mealType;
      // We rely on the denormalized snapshot field 'mealName' or fallback to itemsLabel
      const mealName = order.mealName || order.itemsLabel.replace(`Subscription - ${mealType}`, '').trim().replace(/^[()]+|[()]+$/g, '') || 'Standard Meal';
      const qty = order.mealQuantity || 1;

      if (!result[mealType]) {
        result[mealType] = {};
      }
      
      if (!result[mealType][mealName]) {
        result[mealType][mealName] = 0;
      }
      result[mealType][mealName] += qty;
    });

    return result;
  }, [orders]);

  const ingredients = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      const totalMeals = Object.values(summary[mealType] || {}).reduce((sum, qty) => sum + qty, 0);
      if (totalMeals > 0 && RECIPE_BOOK[mealType]) {
        for (const [ingredient, amount] of Object.entries(RECIPE_BOOK[mealType])) {
          totals[ingredient] = (totals[ingredient] || 0) + (amount * totalMeals);
        }
      }
    }
    return totals;
  }, [summary]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ChefHat size={40} className="text-primary/40" />}
        title="No production data"
        description="There are no active orders to cook for today."
      />
    );
  }

  const renderMealSection = (mealType: 'breakfast' | 'lunch' | 'dinner', title: string) => {
    const items = summary[mealType];
    if (Object.keys(items).length === 0) return null;

    return (
      <Card className="flex flex-col border border-rice-200 p-4 mb-4">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3 border-b border-rice-100 pb-2">{title}</h3>
        <ul className="space-y-2">
          {Object.entries(items).map(([itemName, totalQty]) => (
            <li key={itemName} className="flex justify-between items-center text-sm">
              <span className="font-medium text-ink-700">{itemName}</span>
              <span className="bg-rice-100 text-ink-900 font-bold px-2.5 py-0.5 rounded-full">
                {totalQty}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {renderMealSection('breakfast', 'Breakfast Total')}
        {renderMealSection('lunch', 'Lunch Total')}
        {renderMealSection('dinner', 'Dinner Total')}
      </div>
      
      {Object.keys(ingredients).length > 0 && (
        <Card className="border border-secondary/20 p-4">
          <h3 className="font-display text-lg font-bold text-secondary mb-3 border-b border-secondary/10 pb-2">Ingredient Projection</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(ingredients).map(([item, qty]) => (
              <div key={item} className="flex flex-col p-3 bg-secondary/5 rounded-lg border border-secondary/10">
                <span className="text-sm font-medium text-ink-600">{item}</span>
                <span className="text-lg font-bold text-secondary">{qty.toFixed(2)} {item === 'Oil' ? 'L' : 'kg'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
