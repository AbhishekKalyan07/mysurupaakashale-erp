import { useState, useMemo, useEffect } from "react";
import { X, IndianRupee, AlertCircle } from "lucide-react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { useMealPlans } from "@/features/customer/hooks/useMealPlans";
import { useAdminCreateSubscription } from "../hooks/useAdminSubscriptions";
import { pricingService } from "@/shared/services/business/pricingService";
import { getTodayIST } from "@/shared/lib/date";
import { formatAllottedId } from "@/shared/utils/displayId";
import type { CustomerProfile, MealPreference, MealType } from "@/shared/types";

interface Props {
  customer: CustomerProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (subscriptionId: string) => void;
}

export function AdminCreateSubscriptionModal({
  customer,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const { data: plans = [], isLoading: plansLoading } = useMealPlans();
  const createSubMutation = useAdminCreateSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(getTodayIST());
  const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly">("monthly");
  const [quantity, setQuantity] = useState<number>(1);
  const [autoRenew, setAutoRenew] = useState<boolean>(true);
  const [status, setStatus] = useState<"active" | "pending_payment">("active");

  // Address
  const customerAddresses = customer.addresses || [];
  const defaultAddressId = customer.defaultAddressId || customerAddresses[0]?.id || "";
  const [selectedAddressId, setSelectedAddressId] = useState<string>(defaultAddressId);
  const [newAddressLine1, setNewAddressLine1] = useState<string>("");
  const [newAddressPincode, setNewAddressPincode] = useState<string>("");

  // Meals selection state
  const [enabledMeals, setEnabledMeals] = useState<{
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
  }>({
    breakfast: true,
    lunch: true,
    dinner: false,
  });

  const [mealOptionSelections, setMealOptionSelections] = useState<
    Record<MealType, string | null>
  >({
    breakfast: null,
    lunch: null,
    dinner: null,
  });

  // Selected plan object
  const selectedPlan = useMemo(() => {
    return plans.find((p) => p.id === selectedPlanId) || plans[0] || null;
  }, [plans, selectedPlanId]);

  // Set default plan once loaded
  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  // When selected plan changes, sync default meal slots & options
  useEffect(() => {
    if (selectedPlan && selectedPlan.mealSlots) {
      const nextEnabled = { breakfast: false, lunch: false, dinner: false };
      const nextOptions: Record<MealType, string | null> = {
        breakfast: null,
        lunch: null,
        dinner: null,
      };

      selectedPlan.mealSlots.forEach((slot) => {
        nextEnabled[slot.mealType] = true;
        const activeOpts = (slot.options || []).filter((o) => o.isActive !== false);
        if (activeOpts.length > 0) {
          nextOptions[slot.mealType] = activeOpts[0].id;
        }
      });

      setEnabledMeals(nextEnabled);
      setMealOptionSelections(nextOptions);
    }
  }, [selectedPlan]);

  // Build active mealPreferences
  const currentMealPreferences = useMemo<MealPreference[]>(() => {
    const list: MealPreference[] = [];
    if (enabledMeals.breakfast) {
      list.push({ mealType: "breakfast", selectedOptionId: null });
    }
    if (enabledMeals.lunch) {
      list.push({
        mealType: "lunch",
        selectedOptionId: mealOptionSelections.lunch || null,
      });
    }
    if (enabledMeals.dinner) {
      list.push({
        mealType: "dinner",
        selectedOptionId: mealOptionSelections.dinner || null,
      });
    }
    return list;
  }, [enabledMeals, mealOptionSelections]);

  // Real-time Pricing Preview via E2 Authoritative PricingService
  const [previewDailyRate, setPreviewDailyRate] = useState<number>(0);
  const [pricingLoading, setPricingLoading] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    async function resolvePreviewPrice() {
      if (!selectedPlan || currentMealPreferences.length === 0) {
        setPreviewDailyRate(0);
        return;
      }
      setPricingLoading(true);
      try {
        const rate = await pricingService.calculateSubscriptionPrice(
          currentMealPreferences,
          startDate,
          selectedPlan.tier,
        );
        if (!isCancelled) {
          setPreviewDailyRate(rate);
        }
      } catch (err) {
        console.error("Failed to calculate preview price:", err);
      } finally {
        if (!isCancelled) setPricingLoading(false);
      }
    }

    resolvePreviewPrice();
    return () => {
      isCancelled = true;
    };
  }, [selectedPlan, currentMealPreferences, startDate]);

  if (!isOpen) return null;

  const deliveryDays = billingCycle === "weekly" ? 5 : 25;
  const cycleSubtotal = previewDailyRate * quantity * deliveryDays;
  const securityDeposit = 1000;
  const estimatedTotal = cycleSubtotal + (status === "active" ? securityDeposit : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlan) {
      alert("Please select a meal plan.");
      return;
    }
    if (currentMealPreferences.length === 0) {
      alert("Please select at least one meal preference (breakfast, lunch, or dinner).");
      return;
    }

    let finalAddressId = selectedAddressId;
    if (!finalAddressId) {
      if (!newAddressLine1 || !newAddressPincode) {
        alert("Please select or enter a delivery address.");
        return;
      }
      finalAddressId = `addr_${Date.now()}`;
    }

    createSubMutation.mutate(
      {
        customerId: customer.id,
        planId: selectedPlan.id,
        startDate,
        mealPreferences: currentMealPreferences,
        deliveryAddressId: finalAddressId,
        billingCycle,
        quantity,
        autoRenew,
        status,
      },
      {
        onSuccess: (newSubId) => {
          onSuccess?.(newSubId);
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-primary/10 flex justify-between items-start bg-primary/5 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-primary font-display">
                Create Subscription for Customer
              </h2>
              <Badge variant="default" className="text-[10px] font-mono font-bold">
                Admin Assisted
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Customer: <strong className="text-text">{customer.fullName}</strong> (
              {formatAllottedId(customer.displayId, customer.id, "customer")}) • {customer.phone || customer.email}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-primary hover:text-gold p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {/* Plan Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              1. Select Meal Plan *
            </label>
            {plansLoading ? (
              <div className="text-xs text-text-muted p-3 bg-surface-1 rounded-xl">
                Loading available plans...
              </div>
            ) : plans.length === 0 ? (
              <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 text-xs text-danger flex items-center gap-2">
                <AlertCircle size={16} />
                No active meal plans found in the system.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {plans.map((p) => {
                  const isSelected = p.id === (selectedPlan?.id || "");
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                          : "border-border hover:border-border-focus bg-surface-1/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-sm text-text">{p.name}</span>
                        <Badge variant="default" className="text-[10px] capitalize">
                          {p.tier}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-1 line-clamp-1">
                        {p.description || "Fresh nutritious daily home meals"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule & Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                Start Date *
              </label>
              <input
                type="date"
                name="startDate"
                required
                min={getTodayIST()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                Billing Cycle
              </label>
              <select
                name="billingCycle"
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as any)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
              >
                <option value="monthly">Monthly (25 delivery days)</option>
                <option value="weekly">Weekly (5 delivery days)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                Quantity (Persons)
              </label>
              <input
                type="number"
                name="quantity"
                required
                min="1"
                max="20"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm text-center font-mono font-bold"
              />
            </div>
          </div>

          {/* Meal Preferences Selection */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                2. Meal Slots & Preferences *
              </label>
              <span className="text-[11px] text-text-muted">
                {currentMealPreferences.length} meal slot(s) selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Breakfast Slot */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  enabledMeals.breakfast
                    ? "border-primary bg-primary/5"
                    : "border-border bg-surface-1/40 opacity-70"
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledMeals.breakfast}
                    onChange={(e) =>
                      setEnabledMeals((prev) => ({
                        ...prev,
                        breakfast: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-primary rounded"
                  />
                  <span className="font-bold text-sm text-text">Breakfast</span>
                </label>
                <p className="text-[11px] text-text-muted mt-1.5 pl-6">
                  Standard fresh morning menu
                </p>
              </div>

              {/* Lunch Slot */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  enabledMeals.lunch
                    ? "border-primary bg-primary/5"
                    : "border-border bg-surface-1/40 opacity-70"
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledMeals.lunch}
                    onChange={(e) =>
                      setEnabledMeals((prev) => ({
                        ...prev,
                        lunch: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-primary rounded"
                  />
                  <span className="font-bold text-sm text-text">Lunch</span>
                </label>
                {enabledMeals.lunch && selectedPlan?.mealSlots?.find((s) => s.mealType === "lunch")?.options && (
                  <div className="mt-2 pl-6">
                    <select
                      data-testid="select-option-lunch"
                      value={mealOptionSelections.lunch || ""}
                      onChange={(e) =>
                        setMealOptionSelections((prev) => ({
                          ...prev,
                          lunch: e.target.value || null,
                        }))
                      }
                      className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-card"
                    >
                      {selectedPlan.mealSlots
                        .find((s) => s.mealType === "lunch")!
                        .options.filter((opt) => opt.isActive !== false)
                        .map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dinner Slot */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  enabledMeals.dinner
                    ? "border-primary bg-primary/5"
                    : "border-border bg-surface-1/40 opacity-70"
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledMeals.dinner}
                    onChange={(e) =>
                      setEnabledMeals((prev) => ({
                        ...prev,
                        dinner: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-primary rounded"
                  />
                  <span className="font-bold text-sm text-text">Dinner</span>
                </label>
                {enabledMeals.dinner && selectedPlan?.mealSlots?.find((s) => s.mealType === "dinner")?.options && (
                  <div className="mt-2 pl-6">
                    <select
                      data-testid="select-option-dinner"
                      value={mealOptionSelections.dinner || ""}
                      onChange={(e) =>
                        setMealOptionSelections((prev) => ({
                          ...prev,
                          dinner: e.target.value || null,
                        }))
                      }
                      className="w-full text-xs h-8 px-2 rounded-lg border border-border bg-card"
                    >
                      {selectedPlan.mealSlots
                        .find((s) => s.mealType === "dinner")!
                        .options.filter((opt) => opt.isActive !== false)
                        .map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delivery Address & Settings */}
          <div className="space-y-3 pt-2 border-t border-border/60">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              3. Delivery Address *
            </label>
            {customerAddresses.length > 0 ? (
              <select
                name="deliveryAddressId"
                value={selectedAddressId}
                onChange={(e) => setSelectedAddressId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
              >
                {customerAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {addr.label}: {addr.line1}, {addr.city} ({addr.pincode})
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Address Line 1 *"
                  value={newAddressLine1}
                  onChange={(e) => setNewAddressLine1(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm sm:col-span-2"
                />
                <input
                  type="text"
                  placeholder="Pincode *"
                  value={newAddressPincode}
                  onChange={(e) => setNewAddressPincode(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm font-mono"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-text">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="w-4 h-4 text-primary rounded"
                />
                Auto-Renew at end of cycle
              </label>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-text-muted">Initial Status:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-text">
                  <input
                    type="radio"
                    name="status"
                    value="active"
                    checked={status === "active"}
                    onChange={() => setStatus("active")}
                    className="text-primary"
                  />
                  Active (Immediate)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-text">
                  <input
                    type="radio"
                    name="status"
                    value="pending_payment"
                    checked={status === "pending_payment"}
                    onChange={() => setStatus("pending_payment")}
                    className="text-primary"
                  />
                  Pending Payment
                </label>
              </div>
            </div>
          </div>

          {/* Pricing Summary (Authoritative E2 Pricing) */}
          <div className="bg-surface-2 rounded-xl p-4 border border-border space-y-2">
            <div className="flex items-center justify-between border-b border-border/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary font-display">
                <IndianRupee size={14} /> Pricing Summary (E2 Authoritative)
              </div>
              <span className="text-[10px] text-text-muted font-mono">
                Effective: {startDate} (IST)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div>
                <span className="text-[10px] text-text-muted block">Daily Per Person</span>
                <span className="font-bold text-text font-mono">
                  {pricingLoading ? "..." : `₹${previewDailyRate}`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Delivery Days</span>
                <span className="font-bold text-text font-mono">{deliveryDays} days</span>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Cycle Total</span>
                <span className="font-bold text-text font-mono">
                  {pricingLoading ? "..." : `₹${cycleSubtotal}`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">
                  {status === "active" ? "Total Incl. Deposit" : "Cycle Subtotal"}
                </span>
                <span className="font-black text-primary font-mono text-sm">
                  {pricingLoading ? "..." : `₹${estimatedTotal}`}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={createSubMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createSubMutation.isPending || currentMealPreferences.length === 0}
              className="flex-1"
            >
              {createSubMutation.isPending ? "Creating Subscription..." : "Create Subscription"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
