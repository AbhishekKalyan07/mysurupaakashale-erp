import { useState } from "react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { getTodayIST } from "@/shared/utils/dateUtils";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";

export function PauseDeliveryModal({ subscription, onClose, skipDay }: any) {
  const todayStr = getTodayIST();
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  // Calculate tomorrow in IST
  const tomorrowObj = new Date(
    Date.UTC(todayYear, todayMonth - 1, todayDay + 1),
  );
  const minDateStr = tomorrowObj.toISOString().split("T")[0];

  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);

  // For future dates, all preferred meals are eligible
  const eligibleMealsForSelected = date
    ? (subscription.mealPreferences || []).map((p: any) => p.mealType)
    : [];

  const handlePause = async () => {
    if (!date || selectedMeals.length === 0) return;
    try {
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date,
        mealTypes: selectedMeals,
        reason: reason || "Customer requested pause",
      });
      toast.success("Delivery pause scheduled successfully.");
      onClose();
    } catch (err: any) {
      console.error("Failed to pause delivery:", err);
      toast.error(err?.message || "Failed to pause delivery.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-7 border border-primary/20 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold font-display text-primary">
            Schedule Pause
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm font-sans text-text-muted mb-6 font-medium leading-relaxed bg-primary/5 p-4 rounded-xl border border-primary/10">
          Select a future date to pause deliveries. You can choose which
          specific meals to cancel for that day.
        </p>

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
          Select Date
        </label>
        <input
          type="date"
          value={date}
          min={minDateStr}
          onChange={(e) => {
            const newDate = e.target.value;
            setDate(newDate);
            setSelectedMeals(
              newDate
                ? (subscription.mealPreferences || []).map(
                    (p: any) => p.mealType,
                  )
                : [],
            );
          }}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-6 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm font-data"
        />

        {date && eligibleMealsForSelected.length > 0 && (
          <div className="mb-6 bg-primary/5 p-4 rounded-xl border border-primary/10">
            <label className="block text-xs font-bold text-primary mb-3 font-sans uppercase tracking-wider">
              Select Meals to Cancel
            </label>
            <div className="space-y-3">
              {eligibleMealsForSelected.map((meal: string) => (
                <label
                  key={meal}
                  className="flex items-center gap-3 text-sm font-sans text-primary cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedMeals.includes(meal)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMeals([...selectedMeals, meal]);
                      } else {
                        setSelectedMeals(
                          selectedMeals.filter((m) => m !== meal),
                        );
                      }
                    }}
                    className="w-4 h-4 rounded border-primary/20 text-gold focus:ring-gold cursor-pointer"
                  />
                  <span className="capitalize font-bold">{meal}</span>
                </label>
              ))}
            </div>

            {(() => {
              const preferredMeals = (subscription?.mealPreferences || []).map(
                (p: any) => p.mealType,
              );
              const remainingMeals = preferredMeals.filter(
                (m: string) => !selectedMeals.includes(m),
              );
              const sortedRemaining = [];
              if (remainingMeals.includes("breakfast"))
                sortedRemaining.push("breakfast");
              if (remainingMeals.includes("lunch"))
                sortedRemaining.push("lunch");
              if (remainingMeals.includes("dinner"))
                sortedRemaining.push("dinner");
              const remainingKey = sortedRemaining.join("_");
              const matrix = subscription?.pricingMatrixSnapshot as
                | Record<string, number>
                | undefined;
              const remainingPrice =
                matrix && matrix[remainingKey] !== undefined
                  ? matrix[remainingKey] * (subscription.quantity || 1)
                  : sortedRemaining.length === 0
                    ? 0
                    : (subscription.pricePerDaySnapshot || 0) *
                      (subscription.quantity || 1);

              return (
                <div className="mt-4 pt-3 border-t border-primary/10 space-y-2">
                  {selectedMeals.length > 0 ? (
                    <div className="bg-primary/10 p-3 rounded-lg flex items-center justify-between">
                      <span className="text-xs font-sans text-primary font-medium">
                        Updated bill for this date:
                      </span>
                      <span className="font-bold font-mono text-sm text-primary">
                        ₹{remainingPrice}
                      </span>
                    </div>
                  ) : null}
                  <p className="text-xs font-sans text-text-muted">
                    {selectedMeals.length > 0 ? (
                      <>
                        You will only be billed for delivered meals. Cancelled
                        meals are not included.
                      </>
                    ) : (
                      <span className="text-danger font-medium">
                        Please select at least one meal to cancel.
                      </span>
                    )}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
          Reason (Optional)
        </label>
        <input
          type="text"
          value={reason}
          placeholder="e.g. Out of town"
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm placeholder:text-text-muted/50"
        />

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1 font-bold min-h-[44px]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 font-bold min-h-[44px]"
            onClick={handlePause}
            isLoading={skipDay.isPending}
            disabled={!date || selectedMeals.length === 0}
          >
            Confirm Pause
          </Button>
        </div>
      </div>
    </div>
  );
}
