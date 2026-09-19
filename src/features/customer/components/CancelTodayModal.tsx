import { useState } from "react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { getTodayIST } from "@/shared/utils/dateUtils";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";

export function CancelTodayModal({ subscription, onClose, skipDay }: any) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const currentHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0",
    10,
  );
  const currentMinute = parseInt(
    parts.find((p) => p.type === "minute")?.value || "0",
    10,
  );
  const timeInMinutes = currentHour * 60 + currentMinute;

  const todayStr = getTodayIST();

  const preferredMeals = (subscription.mealPreferences || []).map(
    (p: any) => p.mealType,
  );
  const eligibleMeals = preferredMeals.filter((meal: string) => {
    if (meal === "breakfast") return timeInMinutes < 5 * 60;
    if (meal === "lunch") return timeInMinutes < 10 * 60 + 30;
    if (meal === "dinner") return timeInMinutes < 16 * 60;
    return true;
  });

  const [selectedMeals, setSelectedMeals] = useState<string[]>(eligibleMeals);
  const [reason, setReason] = useState("");

  const handleCancel = async () => {
    if (selectedMeals.length === 0) return;
    try {
      await skipDay.mutateAsync({
        subscriptionId: subscription.id,
        date: todayStr,
        mealTypes: selectedMeals,
        reason: reason || "Customer requested same-day cancel",
      });
      toast.success("Meal cancellation recorded for today.");
      onClose();
    } catch (err: any) {
      console.error("Failed to cancel today:", err);
      toast.error(err?.message || "Failed to cancel today.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-7 border border-primary/20 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold font-display text-danger">
            Cancel Today's Meals
          </h2>
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
              It is too late to cancel any meals for today based on the cut-off
              times.
            </p>
          </div>
        ) : (
          <div className="mb-6 bg-primary/5 p-4 rounded-xl border border-primary/10">
            <p className="text-sm font-sans text-text-muted mb-4 font-medium leading-relaxed">
              Select which meals you want to cancel for today.
            </p>
            <div className="space-y-3">
              {eligibleMeals.map((meal: string) => (
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
                    className="w-4 h-4 rounded border-primary/20 text-danger focus:ring-danger cursor-pointer"
                  />
                  <span className="capitalize font-bold">{meal}</span>
                </label>
              ))}
            </div>
            {(() => {
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
                        Updated bill for today:
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

        {eligibleMeals.length > 0 && (
          <>
            <label className="block text-xs font-bold text-primary mb-2 font-sans uppercase tracking-wider">
              Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              placeholder="e.g. Eating out"
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-primary/20 rounded-xl px-4 py-3 text-sm font-sans mb-8 bg-background text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm placeholder:text-text-muted/50"
            />
          </>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1 font-bold min-h-[44px]"
            onClick={onClose}
          >
            Close
          </Button>
          {eligibleMeals.length > 0 && (
            <Button
              className="flex-1 font-bold min-h-[44px] !bg-danger hover:!bg-danger-dark !text-white !border-danger-dark"
              onClick={handleCancel}
              isLoading={skipDay.isPending}
              disabled={selectedMeals.length === 0}
            >
              Confirm Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
