import { useState, useMemo, useEffect } from "react";
import { X, IndianRupee, AlertCircle, Calendar, Sparkles, SlidersHorizontal } from "lucide-react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { QuantityStepper } from "@/shared/components/ui/QuantityStepper";
import { useMealPlans, isStandardPlan } from "@/features/customer/hooks/useMealPlans";
import { useAdminCreateSubscription } from "../hooks/useAdminSubscriptions";
import { pricingService } from "@/shared/services/business/pricingService";
import { getTodayIST, calculateSubscriptionEndDate } from "@/shared/lib/date";
import { formatAllottedId } from "@/shared/utils/displayId";
import { isMysuruCityPincode } from "@/shared/services/business/operationalRouter";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import type { CustomerProfile, MealPreference, MealType, MealPlanPricing } from "@/shared/types";

interface Props {
  customer: CustomerProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (subscriptionId: string) => void;
}

const PRICING_KEYS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "breakfast_lunch", label: "Breakfast + Lunch" },
  { key: "lunch_dinner", label: "Lunch + Dinner" },
  { key: "breakfast_dinner", label: "Breakfast + Dinner" },
  { key: "breakfast_lunch_dinner", label: "All 3 Meals" },
] as const;

function countActiveDeliveryDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  if (isNaN(sy) || isNaN(sm) || isNaN(sd) || isNaN(ey) || isNaN(em) || isNaN(ed)) return 0;
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  let count = 0;
  while (cur <= end) {
    if (cur.getUTCDay() !== 0) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function AdminCreateSubscriptionModal({
  customer,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  useScrollLock(isOpen);
  const { data: rawPlans = [], isLoading: plansLoading } = useMealPlans();
  const plans = useMemo(() => (rawPlans || []).filter(isStandardPlan), [rawPlans]);
  const createSubMutation = useAdminCreateSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(getTodayIST());
  const [dateMode, setDateMode] = useState<"preset" | "custom">("preset");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly">("monthly");
  const [quantity, setQuantity] = useState<number>(1);
  const [autoRenew, setAutoRenew] = useState<boolean>(true);
  const [status, setStatus] = useState<"active" | "pending_payment">("active");

  // Negotiated Pricing state
  const [useNegotiated, setUseNegotiated] = useState<boolean>(false);
  const [negotiatedValues, setNegotiatedValues] = useState<Record<string, string>>({
    breakfast: "",
    lunch: "",
    dinner: "",
    breakfast_lunch: "",
    lunch_dinner: "",
    breakfast_dinner: "",
    breakfast_lunch_dinner: "",
  });

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

  // Selected plan object (filtered automatically to Basic and Regular via useMealPlans)
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

  // Parse negotiated pricing values
  const parsedNegotiated = useMemo<MealPlanPricing | null>(() => {
    if (!useNegotiated) return null;
    const res: Record<string, number> = {};
    let hasAny = false;
    for (const [key, val] of Object.entries(negotiatedValues)) {
      if (val.trim() !== "") {
        const num = Number(val);
        if (Number.isFinite(num) && num >= 0) {
          res[key] = num;
          hasAny = true;
        }
      }
    }
    return hasAny ? (res as unknown as MealPlanPricing) : null;
  }, [useNegotiated, negotiatedValues]);

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
          parsedNegotiated,
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
  }, [selectedPlan, currentMealPreferences, startDate, parsedNegotiated]);

  // Auto-fill negotiated pricing values from current plan's pricingMatrix
  const handleFillPlanDefaults = () => {
    if (!selectedPlan?.pricingMatrix) return;
    const matrix = selectedPlan.pricingMatrix as any;
    setNegotiatedValues({
      breakfast: matrix.breakfast !== undefined ? String(matrix.breakfast) : "",
      lunch: matrix.lunch !== undefined ? String(matrix.lunch) : "",
      dinner: matrix.dinner !== undefined ? String(matrix.dinner) : "",
      breakfast_lunch: matrix.breakfast_lunch !== undefined ? String(matrix.breakfast_lunch) : "",
      lunch_dinner: matrix.lunch_dinner !== undefined ? String(matrix.lunch_dinner) : "",
      breakfast_dinner: matrix.breakfast_dinner !== undefined ? String(matrix.breakfast_dinner) : "",
      breakfast_lunch_dinner: matrix.breakfast_lunch_dinner !== undefined ? String(matrix.breakfast_lunch_dinner) : "",
    });
  };

  const computedPresetEndDate = useMemo(() => {
    return calculateSubscriptionEndDate(startDate, billingCycle);
  }, [startDate, billingCycle]);

  const effectiveEndDate = dateMode === "custom" ? customEndDate : computedPresetEndDate;

  const deliveryDays = useMemo(() => {
    if (dateMode === "preset") {
      return billingCycle === "weekly" ? 5 : 25;
    }
    return countActiveDeliveryDays(startDate, customEndDate);
  }, [dateMode, billingCycle, startDate, customEndDate]);

  if (!isOpen) return null;

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

    if (dateMode === "custom") {
      if (!customEndDate) {
        alert("Please enter a custom end date.");
        return;
      }
      if (customEndDate < startDate) {
        alert("Subscription end date cannot be earlier than start date.");
        return;
      }
    }

    if (useNegotiated) {
      for (const [key, val] of Object.entries(negotiatedValues)) {
        if (val.trim() !== "") {
          const num = Number(val);
          if (!Number.isFinite(num) || num < 0) {
            alert(`Invalid negotiated price for '${key}'. Must be a non-negative finite number.`);
            return;
          }
        }
      }
    }

    let finalAddressId = selectedAddressId;
    if (finalAddressId) {
      const chosenAddress = customerAddresses.find((a) => a.id === selectedAddressId);
      if (chosenAddress?.pincode && !isMysuruCityPincode(chosenAddress.pincode.trim())) {
        alert(
          `Cannot create subscription: The selected address pincode '${chosenAddress.pincode}' is outside the Mysuru City service area (570001–570032).`,
        );
        return;
      }
    } else {
      if (!newAddressLine1 || !newAddressPincode) {
        alert("Please select or enter a delivery address.");
        return;
      }
      if (!isMysuruCityPincode(newAddressPincode.trim())) {
        alert(
          `Cannot create subscription: Pincode '${newAddressPincode.trim()}' is outside the Mysuru City service area (570001–570032).`,
        );
        return;
      }
      finalAddressId = `addr_${Date.now()}`;
    }

    createSubMutation.mutate(
      {
        customerId: customer.id,
        planId: selectedPlan.id,
        startDate,
        endDate: effectiveEndDate || null,
        mealPreferences: currentMealPreferences,
        deliveryAddressId: finalAddressId,
        billingCycle,
        quantity,
        autoRenew: dateMode === "custom" ? false : autoRenew,
        status,
        negotiatedPricing: parsedNegotiated,
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
          {/* Plan Selection (Only Basic and Regular) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                1. Select Meal Plan (Basic / Regular) *
              </label>
              <span className="text-[11px] text-text-muted">Standard tiers only</span>
            </div>
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
                      data-testid={`plan-select-card-${p.id}`}
                      aria-selected={isSelected}
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
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
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">
                        {p.description || "Fresh nutritious daily home meals"}
                      </p>
                      <div className="mt-2 pt-2 border-t border-border/40 text-xs font-semibold text-primary">
                        From ₹{p.pricePerDay}/day
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule, Custom Dates & Quantity Stepper */}
          <div className="p-4 rounded-xl border border-border bg-surface-1/40 space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Calendar size={14} className="text-primary" /> 2. Schedule & Duration
              </label>
              <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDateMode("preset")}
                  className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                    dateMode === "preset"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Preset Cycle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode("custom");
                    if (!customEndDate) setCustomEndDate(computedPresetEndDate);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                    dateMode === "custom"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  Custom Date Range
                </button>
              </div>
            </div>

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

              {dateMode === "preset" ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                    Preset Cycle
                  </label>
                  <select
                    name="billingCycle"
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  >
                    <option value="monthly">Monthly (~25 delivery days)</option>
                    <option value="weekly">Weekly (5 delivery days)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                    Custom End Date *
                  </label>
                  <input
                    type="date"
                    name="customEndDate"
                    required
                    min={startDate}
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-1">
                  Quantity (Persons)
                </label>
                <QuantityStepper
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={20}
                  unitLabel="Person"
                />
              </div>
            </div>

            <div className="text-[11px] text-text-muted flex items-center justify-between border-t border-border/40 pt-2">
              <span>
                Effective Duration: <strong className="text-text">{startDate}</strong> to{" "}
                <strong className="text-text">{effectiveEndDate || "—"}</strong>
              </span>
              <span>
                Active Delivery Days (excl. Sundays): <strong className="text-primary">{deliveryDays} days</strong>
              </span>
            </div>
          </div>

          {/* Negotiated Customer Pricing (Optional Admin Feature) */}
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useNegotiated}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseNegotiated(checked);
                    if (checked && !Object.values(negotiatedValues).some((v) => v !== "")) {
                      handleFillPlanDefaults();
                    }
                  }}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <SlidersHorizontal size={14} /> Negotiated Customer Pricing (Optional)
                </span>
              </label>

              {useNegotiated && (
                <button
                  type="button"
                  onClick={handleFillPlanDefaults}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <Sparkles size={12} /> Reset to Plan Defaults
                </button>
              )}
            </div>

            {useNegotiated ? (
              <div className="space-y-2.5 pt-1">
                <p className="text-[11px] text-text-muted">
                  Specify agreed rates for this customer subscription. This will override the standard plan pricing snapshot without modifying global plan catalogs.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {PRICING_KEYS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] font-semibold text-text-muted block truncate" title={label}>
                        {label} (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 75"
                        value={negotiatedValues[key] || ""}
                        onChange={(e) =>
                          setNegotiatedValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-mono font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-text-muted">
                Using standard {selectedPlan?.name || "plan"} catalog rates. Enable to define custom negotiated meal pricing.
              </p>
            )}
          </div>

          {/* Meal Preferences Selection */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                3. Meal Slots & Preferences *
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
                {enabledMeals.lunch && (
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
                      className="w-full text-xs h-7 px-2 rounded-lg border border-border bg-card"
                    >
                      {selectedPlan?.mealSlots
                        ?.find((s) => s.mealType === "lunch")
                        ?.options?.filter((o) => o.isActive !== false)
                        ?.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
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
                {enabledMeals.dinner && (
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
                      className="w-full text-xs h-7 px-2 rounded-lg border border-border bg-card"
                    >
                      {selectedPlan?.mealSlots
                        ?.find((s) => s.mealType === "dinner")
                        ?.options?.filter((o) => o.isActive !== false)
                        ?.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delivery Address Selection */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              4. Delivery Address *
            </label>
            {customerAddresses.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                >
                  {customerAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.line1}, {addr.city} ({addr.pincode}){" "}
                      {addr.id === customer.defaultAddressId ? "— (Default)" : ""}
                    </option>
                  ))}
                  <option value="">+ Add / Enter Different Address</option>
                </select>
              </div>
            ) : (
              <div className="p-3 bg-surface-1 rounded-xl text-xs text-text-muted">
                No existing address found on customer profile. Please enter below:
              </div>
            )}

            {!selectedAddressId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <input
                  type="text"
                  placeholder="Address Line 1 (Street, Door No)"
                  value={newAddressLine1}
                  onChange={(e) => setNewAddressLine1(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  required
                />
                <input
                  type="text"
                  placeholder="Pincode (e.g. 570001)"
                  value={newAddressPincode}
                  onChange={(e) => setNewAddressPincode(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  required
                />
              </div>
            )}
          </div>

          {/* Configuration Options */}
          <div className="pt-2 border-t border-border/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text">
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
                Effective: {startDate} (IST) {useNegotiated ? "• Negotiated" : ""}
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
