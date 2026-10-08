import { useState } from "react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { subscriptionService } from "@/shared/services/business/subscriptionService";
import { orderService } from "@/shared/services/business/orderService";
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";
import { db } from "@/shared/lib/firebase";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/queryKeys";
import { toast } from "react-hot-toast";
import type { Subscription, MealType } from "@/shared/types";
import { getTodayInTimezone } from "@/shared/lib/date";
import { getModifiableMeals } from "@/shared/utils/dateUtils";
import { XCircle } from "lucide-react";

interface ResumeDeliveryModalProps {
  subscription: Subscription;
  onClose: () => void;
  nowOverride?: Date;
}

export function ResumeDeliveryModal({
  subscription,
  onClose,
  nowOverride,
}: ResumeDeliveryModalProps) {
  const today = getTodayInTimezone("Asia/Kolkata", nowOverride);
  const cutoffs = operationalSettingsService.getOperationalSettingsSync().cutoffs;

  // Canonical order: breakfast, lunch, dinner
  const allMealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
  const preferredMeals = allMealTypes.filter((meal) =>
    (subscription.mealPreferences || []).some((pref) => pref.mealType === meal),
  );

  const modifiableMealsToday = getModifiableMeals(
    today,
    preferredMeals,
    nowOverride,
  ) as MealType[];

  const resumedMealsToday = preferredMeals.filter((meal) =>
    modifiableMealsToday.includes(meal),
  );
  const skippedMealsToday = preferredMeals.filter(
    (meal) => !modifiableMealsToday.includes(meal),
  );
  const canResumeToday = resumedMealsToday.length > 0;

  const [resumeDate, setResumeDate] = useState<"today" | "tomorrow">(() =>
    canResumeToday ? "today" : "tomorrow",
  );
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleResume = async () => {
    setLoading(true);
    try {
      if (resumeDate === "today" && canResumeToday) {
        // Create skip record for missed meals today
        if (skippedMealsToday.length > 0) {
          const skipRef = doc(
            db,
            "subscriptions",
            subscription.id,
            "skips",
            today,
          );
          await setDoc(skipRef, {
            date: today,
            mealTypes: skippedMealsToday,
            reason: "Resumed late in the day",
            createdAt: serverTimestamp() as unknown as Timestamp,
            createdBy: subscription.customerId,
          });
        }

        // Safely restore remaining orders for today via unskipRequests queue and restoreOrdersForUnskipDay
        if (resumedMealsToday.length > 0) {
          const requestId = `${subscription.id}_${today}_${[...resumedMealsToday].sort().join("_")}_${Date.now()}`;
          await setDoc(doc(db, "unskipRequests", requestId), {
            customerId: subscription.customerId,
            subscriptionId: subscription.id,
            date: today,
            mealTypes: resumedMealsToday,
            status: "pending",
            createdAt: serverTimestamp(),
          });

          try {
            await orderService.restoreOrdersForUnskipDay(
              subscription.customerId,
              subscription.id,
              today,
              resumedMealsToday as any,
              false,
            );
          } catch (restoreErr) {
            console.warn("[ResumeDeliveryModal] restore existing orders warning:", restoreErr);
          }
        }

        // Resume subscription immediately
        await subscriptionService.resumeSubscription(subscription);
        toast.success("Subscription resumed for today!");
      } else {
        // Schedule resume for tomorrow by setting pause end date to today
        // (pauseEndDate is inclusive, so it resumes tomorrow)
        await subscriptionService.pauseSubscription(
          subscription,
          true,
          subscription.pauseStartDate || today,
          today,
        );
        toast.success("Subscription scheduled to resume tomorrow!");
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(subscription.customerId),
      });
      onClose();
    } catch (err) {
      console.error("Failed to resume delivery:", err);
      toast.error("Failed to resume delivery.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <Card className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-6 relative max-h-[90dvh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-2 right-2 sm:top-4 sm:right-4 text-ink-500 hover:text-ink-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <XCircle size={20} />
        </button>
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-2">
          Resume Subscription
        </h2>
        <p className="text-sm font-sans text-ink-600 mb-6">
          When would you like your meal deliveries to restart?
        </p>

        <div className="space-y-4 mb-4">
          {canResumeToday && (
            <label
              className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                resumeDate === "today"
                  ? "border-emerald-600 bg-emerald-50/20"
                  : "border-rice-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="resumeDate"
                  checked={resumeDate === "today"}
                  onChange={() => setResumeDate("today")}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <h4 className="font-sans font-bold text-ink-900 text-sm">
                    Resume Today
                  </h4>
                  <div className="text-ink-500 text-xs mt-1 space-y-1">
                    <p>
                      Resuming today:{" "}
                      <span className="font-bold text-emerald-700 capitalize">
                        {resumedMealsToday.join(" & ")}
                      </span>
                    </p>
                    {skippedMealsToday.length > 0 && (
                      <p className="text-amber-700">
                        Beginning tomorrow:{" "}
                        <span className="font-bold capitalize">
                          {skippedMealsToday.join(" & ")}
                        </span>{" "}
                        (past cutoff: {skippedMealsToday.map((m) => `${m} at ${cutoffs[m]} IST`).join(", ")})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </label>
          )}

          {!canResumeToday && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-sans mb-4">
              It is too late to resume deliveries for today. Operational cutoffs have passed (Breakfast: {cutoffs.breakfast} IST, Lunch: {cutoffs.lunch} IST, Dinner: {cutoffs.dinner} IST). All deliveries will begin tomorrow.
            </div>
          )}

          <label
            className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
              resumeDate === "tomorrow" || !canResumeToday
                ? "border-emerald-600 bg-emerald-50/20"
                : "border-rice-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="resumeDate"
                checked={resumeDate === "tomorrow" || !canResumeToday}
                onChange={() => setResumeDate("tomorrow")}
                disabled={!canResumeToday}
                className="mt-1 accent-emerald-600"
              />
              <div>
                <h4 className="font-sans font-bold text-ink-900 text-sm">
                  Resume Tomorrow
                </h4>
                <p className="text-ink-500 text-xs mt-1">
                  Deliveries will restart automatically starting tomorrow morning.
                </p>
              </div>
            </div>
          </label>
        </div>

        <div className="mb-6 p-3 bg-rice-50 border border-rice-200 rounded-xl text-[11px] text-ink-600 font-sans">
          <div className="font-semibold text-ink-800 mb-1">
            Authoritative Order Cutoffs (IST):
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white p-1.5 rounded border border-rice-200">
              <div className="font-medium text-ink-500 text-[10px] uppercase">
                Breakfast
              </div>
              <div className="font-bold text-ink-900">{cutoffs.breakfast} IST</div>
            </div>
            <div className="bg-white p-1.5 rounded border border-rice-200">
              <div className="font-medium text-ink-500 text-[10px] uppercase">
                Lunch
              </div>
              <div className="font-bold text-ink-900">{cutoffs.lunch} IST</div>
            </div>
            <div className="bg-white p-1.5 rounded border border-rice-200">
              <div className="font-medium text-ink-500 text-[10px] uppercase">
                Dinner
              </div>
              <div className="font-bold text-ink-900">{cutoffs.dinner} IST</div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1 font-sans min-h-[44px]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 font-sans min-h-[44px]"
            onClick={handleResume}
            isLoading={loading}
            disabled={
              loading ||
              (resumeDate === "today" && (!canResumeToday || resumedMealsToday.length === 0))
            }
          >
            Confirm Resume
          </Button>
        </div>
      </Card>
    </div>
  );
}
