import { useState, useEffect } from "react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { getTodayIST, getModifiableMeals } from "@/shared/utils/dateUtils";
import { toast } from "react-hot-toast";
import { X, Plus, Minus, Utensils } from "lucide-react";
import { pricingService, type AddonItem } from "@/shared/services/business/pricingService";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/queryKeys";
import { orderService } from "@/shared/services/business/orderService";
import { useAddons } from "@/features/admin/hooks/useAdminAddons";
import type { Subscription, MealType } from "@/shared/types";

interface AddTodayAddonModalProps {
  subscription: Subscription;
  defaultMealType?: MealType;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddTodayAddonModal({
  subscription,
  defaultMealType,
  onClose,
  onSuccess,
}: AddTodayAddonModalProps) {
  const queryClient = useQueryClient();
  const todayStr = getTodayIST();

  const allMeals: MealType[] = ["breakfast", "lunch", "dinner"];
  const eligibleMeals = getModifiableMeals(todayStr, allMeals) as MealType[];

  const initialMeal =
    defaultMealType && eligibleMeals.includes(defaultMealType)
      ? defaultMealType
      : eligibleMeals[0] || "lunch";

  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMeal);

  const { data: catalogAddons = [] } = useAddons();

  const allAddons: AddonItem[] = catalogAddons.length > 0
    ? catalogAddons.map((a) => ({
        ...a,
        unitPrice: a.price,
        validMealSlots: a.applicableMealTypes || a.validMealSlots || [],
        applicableMealTypes: a.applicableMealTypes || a.validMealSlots || [],
        isActive: a.isActive !== false,
      }))
    : pricingService.getAvailableAddons();

  const getAddonsForMeal = (meal: MealType) => {
    return allAddons.filter(
      (a) => a.isActive !== false && (a.applicableMealTypes || []).includes(meal)
    );
  };

  const availableAddons = getAddonsForMeal(selectedMeal);

  const [selectedAddonId, setSelectedAddonId] = useState<string>(
    availableAddons[0]?.id || "",
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (availableAddons.length > 0 && !availableAddons.some((a) => a.id === selectedAddonId)) {
      setSelectedAddonId(availableAddons[0].id);
    }
  }, [availableAddons, selectedAddonId]);

  // Synchronize selected addon when meal tab switches
  const handleMealChange = (meal: MealType) => {
    setSelectedMeal(meal);
    const addonsForMeal = getAddonsForMeal(meal);
    if (!addonsForMeal.some((a) => a.id === selectedAddonId)) {
      setSelectedAddonId(addonsForMeal[0]?.id || "");
    }
  };

  const selectedAddon: AddonItem | undefined =
    allAddons.find((a) => a.id === selectedAddonId) || pricingService.getAddonById(selectedAddonId);

  // Authoritative price calculation directly via PricingService
  let unitPrice = 0;
  let totalAmount = 0;
  if (selectedAddon) {
    try {
      const calc = pricingService.calculateAddonPrice(selectedAddonId, quantity);
      unitPrice = calc.unitPrice;
      totalAmount = calc.total;
    } catch {
      unitPrice = selectedAddon.price;
      totalAmount = unitPrice * quantity;
    }
  }

  const handleConfirm = async () => {
    if (!selectedAddon) {
      toast.error("Please select an add-on.");
      return;
    }
    setIsSubmitting(true);
    try {
      await orderService.addTodayAddon(
        subscription.id,
        selectedMeal,
        selectedAddon.id,
        quantity,
      );

      toast.success(`${selectedAddon.name} added to today's ${selectedMeal}!`);
      // Refresh UI queries
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.base });
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Failed to add add-on:", err);
      toast.error(err?.message || "Failed to add add-on.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="addon-modal-title"
      className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-7 border border-primary/20 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Utensils className="text-gold" size={20} />
            <h2
              id="addon-modal-title"
              className="text-xl sm:text-2xl font-bold font-display text-primary"
            >
              Today's Add-on
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {eligibleMeals.length === 0 ? (
          <div className="mb-6">
            <p className="text-danger font-bold bg-danger/10 p-4 rounded-xl border border-danger/20 text-sm">
              It is too late to add any add-ons for today based on the cut-off
              times.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Meal Slot Selection */}
            <div>
              <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
                Select Meal Slot
              </label>
              <div className="grid grid-cols-3 gap-2">
                {allMeals.map((meal) => {
                  const isEligible = eligibleMeals.includes(meal);
                  const isSelected = selectedMeal === meal;
                  return (
                    <button
                      key={meal}
                      type="button"
                      disabled={!isEligible}
                      onClick={() => handleMealChange(meal)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs capitalize transition-all border ${
                        isSelected
                          ? "bg-gold text-white border-gold shadow-sm"
                          : isEligible
                            ? "bg-primary/5 text-primary border-primary/10 hover:bg-primary/10"
                            : "bg-background-alt text-text-muted/40 border-dashed border-primary/10 cursor-not-allowed"
                      }`}
                    >
                      {meal}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add-on Catalog Selection */}
            <div>
              <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
                Available Add-ons ({selectedMeal})
              </label>
              {availableAddons.length === 0 ? (
                <p className="text-xs text-text-muted p-3 bg-primary/5 rounded-xl">
                  No active add-ons available for {selectedMeal}.
                </p>
              ) : (
                <div className="space-y-2">
                  {availableAddons.map((addon) => {
                    const isSelected = selectedAddonId === addon.id;
                    return (
                      <div
                        key={addon.id}
                        data-testid={`addon-option-${addon.id}`}
                        onClick={() => setSelectedAddonId(addon.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-gold bg-gold/10 shadow-sm ring-1 ring-gold"
                            : "border-primary/10 bg-primary/5 hover:bg-primary/10"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-sm text-primary font-sans">
                            {addon.name}
                          </p>
                          {addon.description && (
                            <p className="text-[11px] text-text-muted font-sans line-clamp-1">
                              {addon.description}
                            </p>
                          )}
                        </div>
                        <span className="font-mono font-bold text-sm text-gold-dark shrink-0 ml-3">
                          ₹{addon.price}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quantity Selector */}
            {selectedAddon && (
              <div>
                <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
                  Quantity
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-10 h-10 rounded-xl border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span
                    data-testid="addon-quantity"
                    className="w-12 text-center font-mono font-bold text-base text-primary"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    disabled={quantity >= 10}
                    className="w-10 h-10 rounded-xl border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Authoritative Price Summary Card */}
            {selectedAddon && (
              <div
                data-testid="addon-price-display"
                className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2"
              >
                <div className="flex justify-between items-center text-xs font-sans text-primary">
                  <span className="font-semibold">{selectedAddon.name}</span>
                  <span className="capitalize font-medium text-text-muted">
                    {selectedMeal}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-sans text-text-muted">
                  <span>Unit Price × Quantity:</span>
                  <span className="font-mono">
                    ₹{unitPrice} × {quantity}
                  </span>
                </div>
                <div className="pt-2 border-t border-primary/10 flex justify-between items-center">
                  <span className="text-xs font-bold font-sans text-primary uppercase tracking-wide">
                    Total Amount:
                  </span>
                  <span
                    data-testid="addon-total-price"
                    className="font-mono font-bold text-base text-gold-dark"
                  >
                    ₹{totalAmount}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1 font-bold min-h-[44px]"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                data-testid="confirm-addon-button"
                className="flex-1 font-bold min-h-[44px]"
                onClick={handleConfirm}
                isLoading={isSubmitting}
                disabled={!selectedAddon || availableAddons.length === 0}
              >
                Confirm Add-on
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
