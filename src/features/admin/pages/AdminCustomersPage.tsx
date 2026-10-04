import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  XCircle,
  Users,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  MoreVertical,
  Copy,
  Receipt,
  CalendarDays,
  CreditCard,
  History,
  CalendarPlus,
  RefreshCw,
  Clock,
  Calendar,
  Utensils,
} from "lucide-react";
import toast from "react-hot-toast";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { TableSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import {
  useAdminCustomers,
  useStaffUsers,
  useAssignDeliveryPartner,
  useAssignCustomerZone,
} from "@/features/admin/hooks/useAdmin";
import { useCustomerOrderHistory } from "@/features/customer/hooks/useMySubscription";
import { useDeliveryZones } from "@/features/admin/hooks/useDeliveryZones";
import {
  usePauseSubscription,
  useResumeSubscription,
  useRejectSubscription,
} from "@/features/admin/hooks/useAdminSubscriptions";
import { StatusChip } from "@/shared/components/ui/StatusChip";
import { MealBadge } from "@/shared/components/ui/MealBadge";
import { subscriptionRepository } from "@/shared/services/firestore/subscriptionRepository";
import { accountsRepository } from "@/shared/services/firestore/accountsRepository";
import { paymentRepository } from "@/shared/services/firestore/paymentRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { pricingService } from "@/shared/services/business/pricingService";
import { getTodayIST } from "@/shared/lib/date";
import { NegotiatedPricingEditor } from "@/features/admin/components/NegotiatedPricingEditor";
import { CustomerTodayMealsTab } from "@/features/admin/components/CustomerTodayMealsTab";
import { AdminCreateSubscriptionModal } from "@/features/admin/components/AdminCreateSubscriptionModal";
import { ChangePlanModal } from "@/features/admin/components/ChangePlanModal";
import { AddMealForDateModal } from "@/features/admin/components/AddMealForDateModal";
import type {
  CustomerProfile,
  UserProfile,
  DeliveryPartnerProfile,
  DeliveryZone,
  Order,
  Subscription,
} from "@/shared/types";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { formatAllottedId } from "@/shared/utils/displayId";
import { useScrollLock } from "@/shared/hooks/useScrollLock";

function formatDate(value: any): string {
  if (!value) return "—";
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return format(d, "MMM dd, yyyy");
  } catch {
    return "—";
  }
}

// ── Customer Order History Tab ─────────────────────────────────────────────────
function CustomerOrderHistoryTab({
  customer,
  activeSub,
}: {
  customer: CustomerProfile;
  activeSub?: Subscription | null;
}) {
  const customerId = customer.id;
  const {
    data: orders,
    isLoading,
    error,
  } = useCustomerOrderHistory(customerId);

  const [isAddMealModalOpen, setIsAddMealModalOpen] = useState(false);
  const todayIST = getTodayIST();

  if (isLoading)
    return (
      <div className="p-6 text-center text-sm font-medium text-text-muted">
        Loading history...
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-center text-sm font-medium text-danger">
        Failed to load history.
      </div>
    );

  const allOrders = orders || [];
  const upcomingOrders = allOrders.filter((o) => o.date > todayIST);
  const todayOrders = allOrders.filter((o) => o.date === todayIST);
  const pastOrders = allOrders.filter((o) => o.date < todayIST);

  const mealSortOrder: Record<string, number> = {
    breakfast: 1,
    lunch: 2,
    dinner: 3,
  };

  const renderOrderList = (list: Order[], emptyMsg: string) => {
    if (list.length === 0) {
      return (
        <div className="p-4 text-center text-text-muted text-xs bg-surface-1 rounded-xl border border-border">
          {emptyMsg}
        </div>
      );
    }

    const grouped: Record<string, Order[]> = {};
    for (const order of list) {
      if (!grouped[order.date]) grouped[order.date] = [];
      grouped[order.date].push(order);
    }
    const groupKeys = Object.keys(grouped).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );

    return (
      <div className="space-y-4">
        {groupKeys.map((date) => {
          const dayOrders = grouped[date].sort(
            (a, b) =>
              (mealSortOrder[a.mealType] || 99) -
              (mealSortOrder[b.mealType] || 99),
          );
          return (
            <div key={date} className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
                <Calendar size={12} /> {formatDate(date)}
              </h4>
              <div className="grid gap-2">
                {dayOrders.map((order) => {
                  const isTerminal = [
                    "delivered",
                    "failed_delivery",
                    "cancelled",
                  ].includes(order.status);
                  return (
                    <div
                      key={order.id}
                      className={`bg-background rounded-xl p-3 border border-border flex items-center justify-between gap-4 ${isTerminal ? "opacity-70" : ""}`}
                    >
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MealBadge mealType={order.mealType} compact />
                          {order.source === "one_time" && (
                            <Badge variant="warning" className="text-[9px] uppercase font-bold">
                              One-Time
                            </Badge>
                          )}
                          {order.isAddon && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              ✨ Add-on: {order.addonName || "Add-on"}
                              {order.addonQuantity && order.addonQuantity > 1
                                ? ` x${order.addonQuantity}`
                                : ""}
                            </span>
                          )}
                          {order.deliveryWindow && (
                            <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                              <Clock size={10} /> {order.deliveryWindow.start}–
                              {order.deliveryWindow.end}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text font-medium truncate flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-text-muted">
                            ID: {order.displayId || order.id.slice(0, 10)}
                          </span>
                          <span>•</span>
                          <span>{order.mealName || order.itemsLabel || order.mealType}</span>
                          <span>•</span>
                          <span className="font-mono tabular-nums font-semibold text-primary">
                            ₹{order.price || 0}
                          </span>
                        </div>
                        {/* Delivery partner — reads from order.driverName (denormalized snapshot, frozen at assignment time for historical correctness) */}
                        <div className="text-[10px] text-text-muted flex items-center gap-0.5">
                          <span>Driver:</span>
                          <span className="font-medium text-text">
                            {order.driverName ||
                              (order.deliveryPartnerId ? "Assigned" : "Not Assigned")}
                          </span>
                        </div>
                        {order.deliveryResult &&
                          order.status === "failed_delivery" && (
                            <div className="text-[10px] text-danger font-bold">
                              Failed: {order.deliveryResult.reasonCode}
                            </div>
                          )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <StatusChip status={order.status} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
          Orders Overview
        </span>
        <Button
          variant="primary"
          size="xs"
          onClick={() => setIsAddMealModalOpen(true)}
          className="text-xs flex items-center gap-1.5"
        >
          <CalendarPlus size={14} /> + Add Meal for Date
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-1 rounded-xl p-3 border border-border text-center">
          <div className="text-xl font-bold text-text">{allOrders.length}</div>
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mt-0.5">
            Total Orders
          </div>
        </div>
        <div className="bg-info/10 rounded-xl p-3 border border-info/20 text-center">
          <div className="text-xl font-bold text-blue-600">
            {upcomingOrders.length}
          </div>
          <div className="text-[10px] font-medium text-blue-600/80 uppercase tracking-wider mt-0.5">
            Upcoming
          </div>
        </div>
        <div className="bg-success/10 rounded-xl p-3 border border-success/20 text-center">
          <div className="text-xl font-bold text-success">
            {allOrders.filter((o) => o.status === "delivered").length}
          </div>
          <div className="text-[10px] font-medium text-success/80 uppercase tracking-wider mt-0.5">
            Delivered
          </div>
        </div>
      </div>

      {/* Upcoming Orders Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
            <Clock size={14} className="text-blue-500" /> Upcoming Orders ({upcomingOrders.length})
          </h3>
        </div>
        {renderOrderList(upcomingOrders, "No upcoming scheduled orders.")}
      </div>

      {/* Today's Orders Section */}
      {todayOrders.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
            <Utensils size={14} className="text-gold" /> Today's Orders ({todayOrders.length})
          </h3>
          {renderOrderList(todayOrders, "No orders scheduled for today.")}
        </div>
      )}

      {/* Past Order History Section */}
      <div className="space-y-3 pt-2 border-t border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <History size={14} /> Past Orders History ({pastOrders.length})
        </h3>
        {renderOrderList(pastOrders, "No past order history available.")}
      </div>

      {isAddMealModalOpen && (
        <AddMealForDateModal
          customer={customer}
          subscription={activeSub}
          isOpen={isAddMealModalOpen}
          onClose={() => setIsAddMealModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Customer Subscriptions Tab ────────────────────────────────────────────────
function CustomerSubscriptionsTab({
  customerId,
  onCreateSub,
}: {
  customerId: string;
  onCreateSub?: () => void;
}) {
  const queryClient = useQueryClient();
  const pauseMutation = usePauseSubscription();
  const resumeMutation = useResumeSubscription();
  const rejectMutation = useRejectSubscription();
  const [editingNegotiatedSub, setEditingNegotiatedSub] = useState<any | null>(null);
  const [editingPlanSub, setEditingPlanSub] = useState<Subscription | null>(null);
  const { data: subs = [], isLoading, error } = useQuery({
    queryKey: ["subscriptions", "customer", customerId],
    queryFn: () => subscriptionRepository.getByCustomerId(customerId),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm font-medium text-text-muted">
        Loading subscriptions...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-center text-sm font-medium text-danger">
        Failed to load subscriptions.
      </div>
    );
  }

  if (subs.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted space-y-3">
        <CalendarDays size={32} className="mx-auto mb-1 opacity-20" />
        <p className="text-sm font-medium">No subscriptions on record for this customer.</p>
        {onCreateSub && (
          <Button variant="primary" size="sm" onClick={onCreateSub} className="text-xs">
            + Create Subscription
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onCreateSub && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Active Records ({subs.length})
          </span>
          <Button variant="primary" size="xs" onClick={onCreateSub} className="text-xs">
            + Create Subscription
          </Button>
        </div>
      )}
      {subs.map((sub) => {
        const hasNegotiated = !!sub.negotiatedPricing && Object.keys(sub.negotiatedPricing).length > 0;
        const standardBaseMatrix = pricingService.resolveSyncBasePricing(sub.startDate, sub.planTier);
        const subMeals = (sub.mealPreferences || []).map((m: any) => m.mealType);
        let standardDailyRate = 0;
        if (subMeals.length === 3) standardDailyRate = standardBaseMatrix.breakfast_lunch_dinner;
        else if (subMeals.includes("breakfast") && subMeals.includes("lunch")) standardDailyRate = standardBaseMatrix.breakfast_lunch;
        else if (subMeals.includes("lunch") && subMeals.includes("dinner")) standardDailyRate = standardBaseMatrix.lunch_dinner;
        else if (subMeals.includes("breakfast") && subMeals.includes("dinner")) standardDailyRate = standardBaseMatrix.breakfast_dinner;
        else if (subMeals.includes("breakfast")) standardDailyRate = standardBaseMatrix.breakfast;
        else if (subMeals.includes("lunch")) standardDailyRate = standardBaseMatrix.lunch;
        else if (subMeals.includes("dinner")) standardDailyRate = standardBaseMatrix.dinner;

        return (
          <div
            key={sub.id}
            className="bg-background rounded-xl p-4 border border-primary/10 shadow-xs space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary text-base">
                    {sub.planTier ? sub.planTier.toUpperCase() : "CUSTOM"} PLAN
                  </span>
                  <StatusChip status={sub.status as any} size="sm" />
                  {hasNegotiated && (
                    <Badge variant="warning" className="text-[9px] uppercase tracking-wider font-bold">
                      Negotiated
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-text-muted mt-1 font-mono">
                  ID: {sub.id.slice(0, 10)}... • Cycle: {sub.billingCycle || "monthly"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold text-primary">
                  ₹{sub.pricePerDaySnapshot || standardDailyRate} / day
                </div>
                <div className="text-[10px] text-text-muted">
                  Standard: ₹{standardDailyRate}/day
                </div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">
                  Auto-Renew: {sub.autoRenew ? "Enabled" : "Off"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-primary/5">
              <div>
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
                  Duration
                </span>
                <span className="text-text font-medium">
                  {formatDate(sub.startDate)} — {sub.endDate ? formatDate(sub.endDate) : "Ongoing"}
                </span>
              </div>
              {sub.pauseStartDate && (
                <div>
                  <span className="text-[10px] text-warning font-bold uppercase tracking-wider block">
                    Paused Schedule
                  </span>
                  <span className="text-text font-medium">
                    {formatDate(sub.pauseStartDate)} — {sub.pauseEndDate ? formatDate(sub.pauseEndDate) : "Open-ended"}
                  </span>
                </div>
              )}
            </div>

            {sub.mealPreferences && sub.mealPreferences.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mr-1">
                  Meals:
                </span>
                {sub.mealPreferences.map((p) => (
                  <MealBadge key={p.mealType} mealType={p.mealType} compact />
                ))}
              </div>
            )}

            {/* Negotiated Pricing & Plan Change Section */}
            <div className="pt-2 border-t border-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Plan ID: <strong className="text-text font-medium">{sub.planId || "Default"}</strong> ({sub.planTier || "regular"})
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setEditingPlanSub(sub)}
                  className="text-xs flex items-center gap-1.5"
                >
                  <RefreshCw size={12} /> Change Plan
                </Button>
              </div>

              {hasNegotiated && sub.negotiatedPricing ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-800 text-[11px] uppercase tracking-wider">
                      Negotiated Pricing Overrides (Configured)
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditingNegotiatedSub(sub)}
                      className="text-xs text-primary underline h-auto p-1"
                    >
                      Edit Overrides
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] text-text-muted">
                    {Object.entries(sub.negotiatedPricing).map(([k, v]) => (
                      <span key={k} className="capitalize">
                        {k.replace(/_/g, " ")}:{" "}
                        <strong className="text-text font-mono">₹{v as any}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-surface-1/50 rounded-xl p-2.5 border border-border text-xs text-text-muted">
                  <span>Negotiated Pricing: <strong className="text-text font-medium">None (Standard plan price: ₹{standardDailyRate}/day)</strong></span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditingNegotiatedSub(sub)}
                    className="text-xs text-primary hover:underline"
                  >
                    + Override Pricing
                  </Button>
                </div>
              )}
            </div>

            {/* Subscription Lifecycle Controls */}
            {(sub.status === "active" || sub.status === "paused") && (
              <div className="pt-3 border-t border-primary/5 space-y-2">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">
                  Subscription Controls
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Control 1: Auto-Renew Toggle */}
                  <div className="bg-surface-1/50 p-2.5 rounded-xl border border-border flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-xs text-text">Auto-Renew</div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {sub.autoRenew
                          ? "Current period continues until end date."
                          : "Will not renew at cycle end."}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={async () => {
                        try {
                          await subscriptionRepository.update(sub.id, {
                            autoRenew: !sub.autoRenew,
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["subscriptions", "customer", customerId],
                          });
                          toast.success(
                            sub.autoRenew
                              ? "Auto-renew disabled (period continues until end date)."
                              : "Auto-renew enabled.",
                          );
                        } catch (err: any) {
                          toast.error(err?.message || "Failed to update auto-renew.");
                        }
                      }}
                      className="mt-2 text-xs border border-border hover:bg-surface-2 justify-center"
                    >
                      {sub.autoRenew ? "Disable Auto-Renew" : "Enable Auto-Renew"}
                    </Button>
                  </div>

                  {/* Control 2: Pause / Resume */}
                  <div className="bg-surface-1/50 p-2.5 rounded-xl border border-border flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-xs text-text">
                        {sub.status === "paused" ? "Resume" : "Pause"}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        Temporary delivery hold without ending subscription.
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pauseMutation.isPending || resumeMutation.isPending}
                      onClick={async () => {
                        try {
                          if (sub.status === "paused") {
                            await resumeMutation.mutateAsync(sub);
                          } else {
                            await pauseMutation.mutateAsync({
                              subscription: sub,
                              shouldPauseNow: true,
                            });
                          }
                          queryClient.invalidateQueries({
                            queryKey: ["subscriptions", "customer", customerId],
                          });
                        } catch (err: any) {
                          toast.error(err?.message || "Failed to update pause state.");
                        }
                      }}
                      className="mt-2 text-xs border border-gold/40 text-gold hover:bg-gold/10 justify-center"
                    >
                      {sub.status === "paused" ? "Resume Subscription" : "Pause Subscription"}
                    </Button>
                  </div>

                  {/* Control 3: Cancel / Stop */}
                  <div className="bg-surface-1/50 p-2.5 rounded-xl border border-border flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-xs text-danger">Stop / Cancel</div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        Immediate lifecycle termination according to policy.
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={rejectMutation.isPending}
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `Are you sure you want to stop/cancel subscription ${sub.id.slice(0, 8)}? This immediately terminates deliveries.`,
                        );
                        if (!confirmed) return;
                        try {
                          await rejectMutation.mutateAsync({
                            subscription: sub,
                            reason: "Cancelled by Admin via Customer Profile",
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["subscriptions", "customer", customerId],
                          });
                        } catch {
                          // useRejectSubscription handles toast.error on failure
                        }
                      }}
                      className="mt-2 text-xs border border-danger/40 text-danger hover:bg-danger/10 justify-center"
                    >
                      Stop Subscription
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {editingNegotiatedSub && (
        <NegotiatedPricingEditor
          subscriptionId={editingNegotiatedSub.id}
          existingPricing={editingNegotiatedSub.negotiatedPricing}
          onClose={() => setEditingNegotiatedSub(null)}
        />
      )}

      {editingPlanSub && (
        <ChangePlanModal
          subscription={editingPlanSub}
          isOpen={!!editingPlanSub}
          onClose={() => setEditingPlanSub(null)}
        />
      )}
    </div>
  );
}

// ── Customer Account & Billing Tab ────────────────────────────────────────────
function CustomerAccountTab({ customerId }: { customerId: string }) {
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["invoices", "customer", customerId],
    queryFn: () => accountsRepository.getInvoicesByCustomerId(customerId),
  });

  const { data: payments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["payments", "customer", customerId],
    queryFn: () => paymentRepository.getByCustomerId(customerId),
  });

  if (isLoadingInvoices || isLoadingPayments) {
    return (
      <div className="p-6 text-center text-sm font-medium text-text-muted">
        Loading financial data...
      </div>
    );
  }

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === "verified")
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = Math.max(0, totalInvoiced - totalPaid);

  return (
    <div className="space-y-6">
      {/* Financial KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-1 rounded-xl p-3 border border-border text-center">
          <div className="text-lg font-bold text-text">₹{totalInvoiced.toLocaleString()}</div>
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mt-0.5">
            Total Invoiced
          </div>
        </div>
        <div className="bg-success/10 rounded-xl p-3 border border-success/20 text-center">
          <div className="text-lg font-bold text-success">₹{totalPaid.toLocaleString()}</div>
          <div className="text-[10px] font-medium text-success/80 uppercase tracking-wider mt-0.5">
            Total Paid
          </div>
        </div>
        <div className={`rounded-xl p-3 border text-center ${balance > 0 ? "bg-danger/10 border-danger/20 text-danger" : "bg-surface-1 border-border text-text"}`}>
          <div className="text-lg font-bold">₹{balance.toLocaleString()}</div>
          <div className="text-[10px] font-medium uppercase tracking-wider mt-0.5 opacity-80">
            Due Balance
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Receipt size={14} /> Invoices ({invoices.length})
        </h4>
        {invoices.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-xs bg-primary/5 rounded-lg">
            No invoices generated yet.
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-background rounded-xl p-3 border border-primary/10 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-primary">
                    {inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {inv.billingPeriodStart ? `${inv.billingPeriodStart} — ${inv.billingPeriodEnd}` : formatDate(inv.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold text-primary">₹{inv.totalAmount}</div>
                    <div className="text-[10px] uppercase font-semibold text-text-muted">
                      {inv.status}
                    </div>
                  </div>
                  <Badge
                    variant={inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : "default"}
                    className="text-[9px] uppercase tracking-wider"
                  >
                    {inv.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History List */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <CreditCard size={14} /> Payments ({payments.length})
        </h4>
        {payments.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-xs bg-primary/5 rounded-lg">
            No payments submitted yet.
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="bg-background rounded-xl p-3 border border-primary/10 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-primary">₹{p.amount}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {formatDate(p.paymentDate || p.createdAt)} • {p.paymentMethod?.toUpperCase()} {p.referenceNumber ? `• Ref: ${p.referenceNumber}` : ""}
                  </div>
                </div>
                <Badge
                  variant={p.status === "verified" ? "success" : p.status === "rejected" ? "danger" : "warning"}
                  className="text-[9px] uppercase tracking-wider font-bold"
                >
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Customer Audit History Tab ───────────────────────────────────────────────
function CustomerAuditHistoryTab({
  customerId,
  subscriptionIds = [],
}: {
  customerId: string;
  subscriptionIds?: string[];
}) {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["auditLogs", "customer", customerId, ...subscriptionIds],
    queryFn: () => auditRepository.getLogsForCustomer(customerId, subscriptionIds),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm font-medium text-text-muted">
        Loading audit history...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-center text-sm font-medium text-danger">
        Failed to load audit history.
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted space-y-2">
        <History size={32} className="mx-auto mb-1 opacity-20" />
        <p className="text-sm font-medium">No relevant audit records found for this customer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
          Activity & Audit Trail ({logs.length})
        </span>
      </div>
      <div className="space-y-2.5">
        {logs.map((log) => {
          const actionLabel = log.action
            ? log.action.replace(/_/g, " ").replace(/^admin /, "Admin: ")
            : "Activity";
          return (
            <div
              key={log.id}
              className="bg-background rounded-xl p-3.5 border border-primary/10 shadow-xs space-y-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary capitalize">
                    {actionLabel}
                  </span>
                  <Badge variant="default" className="text-[9px] font-mono uppercase">
                    {log.entityType || "general"}
                  </Badge>
                </div>
                <span className="text-[10px] text-text-muted whitespace-nowrap">
                  {formatDate(log.timestamp)}
                </span>
              </div>

              <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                <span>By:</span>
                <strong className="text-text font-medium">
                  {log.performedByName || "System"}
                </strong>
                {log.performedByRole && (
                  <span className="text-[10px] text-text-muted bg-surface-1 px-1.5 py-0.5 rounded border border-border capitalize">
                    {log.performedByRole}
                  </span>
                )}
              </div>

              {log.details && Object.keys(log.details).length > 0 && (
                <div className="bg-surface-1/70 rounded-lg p-2 mt-1 text-[11px] font-mono text-text-muted space-y-0.5 border border-border/50">
                  {Object.entries(log.details).map(([k, v]) => {
                    if (k === "customerId" || k === "subscriptionId") return null;
                    const displayVal = typeof v === "object" ? JSON.stringify(v) : String(v);
                    return (
                      <div key={k} className="truncate">
                        <span className="text-text-muted font-sans font-medium capitalize">
                          {k.replace(/([A-Z])/g, " $1")}:{" "}
                        </span>
                        <span className="text-text font-semibold">{displayVal}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail Dialog ────────────────────────────────────────────────────────────
function CustomerDetailDialog({
  customer,
  onClose,
}: {
  customer: CustomerProfile;
  onClose: () => void;
}) {
  useScrollLock(true);
  const addrList = customer.addresses || [];
  const defaultId = customer.defaultAddressId;

  const { data: staffUsers } = useStaffUsers();
  const deliveryPartners = (staffUsers || []).filter(
    (u) => u.role === "delivery_partner" && u.isActive,
  ) as DeliveryPartnerProfile[];
  const { data: zones = [] } = useDeliveryZones();

  const assignPartner = useAssignDeliveryPartner();
  const assignZone = useAssignCustomerZone();

  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState(
    customer.deliveryPartnerId || "",
  );
  const [selectedMealType, setSelectedMealType] = useState<import("@/shared/types").MealType | "all">("all");

  const [isEditingZone, setIsEditingZone] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(customer.zoneId || "");

  const [activeTab, setActiveTab] = useState<
    "profile" | "today" | "subscriptions" | "orders" | "account" | "audit"
  >("today");
  const [isCreateSubOpen, setIsCreateSubOpen] = useState(false);

  // Fetch customer subscriptions
  const { data: subs = [] } = useQuery({
    queryKey: ["subscriptions", "customer", customer.id],
    queryFn: () => subscriptionRepository.getByCustomerId(customer.id),
  });
  const activeSub = subs.find((s) => s.status === "active") || subs[0] || null;
  const subIds = useMemo(() => subs.map((s) => s.id), [subs]);

  // Calculate standard plan price for active subscription
  const standardPlanPrice = useMemo(() => {
    if (!activeSub) return 0;
    const matrix = pricingService.resolveSyncBasePricing(activeSub.startDate, activeSub.planTier);
    const meals = (activeSub.mealPreferences || []).map((m: any) => m.mealType);
    if (meals.length === 3) return matrix.breakfast_lunch_dinner;
    if (meals.includes("breakfast") && meals.includes("lunch")) return matrix.breakfast_lunch;
    if (meals.includes("lunch") && meals.includes("dinner")) return matrix.lunch_dinner;
    if (meals.includes("breakfast") && meals.includes("dinner")) return matrix.breakfast_dinner;
    if (meals.includes("breakfast")) return matrix.breakfast;
    if (meals.includes("lunch")) return matrix.lunch;
    if (meals.includes("dinner")) return matrix.dinner;
    return 0;
  }, [activeSub]);

  const defaultAddress = addrList.find((a) => a.id === defaultId) || addrList[0];
  const defaultAddressText = defaultAddress
    ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(", ") +
      (defaultAddress.pincode ? ` - ${defaultAddress.pincode}` : "")
    : "No address recorded";

  const currentZone = zones.find((z) => z.id === customer.zoneId);

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5 shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary font-display">
              Customer Details
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-text-muted text-xs font-mono bg-background-alt px-2 py-1 rounded inline-block border border-primary/10">
                {formatAllottedId(customer.displayId, customer.id, "customer")}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    formatAllottedId(
                      customer.displayId,
                      customer.id,
                      "customer",
                    ),
                  );
                  toast.success("Customer ID copied!");
                }}
                className="text-[11px] font-mono text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded border border-primary/10 flex items-center gap-1 transition-colors cursor-pointer min-h-[28px]"
                title="Copy Customer ID"
              >
                Copy ID <Copy size={12} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateSubOpen(true)}
              className="text-xs shrink-0"
            >
              + Create Subscription
            </Button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-primary hover:text-gold p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors rounded-full"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Customer Relationship Summary Card */}
        <div className="bg-surface-1/60 border-b border-primary/10 p-4 sm:px-6 space-y-2 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Customer</span>
              <span className="font-bold text-primary truncate block">{customer.fullName}</span>
              <span className="text-[10px] text-text-muted">{customer.phone}</span>
            </div>
            <div>
              <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Current Plan</span>
              <span className="font-bold text-primary truncate block">
                {activeSub ? `${(activeSub.planTier || "regular").toUpperCase()} PLAN` : "No Active Plan"}
              </span>
              <span className="text-[10px] text-text-muted">
                {activeSub ? `Status: ${activeSub.status}` : "—"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Standard Price</span>
              <span className="font-bold text-primary block">
                {activeSub ? `₹${standardPlanPrice}/day` : "—"}
              </span>
              <span className="text-[10px] text-text-muted">
                {activeSub ? (activeSub.billingCycle || "monthly") : "—"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block">Negotiated Price</span>
              {activeSub?.negotiatedPricing && Object.keys(activeSub.negotiatedPricing).length > 0 ? (
                <span className="font-bold text-amber-700 block">
                  ₹{activeSub.pricePerDaySnapshot || standardPlanPrice}/day
                  <Badge variant="warning" className="text-[8px] uppercase tracking-wider ml-1 py-0 px-1">Configured</Badge>
                </span>
              ) : (
                <span className="text-text-muted font-medium block">None (Standard)</span>
              )}
              <span className="text-[10px] text-text-muted">
                {activeSub ? `${formatDate(activeSub.startDate)} — ${activeSub.endDate ? formatDate(activeSub.endDate) : "Ongoing"}` : "—"}
              </span>
            </div>
          </div>
          {defaultAddressText && (
            <div className="text-[11px] text-text-muted truncate pt-1.5 border-t border-border/50 flex items-center gap-1">
              <span className="font-semibold text-primary">📍 Address:</span> {defaultAddressText}
            </div>
          )}
        </div>

        <div className="flex border-b border-primary/10 px-4 sm:px-6 overflow-x-auto shrink-0" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "profile"}
            onClick={() => setActiveTab("profile")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "profile"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            Profile
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "today"}
            onClick={() => setActiveTab("today")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "today"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            <Utensils size={14} /> Today's Meals
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "subscriptions"}
            onClick={() => setActiveTab("subscriptions")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "subscriptions"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            Subscriptions
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "orders"}
            onClick={() => setActiveTab("orders")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "orders"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            Order History
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "account"}
            onClick={() => setActiveTab("account")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "account"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            Account & Billing
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "audit"}
            onClick={() => setActiveTab("audit")}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "audit"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            <History size={14} /> Audit History
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto" role="tabpanel">
          {activeTab === "profile" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm font-sans">
              <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                  Profile
                </div>
                <div className="font-bold text-primary text-lg">
                  {customer.fullName}
                </div>
                <div className="text-primary font-medium mt-1">
                  {customer.phone}
                </div>
                <div className="text-text-muted">{customer.email}</div>
              </div>
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                  Joined
                </div>
                <div className="font-bold text-primary">
                  {formatDate(customer.createdAt)}
                </div>
              </div>
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                  Account Status
                </div>
                <div className="font-semibold text-primary">
                  <Badge
                    variant={customer.isActive ? "success" : "danger"}
                    className="text-[10px] uppercase tracking-wider font-bold"
                  >
                    {customer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-3">
                  Saved Addresses ({addrList.length})
                </div>
                {addrList.length === 0 ? (
                  <div className="text-text-muted text-sm italic bg-background p-3 rounded-lg border border-primary/5">
                    No addresses saved.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addrList.map((addr) => (
                      <div
                        key={addr.id}
                        className="text-sm bg-background p-3 rounded-lg border border-primary/10 shadow-sm"
                      >
                        <div className="font-bold text-primary flex items-center gap-2">
                          {addr.label}
                          {addr.id === defaultId && (
                            <span className="text-[9px] uppercase tracking-wider bg-gold text-primary px-2 py-0.5 rounded-full font-bold">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-text-muted text-xs mt-1 font-medium">
                          {[addr.line1, addr.line2, addr.city]
                            .filter(Boolean)
                            .join(", ")}
                          {addr.pincode ? ` - ${addr.pincode}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10 mt-2">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider">
                    Delivery Zone Assignment
                  </div>
                  {!isEditingZone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingZone(true)}
                      className="text-xs text-gold hover:bg-gold/10 px-2 py-1 h-auto"
                    >
                      Change Zone
                    </Button>
                  )}
                </div>

                {isEditingZone ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <select
                        value={selectedZoneId}
                        onChange={(e) => setSelectedZoneId(e.target.value)}
                        className="flex-1 bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                      >
                        <option value="">Auto-Assign (Pincode Based)</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} ({z.pincodes.length} pincodes)
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={
                          selectedZoneId === (customer.zoneId || "") ||
                          assignZone.isPending
                        }
                        onClick={() => {
                          assignZone.mutate(
                            { customerId: customer.id, zoneId: selectedZoneId },
                            { onSuccess: () => setIsEditingZone(false) },
                          );
                        }}
                      >
                        {assignZone.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingZone(false);
                          setSelectedZoneId(customer.zoneId || "");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
                        Zone
                      </div>
                      <div className="font-bold text-primary text-base">
                        {currentZone
                          ? currentZone.name
                          : customer.zoneId
                            ? "Unknown Zone"
                            : "Auto-Assign (Pincode)"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10 mt-2">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider">
                    Delivery Partner Assignment
                  </div>
                  {!isEditingPartner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingPartner(true)}
                      className="text-xs text-gold hover:bg-gold/10 px-2 py-1 h-auto"
                    >
                      Change Assignment
                    </Button>
                  )}
                </div>

                {isEditingPartner ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={selectedMealType}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setSelectedMealType(val);
                          if (val !== "all" && customer.mealDeliveryPartners && (customer.mealDeliveryPartners as any)[val]) {
                            setSelectedPartnerId((customer.mealDeliveryPartners as any)[val]!);
                          } else if (val === "all") {
                            setSelectedPartnerId(customer.deliveryPartnerId || "");
                          } else {
                            setSelectedPartnerId("");
                          }
                        }}
                        className="bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                      >
                        <option value="all">All Meals</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                      </select>
                      <select
                        value={selectedPartnerId}
                        onChange={(e) => setSelectedPartnerId(e.target.value)}
                        className="flex-1 bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                      >
                        <option value="">
                          {selectedMealType === "all" ? "Unassigned (None / Auto-Route)" : "Inherit / Default"}
                        </option>
                        {deliveryPartners.map((dp) => {
                          const dpZoneNames = (dp.zoneIds || []).map(
                            (id) => zones.find((z) => z.id === id)?.name || id,
                          );
                          return (
                            <option key={dp.id} value={dp.id}>
                              {dp.fullName} (
                              {dpZoneNames.length > 0
                                ? dpZoneNames.join(", ")
                                : "No zones"}
                              )
                            </option>
                          );
                        })}
                      </select>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={assignPartner.isPending}
                          className="flex-1 sm:flex-none min-h-[38px]"
                          onClick={() => {
                            assignPartner.mutate(
                              {
                                customerId: customer.id,
                                partnerId: selectedPartnerId || null,
                                mealType: selectedMealType,
                              },
                              { onSuccess: () => setIsEditingPartner(false) },
                            );
                          }}
                        >
                          {assignPartner.isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 sm:flex-none min-h-[38px]"
                          onClick={() => {
                            setIsEditingPartner(false);
                            setSelectedPartnerId(
                              customer.deliveryPartnerId || "",
                            );
                            setSelectedMealType("all");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Delivery partners per meal — applies resolution: meal-specific → global fallback → Not Assigned */}
                    <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
                      Delivery Partners
                    </div>
                    {(["breakfast", "lunch", "dinner"] as const).map((meal) => {
                      const mealSpecificId = customer.mealDeliveryPartners?.[meal];
                      // Meal-specific wins if explicitly set (even if null means "inherit global");
                      // undefined means not set at all → fall through to global
                      const resolvedId =
                        mealSpecificId !== undefined && mealSpecificId !== null
                          ? mealSpecificId
                          : (customer.deliveryPartnerId ?? null);
                      const partner = resolvedId
                        ? deliveryPartners.find((p) => p.id === resolvedId)
                        : null;
                      const hasCustomOverride =
                        mealSpecificId !== undefined && mealSpecificId !== null;
                      return (
                        <div
                          key={meal}
                          className="flex items-center justify-between gap-2 py-0.5"
                        >
                          <span className="text-[10px] text-text-muted font-medium w-16 shrink-0 capitalize">
                            {meal}
                          </span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span
                              className={`text-xs font-semibold truncate ${
                                resolvedId ? "text-primary" : "text-text-muted italic"
                              }`}
                            >
                              {resolvedId
                                ? (partner?.fullName ?? "Unknown Partner")
                                : "Not Assigned"}
                            </span>
                            {hasCustomOverride && (
                              <span className="text-[9px] bg-gold/10 text-amber-700 border border-gold/20 rounded px-1 py-0.5 font-bold uppercase tracking-wider shrink-0">
                                Custom
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(customer.assignedAt || customer.assignedBy) && (
                      <div className="text-[10px] text-text-muted/70 border-t border-border pt-1.5 mt-0.5">
                        {customer.assignedAt
                          ? `Last updated ${formatDate(customer.assignedAt)}`
                          : ""}
                        {customer.assignedBy ? " by Admin" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === "today" && (
            <CustomerTodayMealsTab customer={customer} />
          )}
          {activeTab === "subscriptions" && (
            <CustomerSubscriptionsTab
              customerId={customer.id}
              onCreateSub={() => setIsCreateSubOpen(true)}
            />
          )}
          {activeTab === "orders" && (
            <CustomerOrderHistoryTab customer={customer} activeSub={activeSub} />
          )}
          {activeTab === "account" && (
            <CustomerAccountTab customerId={customer.id} />
          )}
          {activeTab === "audit" && (
            <CustomerAuditHistoryTab customerId={customer.id} subscriptionIds={subIds} />
          )}
        </div>
      </div>

      {isCreateSubOpen && (
        <AdminCreateSubscriptionModal
          customer={customer}
          isOpen={isCreateSubOpen}
          onClose={() => setIsCreateSubOpen(false)}
          onSuccess={() => {
            setActiveTab("subscriptions");
          }}
        />
      )}
    </div>
  );
}

// ── Customer Card (Responsive Grid) ───────────────────────────────────────────────────
function CustomerCardView({
  customer,
  onSelect,
  deliveryPartners,
  zones = [],
}: {
  customer: CustomerProfile;
  onSelect: () => void;
  deliveryPartners: DeliveryPartnerProfile[];
  zones?: DeliveryZone[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const defaultAddress =
    customer.addresses?.find((a) => a.id === customer.defaultAddressId) ||
    customer.addresses?.[0];
  const locationText = defaultAddress
    ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(", ")
    : "No address";

  const partner = deliveryPartners.find(
    (p) => p.id === customer.deliveryPartnerId,
  );

  return (
    <Card
      elevated
      className="relative bg-card transition-colors hover:border-secondary/40 group overflow-visible min-w-0"
    >
      {/* Menu Overlay Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
          }}
        />
      )}

      <div
        className="p-3.5 flex flex-col gap-2 cursor-pointer min-h-[140px] min-w-0"
        onClick={() => {
          if (!menuOpen) onSelect();
        }}
      >
        {/* Top Header Row */}
        <div className="flex justify-between items-start">
          <div className="flex gap-2 items-center mt-1">
            <Badge
              variant={customer.isActive ? "success" : "danger"}
              dot
              className="text-[10px] shadow-sm px-1.5 py-0.5"
            >
              {customer.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="w-12 h-12 -mr-3 -mt-3 flex items-center justify-center text-text-muted hover:text-primary transition-colors z-20 relative rounded-full hover:bg-surface-2 shrink-0"
            aria-label="More actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Overflow Menu Dropdown */}
        {menuOpen && (
          <div className="absolute top-11 right-3 z-30 bg-card border border-border shadow-xl rounded-xl w-44 overflow-hidden flex flex-col py-1">
            <button
              className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onSelect();
              }}
            >
              View Details
            </button>
            <button
              className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-primary font-bold transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onSelect();
              }}
            >
              + Create Subscription
            </button>
            <button
              className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onSelect();
              }}
            >
              Edit
            </button>
            <button
              className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onSelect();
              }}
            >
              Assign Driver
            </button>
            <div className="h-[1px] bg-border my-1 w-full" />
            <button
              className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                window.location.href = `tel:${customer.phone}`;
              }}
            >
              Call Customer
            </button>
          </div>
        )}

        {/* Name Row */}
        <div className="flex items-center gap-2 pr-6 mt-1">
          <h3 className="font-bold text-text text-[15px] leading-snug group-hover:text-primary transition-colors truncate">
            👤 {customer.fullName}
          </h3>
          <Badge
            variant="default"
            className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 shadow-sm bg-primary/5 text-primary border border-primary/10 shrink-0"
          >
            {formatAllottedId(customer.displayId, customer.id, "customer")}
          </Badge>
        </div>

        {/* Contact Info Inline */}
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-medium mt-0.5 min-w-0">
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-[13px] leading-none">📞</span>{" "}
            {customer.phone}
          </span>
          <span className="text-border shrink-0">•</span>
          <span className="flex items-center gap-1 truncate min-w-0">
            <span className="text-[13px] leading-none shrink-0">📍</span>{" "}
            <span className="truncate">{locationText}</span>
          </span>
        </div>

        {/* Chips Row (Bottom) */}
        <div className="flex flex-wrap gap-1.5 items-center mt-auto pt-1">
          {partner ? (
            <Badge
              variant="info"
              className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 shrink-0 whitespace-nowrap truncate max-w-[150px]"
            >
              🚚 {partner.fullName}
            </Badge>
          ) : customer.zoneId ? (
            <Badge
              variant="default"
              className="text-[10px] px-1.5 py-0.5 shadow-sm bg-purple-50 text-purple-700 border border-purple-200 shrink-0 whitespace-nowrap"
            >
              📍 {zones.find((z) => z.id === customer.zoneId)?.name || "Assigned Zone"}
            </Badge>
          ) : (
            <Badge
              variant="warning"
              className="text-[10px] px-1.5 py-0.5 shadow-sm shrink-0 whitespace-nowrap"
            >
              ⚠ Auto (Pincode)
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Customer Activity View (Grouped by Today, Yesterday, Earlier) ──────────────
function CustomerActivityView({
  customers,
  onSelect,
  deliveryPartners,
  zones = [],
}: {
  customers: CustomerProfile[];
  onSelect: (customer: CustomerProfile) => void;
  deliveryPartners: DeliveryPartnerProfile[];
  zones?: DeliveryZone[];
}) {
  const groups = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = format(yesterday, "yyyy-MM-dd");

    const res: {
      today: CustomerProfile[];
      yesterday: CustomerProfile[];
      earlier: CustomerProfile[];
    } = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    const getCustDate = (c: CustomerProfile): { dateStr: string; timestamp: number } => {
      const raw = c.createdAt || c.updatedAt;
      if (!raw) return { dateStr: "", timestamp: 0 };
      try {
        const d = (raw as any).toDate ? (raw as any).toDate() : new Date(raw as any);
        return { dateStr: format(d, "yyyy-MM-dd"), timestamp: d.getTime() };
      } catch {
        return { dateStr: "", timestamp: 0 };
      }
    };

    for (const c of customers) {
      const { dateStr } = getCustDate(c);
      if (dateStr === todayStr) {
        res.today.push(c);
      } else if (dateStr === yesterdayStr) {
        res.yesterday.push(c);
      } else {
        res.earlier.push(c);
      }
    }

    const sortFn = (a: CustomerProfile, b: CustomerProfile) => {
      return getCustDate(b).timestamp - getCustDate(a).timestamp;
    };

    res.today.sort(sortFn);
    res.yesterday.sort(sortFn);
    res.earlier.sort(sortFn);

    return res;
  }, [customers]);

  const renderSection = (
    title: string,
    subtitle: string,
    items: CustomerProfile[],
    accentColor: string,
  ) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${accentColor}`} />
            <h3 className="font-display font-bold text-sm text-primary tracking-wide">
              {title}
            </h3>
            <span className="text-[11px] font-semibold text-text-muted bg-surface-2 px-2 py-0.5 rounded-full border border-border">
              {items.length}
            </span>
          </div>
          <span className="text-xs text-text-muted font-medium">{subtitle}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((cust) => {
            const partner = deliveryPartners.find(
              (p) => p.id === cust.deliveryPartnerId,
            );
            const zone = zones.find((z) => z.id === cust.zoneId);
            const defaultAddress =
              cust.addresses?.find((a) => a.id === cust.defaultAddressId) ||
              cust.addresses?.[0];
            const raw = cust.createdAt || cust.updatedAt;
            let timeLabel = "";
            try {
              if (raw) {
                const d = (raw as any).toDate ? (raw as any).toDate() : new Date(raw as any);
                timeLabel = format(d, "h:mm a");
              }
            } catch {
              timeLabel = "";
            }

            return (
              <Card
                key={cust.id}
                onClick={() => onSelect(cust)}
                className="p-4 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 bg-card border-border"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-primary truncate hover:text-gold transition-colors">
                        {cust.fullName}
                      </h4>
                      <p className="text-xs text-text-muted font-mono">
                        {formatAllottedId(cust.displayId, cust.id, "customer")}
                      </p>
                    </div>
                    {timeLabel && (
                      <span className="text-[11px] text-text-muted font-mono bg-surface-2 px-2 py-0.5 rounded border border-border shrink-0">
                        {timeLabel}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-text-muted mt-2">
                    <p className="flex items-center gap-1.5 truncate">
                      <span className="font-medium text-text">{cust.phone}</span>
                      {cust.email && <span className="text-text-faint">• {cust.email}</span>}
                    </p>
                    {defaultAddress && (
                      <p className="text-[11px] text-text-muted truncate">
                        📍 {[defaultAddress.line1, defaultAddress.city].filter(Boolean).join(", ")}
                        {defaultAddress.pincode ? ` (${defaultAddress.pincode})` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {partner ? (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium truncate max-w-[130px]">
                        🚚 {partner.fullName}
                      </span>
                    ) : zone ? (
                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium truncate max-w-[130px]">
                        📍 {zone.name}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                        Auto (Pincode)
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                      cust.isActive
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {cust.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const hasAnyActivity =
    groups.today.length > 0 ||
    groups.yesterday.length > 0 ||
    groups.earlier.length > 0;

  if (!hasAnyActivity) {
    return (
      <EmptyState
        icon={<Clock size={48} className="text-text-faint" />}
        title="No activity recorded"
        description="No recent customer activity was found."
      />
    );
  }

  return (
    <div className="space-y-6">
      {renderSection("Today", "Registered or updated today", groups.today, "bg-emerald-500")}
      {renderSection("Yesterday", "Registered or updated yesterday", groups.yesterday, "bg-amber-500")}
      {renderSection("Earlier", "Older customer records", groups.earlier, "bg-slate-400")}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type StatusFilter = "all" | "active" | "inactive" | "activity";

const TABS: { label: string; value: StatusFilter; icon: React.ReactNode }[] = [
  { label: "All", value: "all", icon: <Users size={16} /> },
  { label: "Active", value: "active", icon: <CheckCircle size={16} /> },
  { label: "Inactive", value: "inactive", icon: <XCircle size={16} /> },
  { label: "New Activity", value: "activity", icon: <Clock size={16} /> },
];

export function AdminCustomersPage() {
  const { id: customerUrlId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  // Pagination state
  const [pageHistory, setPageHistory] = useState<
    QueryDocumentSnapshot<UserProfile>[]
  >([]);
  const [currentPage, setCurrentPage] = useState(0);

  const currentLastDoc =
    currentPage > 0 ? pageHistory[currentPage - 1] : undefined;

  const { data, isLoading, error, refetch } = useAdminCustomers(currentLastDoc);
  const { data: staffUsers } = useStaffUsers();
  const { data: zones = [] } = useDeliveryZones();

  const customers = data?.rows ?? [];
  const deliveryPartners = (staffUsers || []).filter(
    (u) => u.role === "delivery_partner" && u.isActive,
  ) as DeliveryPartnerProfile[];

  // Deep-link: If URL has customerUrlId, fetch that customer directly
  const { data: directCustomer } = useQuery({
    queryKey: ["customer", customerUrlId],
    queryFn: () => (customerUrlId ? userRepository.getById(customerUrlId) : null),
    enabled: !!customerUrlId && (!selected || selected.id !== customerUrlId),
  });

  useEffect(() => {
    if (directCustomer && directCustomer.role === "customer" && (!selected || selected.id !== directCustomer.id)) {
      setSelected(directCustomer as CustomerProfile);
    }
  }, [directCustomer, selected]);

  const handleSelectCustomer = (customer: CustomerProfile) => {
    setSelected(customer);
    navigate(`/admin/customers/${customer.id}`);
  };

  const handleCloseCustomer = () => {
    setSelected(null);
    navigate("/admin/customers");
  };

  const handleNextPage = () => {
    if (data?.lastDoc) {
      setPageHistory((prev) => {
        const next = [...prev];
        next[currentPage] = data.lastDoc!;
        return next;
      });
      setCurrentPage((p) => p + 1);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(0, p - 1));
  };

  const handleTabChange = (tab: StatusFilter) => {
    setActiveTab(tab);
    setPageHistory([]);
    setCurrentPage(0);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPageHistory([]);
    setCurrentPage(0);
  };

  // Local filtering based on tabs and search
  const filtered = customers.filter((row) => {
    // 1. Filter by Tab
    if (activeTab === "active" && !row.isActive) return false;
    if (activeTab === "inactive" && row.isActive) return false;

    // 2. Filter by Search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const formattedId = formatAllottedId(
      row.displayId,
      row.id,
      "customer",
    ).toLowerCase();
    return (
      row.fullName.toLowerCase().includes(q) ||
      row.phone.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      formattedId.includes(q)
    );
  });

  if (isLoading)
    return (
      <div className="p-8">
        <TableSkeleton />
      </div>
    );
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          userName="Customers"
          subtitle="Could not load customer records."
        />
        <ErrorState
          title="Could not load customers"
          description="We had trouble loading customer records."
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        userName="Customers"
        subtitle="Manage customer profiles, addresses, and partner assignments."
      />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          {/* Tab bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-all border shrink-0 ${
                  activeTab === tab.value
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-surface-2 text-text-muted border-border hover:border-secondary/40"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:min-w-[300px] flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search..."
              className="w-full pl-10 pr-16 h-11 bg-card border border-border rounded-[14px] text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary/60 shadow-xs transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-text-muted hover:text-text p-1"
                >
                  <X size={14} />
                </button>
              )}
              <div className="w-[1px] h-4 bg-border hidden sm:block"></div>
              <button className="text-text-muted hover:text-primary transition-colors flex items-center gap-1.5 p-1 rounded hover:bg-surface-2">
                <Filter size={16} />
                <span className="text-xs font-semibold hidden sm:inline">
                  Filter
                </span>
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={48} className="text-text-faint" />}
            title="No customers found"
            description={
              search
                ? "No customers match your search query."
                : `No ${activeTab === "all" ? "" : activeTab} customers found.`
            }
          />
        ) : activeTab === "activity" ? (
          <CustomerActivityView
            customers={filtered}
            onSelect={handleSelectCustomer}
            deliveryPartners={deliveryPartners}
            zones={zones}
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <Card className="p-0 overflow-hidden shadow-md border-primary/20 hidden lg:block">
              <table className="w-full text-left text-sm font-sans">
                <thead className="bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Partner/Zone</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5 bg-background">
                  {filtered.map((row) => {
                    const defaultAddress =
                      row.addresses?.find(
                        (a: any) => a.id === row.defaultAddressId,
                      ) || row.addresses?.[0];
                    const locationText = defaultAddress
                      ? [defaultAddress.line1, defaultAddress.city]
                          .filter(Boolean)
                          .join(", ")
                      : "No address";
                    const partner = deliveryPartners.find(
                      (p) => p.id === row.deliveryPartnerId,
                    );

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-primary/5 transition-colors group cursor-pointer"
                        onClick={() => handleSelectCustomer(row)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">
                            {row.fullName}
                          </div>
                          <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">
                            {formatAllottedId(row.displayId, row.id, "customer")}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-data text-primary font-medium">
                            {row.phone}
                          </div>
                          <div className="text-text-muted text-xs mt-0.5 truncate max-w-[150px]">
                            {row.email}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-text-muted text-xs truncate max-w-[200px] flex items-center gap-1">
                            <span className="text-[13px] leading-none">📍</span>{" "}
                            {locationText}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {partner ? (
                            <Badge
                              variant="info"
                              className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 whitespace-nowrap"
                            >
                              🚚 {partner.fullName}
                            </Badge>
                          ) : row.zoneId ? (
                            <Badge
                              variant="default"
                              className="text-[10px] px-1.5 py-0.5 shadow-sm bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap"
                            >
                              📍 Assigned to Zone
                            </Badge>
                          ) : (
                            <Badge
                              variant="warning"
                              className="text-[10px] px-1.5 py-0.5 shadow-sm whitespace-nowrap"
                            >
                              ⚠ Auto (Pincode)
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={row.isActive ? "success" : "danger"}
                            className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5"
                          >
                            {row.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectCustomer(row);
                            }}
                          >
                            Manage
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile / Tablet Card View */}
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((row) => (
                <CustomerCardView
                  key={row.id}
                  customer={row}
                  onSelect={() => handleSelectCustomer(row)}
                  deliveryPartners={deliveryPartners}
                  zones={zones}
                />
              ))}
            </div>

            <div className="flex flex-col items-center justify-center sm:flex-row sm:justify-between gap-4 px-2 pt-4 border-t border-border mt-2">
              <span className="text-sm font-medium text-text-muted text-center sm:text-left">
                Showing{" "}
                <strong className="text-primary">{filtered.length}</strong>{" "}
                customer{filtered.length !== 1 ? "s" : ""} on this page
              </span>
              <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0 || isLoading}
                  className="flex-1 sm:flex-none"
                >
                  <ChevronLeft size={16} className="mr-1" /> Prev
                </Button>
                <span className="text-sm font-bold text-text-muted px-2">
                  Page {currentPage + 1}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!data?.lastDoc || isLoading}
                  className="flex-1 sm:flex-none"
                >
                  Next <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <CustomerDetailDialog
          customer={selected}
          onClose={handleCloseCustomer}
        />
      )}
    </div>
  );
}
