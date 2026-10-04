import { useState, useMemo } from "react";
import { X, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useAdminMealPlans } from "@/features/admin/hooks/useAdminMealPlans";
import { useChangeSubscriptionPlan } from "@/features/admin/hooks/useAdminSubscriptions";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { pricingService } from "@/shared/services/business/pricingService";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import type { Subscription, MealPreference, MealType, MealPlan } from "@/shared/types";

import { isStandardPlan } from "@/features/customer/hooks/useMealPlans";

interface ChangePlanModalProps {
  subscription: Subscription;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePlanModal({
  subscription,
  isOpen,
  onClose,
  onSuccess,
}: ChangePlanModalProps) {
  useScrollLock(isOpen);
  const { data: mealPlans = [], isLoading: isLoadingPlans } = useAdminMealPlans(false);
  const changePlanMutation = useChangeSubscriptionPlan();

  const activePlans = useMemo(
    () => (mealPlans || []).filter((p: MealPlan) => p.isActive && isStandardPlan(p)),
    [mealPlans],
  );

  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    subscription.planId || (activePlans[0]?.id ?? ""),
  );

  // Default meal preferences to subscription's current preferences
  const [selectedMeals, setSelectedMeals] = useState<MealType[]>(() => {
    return (subscription.mealPreferences || []).map((p) => p.mealType);
  });

  const targetPlan = useMemo(
    () => activePlans.find((p: MealPlan) => p.id === selectedPlanId),
    [activePlans, selectedPlanId],
  );

  const hasNegotiatedPricing = !!(
    subscription.negotiatedPricing &&
    Object.keys(subscription.negotiatedPricing).length > 0
  );

  // Available slots for selected plan
  const availableSlots: MealType[] = useMemo(() => {
    if (!targetPlan || !targetPlan.mealSlots || targetPlan.mealSlots.length === 0) {
      return ["breakfast", "lunch", "dinner"];
    }
    return targetPlan.mealSlots.map((s: any) => s.mealType);
  }, [targetPlan]);

  // Filter selected meals to ensure they're available in target plan
  const validSelectedMeals = useMemo(
    () => selectedMeals.filter((m) => availableSlots.includes(m)),
    [selectedMeals, availableSlots],
  );

  // Estimate new standard price
  const estimatedStandardPrice = useMemo(() => {
    if (!targetPlan || validSelectedMeals.length === 0) return 0;
    const tier = targetPlan.tier || "regular";
    const matrix = pricingService.resolveSyncBasePricing(undefined, tier);
    const meals = validSelectedMeals;

    let key = "";
    if (meals.includes("breakfast") && meals.includes("lunch") && meals.includes("dinner")) {
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
  }, [targetPlan, validSelectedMeals]);

  // Estimate negotiated price if override exists
  const estimatedNegotiatedPrice = useMemo(() => {
    if (!hasNegotiatedPricing || validSelectedMeals.length === 0) return null;
    const meals = validSelectedMeals;
    let key = "";
    if (meals.includes("breakfast") && meals.includes("lunch") && meals.includes("dinner")) {
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
    const flat = subscription.negotiatedPricing as any;
    return flat && flat[key] !== undefined ? flat[key] : null;
  }, [hasNegotiatedPricing, validSelectedMeals, subscription.negotiatedPricing]);

  if (!isOpen) return null;

  const toggleMeal = (meal: MealType) => {
    if (selectedMeals.includes(meal)) {
      if (selectedMeals.length === 1) return; // Keep at least one
      setSelectedMeals(selectedMeals.filter((m) => m !== meal));
    } else {
      setSelectedMeals([...selectedMeals, meal]);
    }
  };

  const handleConfirm = async () => {
    if (!selectedPlanId) return;
    if (validSelectedMeals.length === 0) return;

    const newMealPreferences: MealPreference[] = validSelectedMeals.map((mealType) => {
      // Find matching option in target plan
      const slot = targetPlan?.mealSlots?.find((s: any) => s.mealType === mealType);
      const defaultOption = slot?.options?.[0];
      return {
        mealType,
        selectedOptionId: defaultOption?.id ?? null,
      };
    });

    try {
      await changePlanMutation.mutateAsync({
        subscriptionId: subscription.id,
        newPlanId: selectedPlanId,
        newMealPreferences,
      });
      onSuccess?.();
      onClose();
    } catch {
      // Error handled by mutation toast
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-primary font-display flex items-center gap-2">
              <RefreshCw size={20} className="text-gold" /> Change Subscription Plan
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Select a new meal plan tier and configure preferred meal slots.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text p-2 rounded-full hover:bg-surface-2 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {/* Current Plan Summary Card */}
          <div className="bg-surface-1 rounded-xl p-3.5 border border-border space-y-1.5 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Current Plan Configuration
            </span>
            <div className="flex items-center justify-between">
              <div className="font-bold text-text text-sm">
                {(subscription.planTier || "Unknown").toUpperCase()} PLAN
              </div>
              <Badge variant="default" className="text-[10px]">
                ₹{subscription.pricePerDaySnapshot || 0} / day
              </Badge>
            </div>
            {hasNegotiatedPricing && (
              <div className="flex items-center gap-1.5 text-amber-700 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 text-[11px] font-medium mt-1">
                <AlertCircle size={13} className="shrink-0" />
                <span>Customer has an active negotiated pricing override on this subscription.</span>
              </div>
            )}
          </div>

          {/* New Plan Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              Select New Plan
            </label>
            {isLoadingPlans ? (
              <div className="text-xs text-text-muted py-2">Loading active meal plans...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activePlans.map((plan: MealPlan) => {
                  const isSelected = plan.id === selectedPlanId;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "bg-primary/5 border-primary ring-1 ring-primary text-text shadow-sm"
                          : "bg-surface-1 border-border text-text-muted hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-sm text-text capitalize">
                          {plan.name}
                        </span>
                        {isSelected && <CheckCircle size={16} className="text-primary shrink-0" />}
                      </div>
                      <div className="text-[11px] text-text-muted mt-1 uppercase font-semibold">
                        Tier: {plan.tier}
                      </div>
                      <div className="text-[11px] text-primary font-bold mt-2">
                        Base: ₹{plan.pricePerDay} / day
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Meal Slots Configuration */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              Meal Slots to Include
            </label>
            <div className="flex gap-2 flex-wrap">
              {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
                const isAvailable = availableSlots.includes(meal);
                const isSelected = selectedMeals.includes(meal);
                return (
                  <button
                    key={meal}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => toggleMeal(meal)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold capitalize transition-all border ${
                      !isAvailable
                        ? "opacity-30 border-border bg-surface-1 cursor-not-allowed text-text-faint"
                        : isSelected
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-surface-1 text-text border-border hover:border-primary/40"
                    }`}
                  >
                    {meal} {!isAvailable && "(Not in plan)"}
                  </button>
                );
              })}
            </div>
            {validSelectedMeals.length === 0 && (
              <p className="text-[11px] text-danger font-medium">
                Please select at least one meal offered by the new plan.
              </p>
            )}
          </div>

          {/* Pricing Impact Preview */}
          <div className="bg-surface-2 rounded-xl p-3.5 border border-border space-y-2 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
              Pricing Impact Preview
            </span>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Standard Plan Price:</span>
              <span className="font-bold text-text text-sm">₹{estimatedStandardPrice} / day</span>
            </div>
            {hasNegotiatedPricing && (
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <span className="text-amber-800 font-medium">Customer Negotiated Price:</span>
                <span className="font-bold text-amber-800 text-sm">
                  {estimatedNegotiatedPrice !== null
                    ? `₹${estimatedNegotiatedPrice} / day`
                    : "No specific rate for this combo"}
                </span>
              </div>
            )}
            <p className="text-[10px] text-text-muted italic pt-1">
              Historical orders, past invoices, and completed payments remain unchanged. New rates apply to future daily order generation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-primary/10 flex justify-end gap-3 bg-surface-1/50 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={changePlanMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={
              !selectedPlanId ||
              validSelectedMeals.length === 0 ||
              changePlanMutation.isPending
            }
          >
            {changePlanMutation.isPending ? "Applying..." : "Confirm Plan Change"}
          </Button>
        </div>
      </div>
    </div>
  );
}
