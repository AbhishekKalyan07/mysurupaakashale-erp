import { useState, useMemo } from "react";
import type { AreaPackingGroup } from "@/shared/services/business/productionService";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { MapPin, Filter, RotateCcw } from "lucide-react";

interface Props {
  areaGroups: AreaPackingGroup[];
}

export function PackingList({ areaGroups }: Props) {
  const [mealFilter, setMealFilter] = useState<
    "all" | "breakfast" | "lunch" | "dinner"
  >("all");
  const [notesOnly, setNotesOnly] = useState(false);

  // Total orders count across all areas before filters
  const totalOrdersCount = useMemo(() => {
    return areaGroups.reduce((acc, g) => acc + g.orders.length, 0);
  }, [areaGroups]);

  // Compute filtered area groups
  const filteredAreaGroups = useMemo(() => {
    return areaGroups
      .map((group) => {
        const filteredOrders = group.orders.filter((order) => {
          if (mealFilter !== "all" && order.mealType !== mealFilter) {
            return false;
          }
          if (notesOnly) {
            const hasNotes = Boolean(
              order.specialInstructions?.trim() ||
                order.packingNotes?.trim(),
            );
            if (!hasNotes) return false;
          }
          return true;
        });

        // Calculate breakdown for filtered orders
        let breakfast = 0;
        let lunch = 0;
        let dinner = 0;

        for (const o of filteredOrders) {
          if (o.mealType === "breakfast") breakfast += o.quantity;
          else if (o.mealType === "lunch") lunch += o.quantity;
          else if (o.mealType === "dinner") dinner += o.quantity;
        }

        const specialHandlingCount = filteredOrders.filter((o) =>
          Boolean(o.specialInstructions?.trim() || o.packingNotes?.trim()),
        ).length;

        return {
          ...group,
          breakfast,
          lunch,
          dinner,
          orders: filteredOrders,
          filteredTotal: filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
          specialHandlingCount,
        };
      })
      .filter((group) => group.orders.length > 0);
  }, [areaGroups, mealFilter, notesOnly]);

  const visibleOrdersCount = useMemo(() => {
    return filteredAreaGroups.reduce((acc, g) => acc + g.orders.length, 0);
  }, [filteredAreaGroups]);

  const isFiltered = mealFilter !== "all" || notesOnly;

  const clearFilters = () => {
    setMealFilter("all");
    setNotesOnly(false);
  };

  if (areaGroups.length === 0) {
    return (
      <div className="text-sm text-ink-500 py-8 text-center bg-rice-50 rounded-xl border border-rice-200">
        No orders for packing.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filters Bar ── */}
      <div className="p-3.5 bg-rice-25 rounded-xl border border-rice-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Meal filter pills */}
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-rice-200">
            {(["all", "breakfast", "lunch", "dinner"] as const).map((meal) => (
              <button
                key={meal}
                type="button"
                onClick={() => setMealFilter(meal)}
                className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-bold uppercase transition-colors ${
                  mealFilter === meal
                    ? "bg-ink-900 text-white"
                    : "text-ink-600 hover:bg-rice-100"
                }`}
              >
                {meal === "all" ? "All Meals" : meal}
              </button>
            ))}
          </div>

          {/* Notes Only toggle */}
          <button
            type="button"
            onClick={() => setNotesOnly((prev) => !prev)}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
              notesOnly
                ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                : "bg-white text-ink-700 border-rice-200 hover:bg-rice-50"
            }`}
          >
            <span>⚠️ Only show orders with notes</span>
          </button>
        </div>

        {/* Counter and clear action */}
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-ink-600">
            Showing <strong className="text-ink-900">{visibleOrdersCount}</strong> of{" "}
            <strong className="text-ink-900">{totalOrdersCount}</strong> orders
          </span>

          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 font-bold text-turmeric-700 hover:text-turmeric-800 underline underline-offset-2"
            >
              <RotateCcw size={12} />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Empty State if filters yield 0 results ── */}
      {filteredAreaGroups.length === 0 ? (
        <div className="text-center py-12 px-4 bg-rice-50 rounded-xl border border-rice-200">
          <Filter size={32} className="mx-auto text-ink-400 mb-2" />
          <h3 className="font-display font-bold text-ink-900 text-base">
            No packing orders match filters
          </h3>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            Try choosing a different meal or disabling the special notes filter.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-turmeric-600 text-white hover:bg-turmeric-700 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAreaGroups.map((group) => {
            const total = group.filteredTotal;
            if (total === 0) return null;

            return (
              <Card
                key={group.areaName}
                className="flex flex-col border-t-4 border-t-turmeric-400"
              >
                <div className="p-4 border-b border-rice-100 flex justify-between items-center bg-rice-25 gap-2">
                  <div className="flex items-center gap-2 text-ink-900 font-display font-bold truncate">
                    <MapPin size={16} className="text-turmeric-600 shrink-0" />
                    <span className="truncate">{group.areaName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {group.specialHandlingCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        ⚠️ {group.specialHandlingCount} Special
                      </span>
                    )}
                    <Badge variant="default" className="text-[10px] font-data">
                      Total {total}
                    </Badge>
                  </div>
                </div>

                <div className="p-4 flex-1">
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Meal Breakdown */}
                    <div className="space-y-3 pr-4 border-r border-rice-100">
                      <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                        By Meal
                      </h4>
                      {group.breakfast > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>Breakfast</span>{" "}
                          <span className="font-data font-bold">
                            {group.breakfast}
                          </span>
                        </div>
                      )}
                      {group.lunch > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>Lunch</span>{" "}
                          <span className="font-data font-bold">{group.lunch}</span>
                        </div>
                      )}
                      {group.dinner > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>Dinner</span>{" "}
                          <span className="font-data font-bold">
                            {group.dinner}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Plan Breakdown */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                        By Plan
                      </h4>
                      {group.basic > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>Basic</span>{" "}
                          <span className="font-data font-bold">{group.basic}</span>
                        </div>
                      )}
                      {group.regular > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>Regular</span>{" "}
                          <span className="font-data font-bold">
                            {group.regular}
                          </span>
                        </div>
                      )}
                      {group.oneTime > 0 && (
                        <div className="flex justify-between text-sm text-ink-700">
                          <span>One-Time</span>{" "}
                          <span className="font-data font-bold">
                            {group.oneTime}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Packing List */}
                  <div className="mt-6">
                    <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-2 border-b border-rice-100 pb-1">
                      Customer Packing List ({group.orders.length})
                    </h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {group.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-start justify-between bg-rice-25 p-2 rounded border border-rice-100"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  order.mealType === "breakfast"
                                    ? "bg-orange-500"
                                    : order.mealType === "lunch"
                                    ? "bg-sky-500"
                                    : "bg-purple-500"
                                }`}
                              />
                              <span className="font-bold text-sm text-ink-900 leading-tight">
                                {order.customerName}
                              </span>
                              <span className="text-[10px] font-mono text-ink-500 ml-1 bg-rice-100 px-1 rounded">
                                {order.displayId}
                              </span>
                            </div>
                            <div className="text-xs text-ink-700 font-medium ml-3.5">
                              {order.mealName}
                            </div>
                            {(order.specialInstructions ||
                              order.packingNotes) && (
                              <div className="ml-3.5 mt-1 space-y-0.5">
                                {order.specialInstructions && (
                                  <div className="text-[10px] text-warning-dark font-medium bg-warning-subtle px-1.5 py-0.5 rounded inline-block">
                                    ⚠️ {order.specialInstructions}
                                  </div>
                                )}
                                {order.packingNotes && (
                                  <div className="text-[10px] text-info-dark font-medium bg-info-subtle px-1.5 py-0.5 rounded inline-block ml-1">
                                    📝 {order.packingNotes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-center shrink-0 w-6 h-6 rounded bg-turmeric-100 text-turmeric-800 font-bold text-xs border border-turmeric-200 ml-2">
                            {order.quantity}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
