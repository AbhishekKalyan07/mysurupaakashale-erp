import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Utensils,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  RefreshCw,
  PackageOpen,
  X,
  Sliders,
  DollarSign,
} from "lucide-react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { StatusChip } from "@/shared/components/ui/StatusChip";
import { MealBadge } from "@/shared/components/ui/MealBadge";
import { getTodayIST, getModifiableMeals } from "@/shared/utils/dateUtils";
import { pricingService, type AddonItem } from "@/shared/services/business/pricingService";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { orderRepository } from "@/shared/services/firestore/orderRepository";
import { mealPlanRepository } from "@/shared/services/firestore/mealPlanRepository";
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";
import {
  useAdminRemoveTodayMeal,
  useAdminAddTodayMeal,
  useAdminChangeTodayMealOption,
  useAdminAddTodayAddon,
} from "../hooks/useAdminCallCenter";
import { useAddons } from "../hooks/useAdminAddons";
import type {
  CustomerProfile,
  Subscription,
  Order,
  MealPlan,
  MealType,
  MealOption,
} from "@/shared/types";
import { formatAllottedId } from "@/shared/utils/displayId";

const MEAL_SLOTS: MealType[] = ["breakfast", "lunch", "dinner"];

interface CustomerTodayMealsTabProps {
  customer: CustomerProfile;
}

export function CustomerTodayMealsTab({ customer }: CustomerTodayMealsTabProps) {
  const todayStr = getTodayIST();

  // Queries
  const {
    data: subscriptions = [],
    isLoading: loadingSubs,
    refetch: refetchSubs,
  } = useQuery({
    queryKey: ["subscriptions", "customer", customer.id],
    queryFn: () => subscriptionRepository.getByCustomerId(customer.id),
  });

  const queryClient = useQueryClient();

  const {
    data: todayOrders = [],
    isLoading: loadingOrders,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["customer-today-orders", customer.id, todayStr],
    queryFn: () => orderRepository.getCustomerOrdersByDate(customer.id, todayStr),
  });

  // Real-time synchronization: listen to customer order events so changes made by
  // the customer, kitchen, or delivery partner reflect instantly without manual refresh.
  useEffect(() => {
    if (!customer?.id) return;
    const unsub = orderRepository.subscribeToCustomerOrders(customer.id, (orders) => {
      const todayOnly = orders.filter((o) => o.date === todayStr);
      queryClient.setQueryData(["customer-today-orders", customer.id, todayStr], todayOnly);
    });
    return () => unsub();
  }, [customer?.id, todayStr, queryClient]);

  const { data: plans = [] } = useQuery({
    queryKey: ["mealPlans"],
    queryFn: () => mealPlanRepository.list(),
  });

  // Active or paused subscription for customer
  const activeSub =
    subscriptions.find((s) => s.status === "active") ||
    subscriptions.find((s) => s.status === "paused") ||
    subscriptions[0];

  const currentPlan = activeSub
    ? plans.find((p) => p.id === activeSub.planId)
    : undefined;

  // Mutations
  const removeMealMutation = useAdminRemoveTodayMeal();
  const addMealMutation = useAdminAddTodayMeal();
  const changeOptionMutation = useAdminChangeTodayMealOption();
  const addAddonMutation = useAdminAddTodayAddon();

  // Modal states
  const [removeModalState, setRemoveModalState] = useState<{
    isOpen: boolean;
    mealType: MealType;
    order?: Order;
  }>({ isOpen: false, mealType: "lunch" });

  const [addMealModalState, setAddMealModalState] = useState<{
    isOpen: boolean;
    mealType: MealType;
  }>({ isOpen: false, mealType: "lunch" });

  const [changeOptionModalState, setChangeOptionModalState] = useState<{
    isOpen: boolean;
    mealType: MealType;
    order?: Order;
  }>({ isOpen: false, mealType: "lunch" });

  const [addonModalOpen, setAddonModalOpen] = useState(false);

  // Locked statuses aligned with orderService
  const lockedKitchenStatuses = ["preparing", "packing", "packed", "ready_for_pickup"];
  const lockedOperationalStatuses = [
    "picked_up",
    "out_for_delivery",
    "delivered",
    "failed_delivery",
    "returned_delivery",
  ];

  if (loadingSubs || loadingOrders) {
    return (
      <div className="p-8 text-center text-sm font-medium text-text-muted flex flex-col items-center gap-2">
        <RefreshCw size={24} className="animate-spin text-primary" />
        <span>Loading customer call-center desk...</span>
      </div>
    );
  }

  if (!activeSub) {
    return (
      <div className="p-8 text-center text-text-muted bg-surface-1 rounded-2xl border border-border">
        <PackageOpen size={36} className="mx-auto mb-3 opacity-30 text-primary" />
        <h3 className="font-bold text-base text-text">No Subscription Found</h3>
        <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
          Customer {customer.fullName} does not have an active or paused subscription.
          Call-center meal operations require a valid subscription.
        </p>
      </div>
    );
  }

  // Split today's orders into subscription meal orders and add-on orders
  const subscriptionOrders = todayOrders.filter((o) => !o.isAddon);
  const addonOrders = todayOrders.filter((o) => o.isAddon);

  const preferredMeals = (activeSub.mealPreferences || []).map((p) => p.mealType);
  const modifiableMeals = getModifiableMeals(todayStr, MEAL_SLOTS);
  const isNotStarted = !!(activeSub.startDate && activeSub.startDate > todayStr);
  const isExpired = !!(activeSub.endDate && activeSub.endDate < todayStr);
  const isInactive = activeSub.status !== "active" && activeSub.status !== "paused";
  const isSubscriptionOperable = !isNotStarted && !isExpired && !isInactive;

  return (
    <div className="space-y-6">
      {/* Call-Center Header Banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-gold/10 rounded-2xl p-4 sm:p-5 border border-primary/20 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-primary text-background font-bold">
                <Utensils size={16} />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-primary font-display">
                Today's Meals
              </h3>
              <Badge variant="default" className="text-[10px] uppercase font-bold tracking-wider">
                Admin Mode
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Live operational changes for customer{" "}
              <strong className="text-primary">{customer.fullName}</strong> (
              <span className="font-mono">
                {formatAllottedId(customer.displayId, customer.id, "customer")}
              </span>
              ) on <strong className="text-primary">{todayStr}</strong> (Asia/Kolkata).
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchOrders();
                refetchSubs();
              }}
              className="text-xs text-primary flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!isSubscriptionOperable}
              onClick={() => setAddonModalOpen(true)}
              className="text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Plus size={14} /> Add Today's Add-on
            </Button>
          </div>
        </div>

        {!isSubscriptionOperable && (
          <div className="mt-3 p-2.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {isInactive
                ? `Subscription is ${activeSub.status}. Daily meal operations are restricted to active or paused plans.`
                : isNotStarted
                  ? `Subscription starts on ${activeSub.startDate}. Operations for today (${todayStr}) are not permitted.`
                  : `Subscription ended on ${activeSub.endDate}. No active operations available.`}
            </span>
          </div>
        )}

        {/* Subscription Snapshot Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-primary/10 text-xs">
          <div>
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
              Plan
            </span>
            <span className="font-bold text-primary capitalize">
              {activeSub.planTier} Plan {currentPlan ? `(${currentPlan.name})` : ""}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
              Status
            </span>
            <span className="font-semibold capitalize text-primary flex items-center gap-1">
              <StatusChip status={activeSub.status as any} size="sm" />
            </span>
          </div>
          <div>
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
              Auto-Renew
            </span>
            <span className="font-bold text-primary">
              {activeSub.autoRenew ? "Enabled" : "Off"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
              Day Snapshot Rate
            </span>
            <span className="font-bold text-primary font-mono">
              ₹{activeSub.pricePerDaySnapshot || 0} / day
            </span>
          </div>
        </div>

        {/* Cutoff Policy Notice */}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-2.5 border-t border-primary/5 text-[11px] text-text-muted font-medium">
          <span className="flex items-center gap-1 text-primary font-bold">
            <Clock size={12} className="text-gold" /> Cutoffs:
          </span>
          <span className={modifiableMeals.includes("breakfast") ? "text-success" : "text-text-muted line-through"}>
            Breakfast &lt; {operationalSettingsService.getMealCutoffSync("breakfast")}
          </span>
          <span>•</span>
          <span className={modifiableMeals.includes("lunch") ? "text-success" : "text-text-muted line-through"}>
            Lunch &lt; {operationalSettingsService.getMealCutoffSync("lunch")}
          </span>
          <span>•</span>
          <span className={modifiableMeals.includes("dinner") ? "text-success" : "text-text-muted line-through"}>
            Dinner &lt; {operationalSettingsService.getMealCutoffSync("dinner")}
          </span>
        </div>
      </div>

      {/* ── SECTION 1: TODAY'S SUBSCRIPTION MEALS ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-wider text-text flex items-center gap-2">
            <Utensils size={15} className="text-primary" /> Today's Meals (Subscription)
          </h4>
          <span className="text-xs text-text-muted">
            {preferredMeals.join(", ") || "No meal preferences set"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MEAL_SLOTS.map((mealType) => {
            const isSubscribed = preferredMeals.includes(mealType);
            const order = subscriptionOrders.find((o) => o.mealType === mealType);
            const isScheduled = !!order && order.status !== "cancelled" && order.status !== "skipped";
            const isCancelled = !!order && (order.status === "cancelled" || order.status === "skipped");
            const isCutoffPassed = !modifiableMeals.includes(mealType);
            const isKitchenLocked = order && lockedKitchenStatuses.includes(order.kitchenStatus || "");
            const isDeliveryLocked = order && lockedOperationalStatuses.includes(order.status);
            const isLocked = isKitchenLocked || isDeliveryLocked;

            const mealPrice = pricingService.calculateMealPrice(activeSub, mealType);
            const slotConfig = (currentPlan?.mealSlots || []).find((s) => s.mealType === mealType);
            const supportsOptions =
              (mealType === "lunch" || mealType === "dinner") &&
              (slotConfig?.options || []).length > 1;

            return (
              <div
                key={mealType}
                className={`rounded-2xl p-4 border transition-all flex flex-col justify-between min-h-[190px] ${
                  isScheduled
                    ? "bg-card border-primary/20 shadow-xs"
                    : isCancelled
                      ? "bg-surface-1/70 border-border opacity-85"
                      : "bg-surface-1/40 border-dashed border-border"
                }`}
              >
                {/* Meal Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <MealBadge mealType={mealType} />
                    {isScheduled ? (
                      <Badge variant="success" className="text-[10px] font-bold uppercase tracking-wider">
                        Scheduled
                      </Badge>
                    ) : isCancelled ? (
                      <Badge variant="danger" className="text-[10px] font-bold uppercase tracking-wider">
                        Cancelled
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                        Not Scheduled
                      </Badge>
                    )}
                  </div>

                  {/* Order & Meal Info */}
                  <div className="space-y-1 mt-2">
                    <div className="text-sm font-bold text-text truncate">
                      {isScheduled && order
                        ? order.mealName || `${mealType.toUpperCase()} Meal`
                        : isCancelled
                          ? "Meal Cancelled Today"
                          : isSubscribed
                            ? "Not Scheduled for Today"
                            : "Not Included in Plan"}
                    </div>

                    <div className="flex items-center justify-between text-xs text-text-muted pt-1">
                      <span>Rate: <strong className="font-mono text-text">₹{order?.price || mealPrice}</strong></span>
                      {order && <StatusChip status={order.status} size="sm" />}
                    </div>

                    {order && order.id && (
                      <div className="text-[11px] text-text-muted font-mono truncate">
                        ID: {order.id.slice(0, 16)}...
                      </div>
                    )}

                    {isLocked && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-warning mt-1">
                        <AlertCircle size={12} />
                        <span>{isKitchenLocked ? "Kitchen In-Prep / Packed" : "Out for Delivery"}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Available Actions */}
                <div className="pt-3 border-t border-border/50 mt-3 space-y-1.5">
                  {isScheduled ? (
                    <div className="flex flex-col gap-1.5">
                      {supportsOptions && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isSubscriptionOperable || isCutoffPassed || isLocked}
                          onClick={() =>
                            setChangeOptionModalState({
                              isOpen: true,
                              mealType,
                              order,
                            })
                          }
                          className="w-full text-xs text-gold border border-gold/30 hover:bg-gold/10 min-h-[32px] justify-center"
                        >
                          <Sliders size={13} className="mr-1" /> Change Option
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isSubscriptionOperable || isCutoffPassed || isLocked || removeMealMutation.isPending}
                        onClick={() =>
                          setRemoveModalState({
                            isOpen: true,
                            mealType,
                            order,
                          })
                        }
                        className="w-full text-xs text-danger border border-danger/30 hover:bg-danger/10 min-h-[32px] justify-center"
                      >
                        <Trash2 size={13} className="mr-1" /> Remove {mealType}
                      </Button>
                    </div>
                  ) : isSubscribed ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!isSubscriptionOperable || isCutoffPassed || addMealMutation.isPending}
                      onClick={() =>
                        setAddMealModalState({
                          isOpen: true,
                          mealType,
                        })
                      }
                      className="w-full text-xs min-h-[32px] justify-center"
                    >
                      <Plus size={13} className="mr-1" /> Add {mealType}
                    </Button>
                  ) : (
                    <div className="text-[11px] text-text-muted italic text-center py-1">
                      Meal not in preferences
                    </div>
                  )}

                  {!isSubscriptionOperable ? (
                    <div className="text-[10px] text-warning font-medium text-center">
                      Subscription inactive today
                    </div>
                  ) : isCutoffPassed ? (
                    <div className="text-[10px] text-danger font-medium text-center">
                      Cutoff passed for today
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 2: TODAY'S ADD-ONS ────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-wider text-text flex items-center gap-2">
            <DollarSign size={15} className="text-primary" /> Today's Add-ons (Separate Catalog)
          </h4>
          <Button
            variant="ghost"
            size="sm"
            disabled={!isSubscriptionOperable || modifiableMeals.length === 0}
            onClick={() => setAddonModalOpen(true)}
            className="text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            + Add Add-on
          </Button>
        </div>

        {addonOrders.length === 0 ? (
          <div className="p-5 text-center text-text-muted bg-surface-1/50 rounded-xl border border-dashed border-border text-xs">
            No add-ons scheduled for today ({todayStr}).
          </div>
        ) : (
          <div className="space-y-2">
            {addonOrders.map((addonOrder) => {
              const qty = addonOrder.mealQuantity || addonOrder.addonQuantity || 1;
              const unitPrice =
                addonOrder.addonUnitPrice ||
                Math.round((addonOrder.price || 0) / qty);

              return (
                <div
                  key={addonOrder.id}
                  className="bg-card rounded-xl p-3 border border-border flex items-center justify-between gap-3 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Badge variant="warning" className="text-[9px] uppercase tracking-wider font-bold shrink-0">
                      Add-on
                    </Badge>
                    <MealBadge mealType={addonOrder.mealType} compact />
                    <div className="min-w-0">
                      <div className="font-bold text-text truncate">
                        {addonOrder.addonName || addonOrder.mealName}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono">
                        {qty} × ₹{unitPrice} = ₹{addonOrder.price} • ID: {addonOrder.id.slice(0, 10)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-primary font-mono">
                        ₹{addonOrder.price}
                      </div>
                      <div className="text-[9px] text-text-muted uppercase">
                        Billed to Invoice
                      </div>
                    </div>
                    <StatusChip status={addonOrder.status} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL 1: REMOVE MEAL CONFIRMATION ──────────────────────────────── */}
      {removeModalState.isOpen && (
        <div
          role="dialog"
          aria-labelledby="remove-meal-title"
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            if (!removeMealMutation.isPending) {
              setRemoveModalState({ isOpen: false, mealType: "lunch" });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !removeMealMutation.isPending) {
              setRemoveModalState({ isOpen: false, mealType: "lunch" });
            }
          }}
          tabIndex={-1}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-danger/30 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="remove-meal-title" className="text-lg font-bold text-danger font-display flex items-center gap-2">
                <Trash2 size={18} /> Remove Today's {removeModalState.mealType}
              </h3>
              <button
                disabled={removeMealMutation.isPending}
                onClick={() => setRemoveModalState({ isOpen: false, mealType: "lunch" })}
                className="text-text-muted hover:text-primary p-1 rounded-full disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-text-muted space-y-2">
              <p>
                Admin action on behalf of calling customer:{" "}
                <strong className="text-text">{customer.fullName}</strong>.
              </p>
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-muted">Meal Slot:</span>
                  <span className="font-bold text-text capitalize">{removeModalState.mealType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Date:</span>
                  <span className="font-bold text-text">{todayStr}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-danger/20">
                  <span className="text-danger font-bold">Cancellation Adjustment:</span>
                  <span className="font-bold text-danger font-mono text-sm">
                    ₹{pricingService.calculateCancellationAmount(activeSub, [removeModalState.mealType])}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-text-muted italic">
                * Cancellation financial impact is calculated authoritatively from canonical pricing rules. Admin cannot enter manual amounts.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                className="flex-1 text-xs"
                disabled={removeMealMutation.isPending}
                onClick={() => setRemoveModalState({ isOpen: false, mealType: "lunch" })}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1 text-xs"
                disabled={removeMealMutation.isPending}
                onClick={async () => {
                  try {
                    await removeMealMutation.mutateAsync({
                      subscriptionId: activeSub.id,
                      mealType: removeModalState.mealType,
                    });
                    setRemoveModalState({ isOpen: false, mealType: "lunch" });
                  } catch {
                    // Handled by mutation onError toast
                  }
                }}
              >
                {removeMealMutation.isPending ? "Removing..." : "Confirm Removal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: ADD TODAY'S MEAL CONFIRMATION ──────────────────────────── */}
      {addMealModalState.isOpen && (
        <div
          role="dialog"
          aria-labelledby="add-meal-title"
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            if (!addMealMutation.isPending) {
              setAddMealModalState({ isOpen: false, mealType: "lunch" });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !addMealMutation.isPending) {
              setAddMealModalState({ isOpen: false, mealType: "lunch" });
            }
          }}
          tabIndex={-1}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-primary/30 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="add-meal-title" className="text-lg font-bold text-primary font-display flex items-center gap-2">
                <Plus size={18} /> Add Today's {addMealModalState.mealType}
              </h3>
              <button
                disabled={addMealMutation.isPending}
                onClick={() => setAddMealModalState({ isOpen: false, mealType: "lunch" })}
                className="text-text-muted hover:text-primary p-1 rounded-full disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-text-muted space-y-2">
              <p>
                Scheduling meal delivery on behalf of customer:{" "}
                <strong className="text-text">{customer.fullName}</strong>.
              </p>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-muted">Meal Slot:</span>
                  <span className="font-bold text-text capitalize">{addMealModalState.mealType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Date:</span>
                  <span className="font-bold text-text">{todayStr}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-primary/10">
                  <span className="text-primary font-bold">Authoritative Meal Rate:</span>
                  <span className="font-bold text-primary font-mono text-sm">
                    ₹{pricingService.calculateMealPrice(activeSub, addMealModalState.mealType)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-text-muted italic">
                * Order will be generated and assigned to delivery partner following D2 operational routing.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                className="flex-1 text-xs"
                disabled={addMealMutation.isPending}
                onClick={() => setAddMealModalState({ isOpen: false, mealType: "lunch" })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1 text-xs"
                disabled={addMealMutation.isPending}
                onClick={async () => {
                  try {
                    await addMealMutation.mutateAsync({
                      subscriptionId: activeSub.id,
                      mealType: addMealModalState.mealType,
                    });
                    setAddMealModalState({ isOpen: false, mealType: "lunch" });
                  } catch {
                    // Handled by mutation onError toast
                  }
                }}
              >
                {addMealMutation.isPending ? "Adding..." : "Confirm Add Meal"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CHANGE MEAL OPTION ────────────────────────────────────── */}
      {changeOptionModalState.isOpen && (
        <ChangeMealOptionModalInner
          customer={customer}
          subscription={activeSub}
          plan={currentPlan}
          mealType={changeOptionModalState.mealType}
          order={changeOptionModalState.order!}
          onClose={() => setChangeOptionModalState({ isOpen: false, mealType: "lunch" })}
          onConfirm={async (newOptionId) => {
            try {
              await changeOptionMutation.mutateAsync({
                subscriptionId: activeSub.id,
                mealType: changeOptionModalState.mealType,
                newOptionId,
              });
              setChangeOptionModalState({ isOpen: false, mealType: "lunch" });
            } catch {
              // Handled by mutation onError toast
            }
          }}
          isSubmitting={changeOptionMutation.isPending}
        />
      )}

      {/* ── MODAL 4: ADD TODAY'S ADD-ON ────────────────────────────────────── */}
      {addonModalOpen && (
        <AddTodayAddonModalInner
          customer={customer}
          subscription={activeSub}
          modifiableMeals={modifiableMeals}
          onClose={() => setAddonModalOpen(false)}
          onConfirm={async ({ mealType, addonId, quantity }) => {
            try {
              await addAddonMutation.mutateAsync({
                subscriptionId: activeSub.id,
                mealType,
                addonId,
                quantity,
              });
              setAddonModalOpen(false);
            } catch {
              // Handled by mutation onError toast
            }
          }}
          isSubmitting={addAddonMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Inner Modal: Change Meal Option ──────────────────────────────────────────
function ChangeMealOptionModalInner({
  customer,
  plan,
  mealType,
  order,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  customer: CustomerProfile;
  subscription: Subscription;
  plan?: MealPlan;
  mealType: MealType;
  order: Order;
  onClose: () => void;
  onConfirm: (optionId: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const slot = (plan?.mealSlots || []).find((s) => s.mealType === mealType);
  const options: MealOption[] = (slot?.options || []).filter((o) => o.isActive !== false);
  const [selectedOptionId, setSelectedOptionId] = useState(
    order.selectedOptionId || options[0]?.id || "",
  );

  const currentOption = options.find((o) => o.id === order.selectedOptionId);

  return (
    <div
      role="dialog"
      aria-labelledby="change-option-title"
      className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isSubmitting) onClose();
      }}
      tabIndex={-1}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gold/30 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="change-option-title" className="text-lg font-bold text-primary font-display flex items-center gap-2">
            <Sliders size={18} className="text-gold" /> Change Today's {mealType} Option
          </h3>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            className="text-text-muted hover:text-primary p-1 rounded-full disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-text-muted space-y-3">
          <p>
            Customer: <strong className="text-text">{customer.fullName}</strong> • Order ID:{" "}
            <span className="font-mono">{order.id}</span> (retained)
          </p>

          <div className="p-3 bg-surface-1 rounded-xl border border-border">
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-1">
              Current Option
            </span>
            <span className="font-bold text-text text-sm">
              {currentOption?.label || order.mealName || "Default Option"}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-2">
              Select New Option
            </span>
            {options.length === 0 ? (
              <p className="text-xs italic text-text-muted">No options configured for this meal slot.</p>
            ) : (
              <div className="space-y-2">
                {options.map((opt) => (
                  <label
                    key={opt.id}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedOptionId === opt.id
                        ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
                        : "bg-background border-border text-text hover:bg-surface-1"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">{opt.label}</div>
                      {opt.items && opt.items.length > 0 && (
                        <div className="text-[11px] text-text-muted font-normal mt-0.5">
                          {opt.items.join(" • ")}
                        </div>
                      )}
                    </div>
                    <input
                      type="radio"
                      name="mealOption"
                      value={opt.id}
                      checked={selectedOptionId === opt.id}
                      onChange={(e) => setSelectedOptionId(e.target.value)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 bg-success/10 border border-success/20 rounded-xl flex items-center justify-between text-xs">
            <span className="font-bold text-success">Price Difference:</span>
            <span className="font-bold text-success font-mono">₹0 (Same-slot substitution)</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1 text-xs" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 text-xs"
            disabled={!selectedOptionId || selectedOptionId === order.selectedOptionId || isSubmitting}
            onClick={() => onConfirm(selectedOptionId)}
          >
            {isSubmitting ? "Updating..." : "Confirm Option Change"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Inner Modal: Add Today's Add-on ──────────────────────────────────────────
function AddTodayAddonModalInner({
  customer,
  modifiableMeals,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  customer: CustomerProfile;
  subscription: Subscription;
  modifiableMeals: string[];
  onClose: () => void;
  onConfirm: (data: { mealType: MealType; addonId: string; quantity: number }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const eligibleMeals = (modifiableMeals.length > 0 ? modifiableMeals : ["lunch"]) as MealType[];
  const [selectedMeal, setSelectedMeal] = useState<MealType>(eligibleMeals[0] || "lunch");

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

  useEffect(() => {
    if (availableAddons.length > 0 && !availableAddons.some((a) => a.id === selectedAddonId)) {
      setSelectedAddonId(availableAddons[0].id);
    }
  }, [availableAddons, selectedAddonId]);

  const selectedAddon: AddonItem | undefined =
    allAddons.find((a) => a.id === selectedAddonId) || pricingService.getAddonById(selectedAddonId);

  let unitPrice = selectedAddon ? selectedAddon.price : 0;
  let totalAmount = unitPrice * quantity;
  if (selectedAddon) {
    try {
      const calc = pricingService.calculateAddonPrice(selectedAddon.id, quantity);
      unitPrice = calc.unitPrice;
      totalAmount = calc.total;
    } catch {
      // Fallback
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="add-addon-title"
      className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isSubmitting) onClose();
      }}
      tabIndex={-1}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-6 border border-primary/30 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="add-addon-title" className="text-lg font-bold text-primary font-display flex items-center gap-2">
            <Plus size={18} /> Add Today's Add-on Item
          </h3>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            className="text-text-muted hover:text-primary p-1 rounded-full disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-text-muted space-y-3">
          <p>
            Customer: <strong className="text-text">{customer.fullName}</strong>
          </p>

          {modifiableMeals.length === 0 ? (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>All cutoff times have passed for today. Add-ons cannot be added for today.</span>
            </div>
          ) : null}

          {/* Select Meal Slot */}
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-1.5">
              Select Meal Slot
            </span>
            <div className="grid grid-cols-3 gap-2">
              {MEAL_SLOTS.map((slot) => {
                const isEligible = modifiableMeals.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!isEligible}
                    onClick={() => {
                      setSelectedMeal(slot);
                      const nextAddons = getAddonsForMeal(slot);
                      if (!nextAddons.some((a) => a.id === selectedAddonId)) {
                        setSelectedAddonId(nextAddons[0]?.id || "");
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold capitalize transition-all border ${
                      selectedMeal === slot
                        ? "bg-primary text-background border-primary shadow-xs"
                        : isEligible
                          ? "bg-surface-1 text-text border-border hover:border-primary/40"
                          : "opacity-40 bg-surface-1 border-border cursor-not-allowed"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select Add-on */}
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-1.5">
              Available Add-on Items
            </span>
            {availableAddons.length === 0 ? (
              <p className="text-xs italic text-text-muted">No add-ons configured for this meal slot.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {availableAddons.map((addon) => (
                  <label
                    key={addon.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all text-xs ${
                      selectedAddonId === addon.id
                        ? "bg-primary/10 border-primary text-primary font-bold shadow-xs"
                        : "bg-background border-border text-text hover:bg-surface-1"
                    }`}
                  >
                    <div>
                      <div className="font-bold">{addon.name}</div>
                      {addon.description && (
                        <div className="text-[10px] text-text-muted font-normal">
                          {addon.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold">₹{addon.price}</span>
                      <input
                        type="radio"
                        name="addonItem"
                        value={addon.id}
                        checked={selectedAddonId === addon.id}
                        onChange={(e) => setSelectedAddonId(e.target.value)}
                        className="w-3.5 h-3.5 text-primary focus:ring-primary"
                      />
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-text">Quantity (Max 10)</span>
            <div className="flex items-center gap-2 bg-surface-1 rounded-xl p-1 border border-border">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold disabled:opacity-40"
              >
                -
              </button>
              <span className="w-8 text-center font-bold font-mono text-sm">{quantity}</span>
              <button
                type="button"
                disabled={quantity >= 10}
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {/* Billing Preview */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between text-text-muted">
              <span>Authoritative Calculation:</span>
              <span className="font-mono font-bold text-text">
                ₹{unitPrice} × {quantity}
              </span>
            </div>
            <div className="flex justify-between font-bold text-primary pt-1 border-t border-primary/10">
              <span>Total Invoice Charge:</span>
              <span className="font-mono text-sm">₹{totalAmount}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1 text-xs" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 text-xs"
            disabled={!selectedAddon || isSubmitting || modifiableMeals.length === 0}
            onClick={() => {
              if (!selectedAddon) return;
              onConfirm({
                mealType: selectedMeal,
                addonId: selectedAddon.id,
                quantity,
              });
            }}
          >
            {isSubmitting ? "Adding..." : "Confirm Add Add-on"}
          </Button>
        </div>
      </div>
    </div>
  );
}
