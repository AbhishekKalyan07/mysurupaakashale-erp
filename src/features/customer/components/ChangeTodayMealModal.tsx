import { useState } from "react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { getTodayIST, getModifiableMeals } from "@/shared/utils/dateUtils";
import { toast } from "react-hot-toast";
import { X, Check, UtensilsCrossed, Clock, AlertCircle } from "lucide-react";
import { useChangeTodayMealOption } from "@/features/customer/hooks/useMySubscription";
import { useMealPlans } from "@/features/customer/hooks/useMealPlans";
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";
import type { Subscription, Order, MealPlan, MealOption } from "@/shared/types";

interface ChangeTodayMealModalProps {
  subscription: Subscription;
  order: Order;
  plan?: MealPlan;
  onClose: () => void;
}

export function ChangeTodayMealModal({
  subscription,
  order,
  plan: initialPlan,
  onClose,
}: ChangeTodayMealModalProps) {
  const todayStr = getTodayIST();
  const changeMutation = useChangeTodayMealOption();
  const { data: plans } = useMealPlans();

  const plan =
    initialPlan ||
    (plans || []).find((p: MealPlan) => p.id === subscription.planId);

  const mealType = order.mealType;
  const isBreakfast = mealType === "breakfast";

  // Check cutoff
  const eligibleMeals = getModifiableMeals(todayStr, [mealType]);
  const isCutoffPassed = eligibleMeals.length === 0;

  // Find slot options
  const slot = (plan?.mealSlots || []).find((s) => s.mealType === mealType);
  const options: MealOption[] = (slot?.options || []).filter(
    (o) => o.isActive !== false && o.isCustomerSelectable !== false,
  );

  const currentOptionId = order.selectedOptionId;
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");

  const rawCutoff = operationalSettingsService.getMealCutoffSync(mealType);
  const [cHStr = "00", cMStr = "00"] = rawCutoff.split(":");
  const cH = parseInt(cHStr, 10);
  const period = cH >= 12 ? "PM" : "AM";
  const displayH = cH % 12 || 12;
  const cutoffTimeLabel = `${String(displayH).padStart(2, "0")}:${cMStr} ${period}`;

  const handleChange = async () => {
    if (!selectedOptionId || selectedOptionId === currentOptionId) return;

    try {
      const result = await changeMutation.mutateAsync({
        subscriptionId: subscription.id,
        mealType,
        newOptionId: selectedOptionId,
      });

      if (result.success) {
        toast.success(`Today's ${mealType} option changed to ${result.newMealName}.`);
        onClose();
      }
    } catch (err: any) {
      console.error("Failed to change today's meal option:", err);
      toast.error(err?.message || "Failed to change meal option.");
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="change-meal-modal-title"
      className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-7 border border-primary/20 max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gold/15 flex items-center justify-center text-gold">
              <UtensilsCrossed size={18} />
            </div>
            <div>
              <h2
                id="change-meal-modal-title"
                className="text-xl sm:text-2xl font-bold font-display text-primary capitalize"
              >
                Change Today's {mealType}
              </h2>
              <p className="text-xs text-text-muted font-sans flex items-center gap-1.5 mt-0.5">
                <Clock size={12} className="text-gold" />
                Cutoff: {cutoffTimeLabel} IST
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content based on state */}
        {isBreakfast ? (
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-primary">Fixed Rotating Menu</p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  Breakfast follows the daily curated kitchen menu and does not have alternative options for substitution.
                </p>
              </div>
            </div>
          </div>
        ) : isCutoffPassed ? (
          <div className="p-4 bg-danger/10 rounded-xl border border-danger/20 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-danger shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-danger">Cutoff Window Closed</p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  It is too late to change options for today's {mealType}. Cutoff time was {cutoffTimeLabel} IST.
                </p>
              </div>
            </div>
          </div>
        ) : options.length <= 1 ? (
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 mb-6 text-center">
            <p className="text-sm text-text-muted font-medium">
              No alternative options are configured for this meal slot in your plan.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <p className="text-xs text-text-muted font-sans leading-relaxed">
              Select an alternative option for today's {mealType}. This is an operational override for today only and will not affect your permanent subscription settings.
            </p>

            <div className="space-y-2.5">
              {options.map((opt) => {
                const isCurrent = opt.id === currentOptionId;
                const isSelected = selectedOptionId === opt.id;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      isCurrent
                        ? "bg-primary/5 border-primary/15 opacity-60 cursor-not-allowed"
                        : isSelected
                          ? "bg-gold/10 border-gold shadow-sm ring-1 ring-gold/40"
                          : "bg-surface-1 border-primary/10 hover:border-gold/50 cursor-pointer"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-primary">
                          {opt.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                            Current Selection
                          </span>
                        )}
                      </div>
                      {opt.items && opt.items.length > 0 && (
                        <p className="text-xs text-text-muted mt-1 leading-snug">
                          {opt.items.join(" • ")}
                        </p>
                      )}
                    </div>

                    <div className="mt-0.5 shrink-0">
                      {isCurrent ? (
                        <span className="text-xs font-semibold text-text-muted">
                          Active
                        </span>
                      ) : (
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "bg-gold border-gold text-background font-bold"
                              : "border-primary/30"
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Price invariant notification */}
            <div className="bg-primary/5 p-3 rounded-lg flex items-center justify-between text-xs">
              <span className="text-text-muted font-medium">Price difference:</span>
              <span className="font-bold font-mono text-success-dark">₹0 (Free)</span>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex gap-3 justify-end pt-2 border-t border-primary/10">
          <Button variant="secondary" onClick={onClose} disabled={changeMutation.isPending}>
            Cancel
          </Button>
          {!isBreakfast && !isCutoffPassed && options.length > 1 && (
            <Button
              variant="primary"
              onClick={handleChange}
              disabled={!selectedOptionId || selectedOptionId === currentOptionId || changeMutation.isPending}
              isLoading={changeMutation.isPending}
            >
              Confirm Change
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
