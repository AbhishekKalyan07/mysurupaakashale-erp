import { useMemo } from "react";
import type { Order } from "@/shared/types";
import { ProductionService } from "@/shared/services/business/productionService";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { ChefHat, AlertCircle } from "lucide-react";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { RECIPE_BOOK } from "@/shared/config/recipeBook";

interface Props {
  orders: Order[];
  zoneMap?: Map<string, string>;
  customerMap?: Map<string, string>;
}

export function KitchenProductionSummary({
  orders,
  zoneMap,
  customerMap,
}: Props) {
  const summary = useMemo(() => {
    const result: Record<string, Record<string, number>> = {
      breakfast: {},
      lunch: {},
      dinner: {},
    };

    (orders || []).forEach((order) => {
      // Only count active orders (exclude cancelled/skipped)
      if (["cancelled", "skipped"].includes(order.status)) return;

      const mealType = order.mealType;
      // We rely on the denormalized snapshot field 'mealName' or fallback to itemsLabel
      const mealName =
        order.mealName ||
        (order.itemsLabel || "")
          .replace(`Subscription - ${mealType}`, "")
          .trim()
          .replace(/^[()]+|[()]+$/g, "") ||
        order.addonName ||
        "Standard Meal";
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
    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      const totalMeals = Object.values(summary[mealType] || {}).reduce(
        (sum, qty) => sum + qty,
        0,
      );
      if (totalMeals > 0 && RECIPE_BOOK[mealType]) {
        for (const [ingredient, amount] of Object.entries(
          RECIPE_BOOK[mealType],
        )) {
          totals[ingredient] = (totals[ingredient] || 0) + amount * totalMeals;
        }
      }
    }
    return totals;
  }, [summary]);

  const specialOrders = useMemo(() => {
    return ProductionService.getSpecialHandlingOrders(
      orders,
      zoneMap,
      customerMap,
    );
  }, [orders, zoneMap, customerMap]);

  const specialByMeal = useMemo(() => {
    const grouped: Record<
      "breakfast" | "lunch" | "dinner",
      typeof specialOrders
    > = {
      breakfast: [],
      lunch: [],
      dinner: [],
    };
    for (const entry of specialOrders) {
      const meal = entry.mealType as "breakfast" | "lunch" | "dinner";
      if (grouped[meal]) {
        grouped[meal].push(entry);
      }
    }
    return grouped;
  }, [specialOrders]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ChefHat size={40} className="text-primary/40" />}
        title="No production data"
        description="There are no active orders to cook for today."
      />
    );
  }

  const renderMealSection = (
    mealType: "breakfast" | "lunch" | "dinner",
    title: string,
  ) => {
    const items = summary[mealType];
    if (Object.keys(items).length === 0) return null;

    return (
      <Card className="flex flex-col border border-rice-200 p-4 mb-4">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3 border-b border-rice-100 pb-2">
          {title}
        </h3>
        <ul className="space-y-2">
          {Object.entries(items).map(([itemName, totalQty]) => (
            <li
              key={itemName}
              className="flex justify-between items-center text-sm"
            >
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
        {renderMealSection("breakfast", "Breakfast Total")}
        {renderMealSection("lunch", "Lunch Total")}
        {renderMealSection("dinner", "Dinner Total")}
      </div>

      {/* ── Special Instructions & Custom Handling Panel ── */}
      <Card className="border-2 border-amber-300 bg-amber-50/20 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-amber-200 gap-2 mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={22} className="text-amber-600 shrink-0" />
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900">
                Special Instructions & Custom Handling
              </h3>
              <p className="text-xs text-ink-600">
                Preparation notes and customer handling requirements for active orders.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
            {specialOrders.length} {specialOrders.length === 1 ? "Order" : "Orders"}
          </span>
        </div>

        {specialOrders.length === 0 ? (
          <div className="text-sm text-ink-500 py-6 text-center italic bg-white/70 rounded-lg border border-amber-100">
            No special handling instructions or notes for today's active orders.
          </div>
        ) : (
          <div className="space-y-6">
            {(["breakfast", "lunch", "dinner"] as const).map((mealKey) => {
              const mealOrders = specialByMeal[mealKey];
              if (mealOrders.length === 0) return null;
              const mealLabel =
                mealKey.charAt(0).toUpperCase() + mealKey.slice(1);

              return (
                <div key={mealKey} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        mealKey === "breakfast"
                          ? "bg-orange-500"
                          : mealKey === "lunch"
                          ? "bg-sky-500"
                          : "bg-purple-500"
                      }`}
                    />
                    <h4 className="font-display font-bold text-sm text-ink-800 uppercase tracking-wider">
                      {mealLabel} ({mealOrders.length})
                    </h4>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-rice-200 bg-white">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-rice-100 text-ink-700 text-xs uppercase tracking-wider border-b border-rice-200">
                          <th className="py-2.5 px-3 font-bold w-24">Code</th>
                          <th className="py-2.5 px-3 font-bold w-40">Area</th>
                          <th className="py-2.5 px-3 font-bold">Dish / Item</th>
                          <th className="py-2.5 px-3 font-bold w-16 text-center">Qty</th>
                          <th className="py-2.5 px-4 font-bold">Special Handling & Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rice-100">
                        {mealOrders.map((entry) => (
                          <tr key={entry.id} className="hover:bg-amber-50/30">
                            <td className="py-2.5 px-3 font-mono font-bold text-xs text-ink-800">
                              {entry.displayId}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-ink-600 font-medium">
                              {entry.area}
                            </td>
                            <td className="py-2.5 px-3 text-xs font-semibold text-ink-900">
                              {entry.mealName}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-sm text-ink-900">
                              {entry.quantity}
                            </td>
                            <td className="py-2.5 px-4 text-xs space-y-1">
                              {entry.specialInstructions && (
                                <div className="flex items-start gap-1.5 text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                  <span className="font-bold text-[10px] uppercase bg-amber-200/80 text-amber-800 px-1 py-0.5 rounded shrink-0">
                                    Customer Instruction
                                  </span>
                                  <span className="font-medium">
                                    {entry.specialInstructions}
                                  </span>
                                </div>
                              )}
                              {entry.packingNotes && (
                                <div className="flex items-start gap-1.5 text-sky-900 bg-sky-50 border border-sky-200 rounded px-2 py-1">
                                  <span className="font-bold text-[10px] uppercase bg-sky-200/80 text-sky-800 px-1 py-0.5 rounded shrink-0">
                                    Menu Packing Note
                                  </span>
                                  <span className="font-medium">
                                    {entry.packingNotes}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {Object.keys(ingredients).length > 0 && (
        <Card className="border border-secondary/20 p-4">
          <h3 className="font-display text-lg font-bold text-secondary mb-3 border-b border-secondary/10 pb-2">
            Ingredient Projection
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(ingredients).map(([item, qty]) => (
              <div
                key={item}
                className="flex flex-col p-3 bg-secondary/5 rounded-lg border border-secondary/10"
              >
                <span className="text-sm font-medium text-ink-600">{item}</span>
                <span className="text-lg font-bold text-secondary">
                  {qty.toFixed(2)} {item === "Oil" ? "L" : "kg"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
