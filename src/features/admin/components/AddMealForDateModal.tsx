import { useState, useMemo } from "react";
import { format, addDays } from "date-fns";
import { X, CalendarPlus, AlertTriangle, Clock } from "lucide-react";
import { useAdminAddMealForDate } from "@/features/admin/hooks/useAdminCallCenter";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { MealBadge } from "@/shared/components/ui/MealBadge";
import { getTodayIST } from "@/shared/lib/date";
import { pricingService } from "@/shared/services/business/pricingService";
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import type { CustomerProfile, Subscription, MealType, Order } from "@/shared/types";

interface AddMealForDateModalProps {
  customer: CustomerProfile;
  subscription?: Subscription | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (order: Order) => void;
}

export function AddMealForDateModal({
  customer,
  subscription,
  isOpen,
  onClose,
  onSuccess,
}: AddMealForDateModalProps) {
  useScrollLock(isOpen);
  const addMealMutation = useAdminAddMealForDate();
  const todayIST = getTodayIST();

  const [date, setDate] = useState<string>(todayIST);
  const [mealType, setMealType] = useState<MealType>("lunch");

  // Cutoff checks for today
  const isToday = date === todayIST;

  const cutoffStatus = useMemo(() => {
    if (!isToday) return { passed: false, text: "Open (Future Date)" };
    try {
      operationalSettingsService.validateMealCutoff(mealType, date);
      return { passed: false, text: "Open (Before Cutoff)" };
    } catch (err: any) {
      return { passed: true, text: err?.message || "Cutoff Passed" };
    }
  }, [isToday, mealType, date]);

  // Price calculation
  const calculatedPrice = useMemo(() => {
    if (subscription) {
      return pricingService.calculateMealPrice(subscription, mealType, 1, date);
    }
    const matrix = pricingService.resolveSyncBasePricing(date, "regular");
    return (matrix as any)[mealType] ?? 0;
  }, [subscription, mealType, date]);

  const hasNegotiated = !!(
    subscription?.negotiatedPricing &&
    (subscription.negotiatedPricing as any)[mealType] !== undefined
  );

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      const order = await addMealMutation.mutateAsync({
        customerId: customer.id,
        subscriptionId: subscription?.id,
        date,
        mealType,
      });
      onSuccess?.(order);
      onClose();
    } catch {
      // Handled by hook toast
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full max-h-[90dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-primary font-display flex items-center gap-2">
              <CalendarPlus size={20} className="text-gold" /> Add Individual Meal
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Schedule a one-time meal for {customer.fullName} without changing subscription preferences.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text p-2 rounded-full hover:bg-surface-2 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Quick Date Shortcuts */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              Delivery Date
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDate(todayIST)}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                  date === todayIST
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-surface-1 text-text border-border hover:border-primary/40"
                }`}
              >
                Today ({format(new Date(), "MMM dd")})
              </button>
              <button
                type="button"
                onClick={() => setDate(format(addDays(new Date(), 1), "yyyy-MM-dd"))}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                  date === format(addDays(new Date(), 1), "yyyy-MM-dd")
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-surface-1 text-text border-border hover:border-primary/40"
                }`}
              >
                Tomorrow ({format(addDays(new Date(), 1), "MMM dd")})
              </button>
            </div>
            <input
              type="date"
              min={todayIST}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1.5 px-3 py-2 text-xs rounded-xl bg-surface-1 border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Meal Slot Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
              Select Meal
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
                const isSelected = mealType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMealType(type)}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                      isSelected
                        ? "bg-primary/10 border-primary ring-1 ring-primary text-primary"
                        : "bg-surface-1 border-border text-text hover:border-primary/40"
                    }`}
                  >
                    <MealBadge mealType={type} compact />
                    <span className="text-xs font-bold capitalize mt-0.5">{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cutoff Status Indicator */}
          {isToday && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                cutoffStatus.passed
                  ? "bg-danger/10 border-danger/20 text-danger"
                  : "bg-success/10 border-success/20 text-success"
              }`}
            >
              {cutoffStatus.passed ? (
                <AlertTriangle size={15} className="shrink-0" />
              ) : (
                <Clock size={15} className="shrink-0" />
              )}
              <span>{cutoffStatus.text}</span>
            </div>
          )}

          {/* Zone Coverage Notice if unassigned */}
          {!customer.zoneId && !subscription?.zoneId && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 rounded-xl p-2.5 text-[11px] flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                Customer has no explicit delivery zone. If their pincode is outside standard Mysuru coverage, assign a delivery zone in Customer Profile before ordering.
              </span>
            </div>
          )}

          {/* Summary / Pricing Breakdown */}
          <div className="bg-surface-2 rounded-xl p-3.5 border border-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Order Type:</span>
              <span className="font-semibold text-text">One-time Individual Meal</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Target Date:</span>
              <span className="font-semibold text-text">{format(new Date(`${date}T12:00:00`), "MMM dd, yyyy")}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-text font-bold">Meal Price:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary font-mono">₹{calculatedPrice}</span>
                {hasNegotiated && (
                  <Badge variant="warning" className="text-[9px] uppercase font-bold">
                    Negotiated
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-[10px] text-text-muted italic pt-1">
              This order will appear in Today's Meals or Upcoming Orders. The customer's default subscription meal preferences remain unchanged.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-primary/10 flex justify-end gap-3 bg-surface-1/50 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={addMealMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={
              !date ||
              (isToday && cutoffStatus.passed) ||
              addMealMutation.isPending
            }
          >
            {addMealMutation.isPending ? "Creating..." : "Confirm & Add Meal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
