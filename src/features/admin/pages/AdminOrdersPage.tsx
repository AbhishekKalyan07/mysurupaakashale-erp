import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Loader2, Search, SlidersHorizontal, X, RefreshCw, Copy, MapPin } from "lucide-react";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { OrderCard } from "@/shared/components/ui/OrderCard";
import { StatusChip } from "@/shared/components/ui/StatusChip";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { orderRepository } from "@/shared/services/firestore/orderRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { getTodayIST } from "@/features/kitchen/hooks/useKitchenDashboard";
import { getHourInTimezone } from "@/shared/lib/date";
import type { Order, OrderStatus, MealType } from "@/shared/types";
import toast from "react-hot-toast";
import { useCustomerNameMap as usePartnerNameMap } from "@/features/admin/hooks/useAdmin";
import { useOrderAutoChecker } from "@/features/admin/hooks/useOrderAutoChecker";
import { OrderDiagnosticCard } from "@/features/admin/components/OrderDiagnosticCard";
import { cn } from "@/shared/lib/cn";
import { formatAllottedId } from "@/shared/utils/displayId";

// ─────────────────────────────────────────────────────────────────────────────
// Customer detail fetcher (for OrderCard customer prop)
// ─────────────────────────────────────────────────────────────────────────────

function useCustomerProfileMap(customerIds: string[]) {
  const uniqueIds = useMemo(
    () => Array.from(new Set(customerIds)).filter(Boolean).sort(),
    [customerIds],
  );

  return useQuery({
    queryKey: ["admin", "customer-profiles-map", uniqueIds.join(",")],
    queryFn: async () => {
      const users = await userRepository.getByIds(uniqueIds);
      const map = new Map<string, (typeof users)[number]>();
      users.forEach((u) => {
        if (u && u.id) {
          map.set(u.id, u);
        }
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
    enabled: uniqueIds.length > 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Status filter chips
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_KPI_CHIPS: Array<{
  key: OrderStatus | "all" | "unassigned";
  label: string;
  color: string;
  activeColor: string;
}> = [
  {
    key: "all",
    label: "All",
    color: "bg-surface-2 text-text-muted border-border",
    activeColor: "bg-primary text-white border-primary",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    color: "bg-danger-subtle text-danger border-danger/30",
    activeColor: "bg-danger text-white border-danger",
  },
  {
    key: "scheduled",
    label: "Scheduled",
    color: "bg-[#F3EBF7] text-[#6A1B9A] border-[#CE93D8]",
    activeColor: "bg-[#6A1B9A] text-white border-[#6A1B9A]",
  },
  {
    key: "preparing",
    label: "Preparing",
    color: "bg-info-subtle text-info border-info/30",
    activeColor: "bg-info text-white border-info",
  },
  {
    key: "ready_for_pickup",
    label: "Ready",
    color: "bg-pastel-lavender text-secondary border-secondary/30",
    activeColor: "bg-secondary text-white border-secondary",
  },
  {
    key: "out_for_delivery",
    label: "Out for Delivery",
    color: "bg-pastel-orange text-[#E65100] border-[#FFCC80]",
    activeColor: "bg-[#E65100] text-white border-[#E65100]",
  },
  {
    key: "delivered",
    label: "Delivered",
    color: "bg-success-subtle text-success border-success/30",
    activeColor: "bg-success text-white border-success",
  },
  {
    key: "failed_delivery",
    label: "Failed",
    color: "bg-danger-subtle text-danger border-danger/30",
    activeColor: "bg-danger text-white border-danger",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    color: "bg-surface-3 text-text-muted border-border",
    activeColor: "bg-text-muted text-white border-text-muted",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDefaultMealType(): MealType | "all" {
  const hour = getHourInTimezone();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 23) return "dinner";
  return "all";
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Order Detail Dialog
// ─────────────────────────────────────────────────────────────────────────────

function AdminOrderDetailDialog({
  order,
  customer,
  partnerName,
  onClose,
  onRefresh,
}: {
  order: Order;
  customer?: any;
  partnerName?: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelMeal = async () => {
    if (!order.subscriptionId) return;
    if (
      !confirm(
        `Cancel ${order.mealType} meal for today? This will apply canonical cancellation credit to the customer's invoice according to business rules.`,
      )
    ) {
      return;
    }
    setIsCancelling(true);
    try {
      const { orderService } = await import(
        "@/shared/services/business/orderService"
      );
      const result = await orderService.removeTodayMeal(
        order.subscriptionId,
        order.mealType,
      );
      toast.success(
        `Meal cancelled. ₹${result.cancellationAmount} credit applied to invoice.`,
      );
      onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel meal.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90dvh] my-auto overflow-y-auto border border-primary/20 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-primary font-display">
                Order Details
              </h2>
              <StatusChip status={order.status} size="sm" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-text-muted text-xs font-mono bg-background-alt px-2 py-0.5 rounded border border-primary/10">
                {order.displayId || order.id}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(order.displayId || order.id);
                  toast.success("Order ID copied!");
                }}
                className="text-[11px] font-mono text-primary/70 hover:text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10 flex items-center gap-1 cursor-pointer min-h-[28px]"
                title="Copy Order ID"
              >
                Copy <Copy size={11} />
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-primary hover:text-gold p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto">
          {/* Add-on banner if add-on */}
          {order.isAddon && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-800 uppercase tracking-wider text-[11px]">
                  ✨ Add-on Order
                </span>
                <span className="font-bold text-amber-900 text-sm">
                  ₹{order.price}
                </span>
              </div>
              <p className="text-text font-medium">
                {order.addonName} (Qty: {order.addonQuantity || 1} @ ₹
                {order.addonUnitPrice || order.price}/ea)
              </p>
              {order.invoiceId && (
                <p className="text-[10px] font-mono text-text-muted">
                  Linked Invoice: {order.invoiceId}
                </p>
              )}
            </div>
          )}

          {/* Customer section */}
          <div className="bg-surface-2 rounded-xl p-3.5 border border-border space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Customer Information
            </div>
            <div className="font-bold text-text text-sm">
              {customer?.fullName || order.customerName || "Customer"}
            </div>
            {(customer?.phone || order.customerPhone) && (
              <div className="text-text-muted">
                Phone: {customer?.phone || order.customerPhone}
              </div>
            )}
            {(customer?.address || order.address) && (
              <div className="text-text-muted flex items-start gap-1 mt-1">
                <MapPin size={12} className="shrink-0 mt-0.5 text-secondary" />
                <span>{customer?.address || order.address}</span>
              </div>
            )}
          </div>

          {/* Meal & Delivery Details */}
          <div className="bg-surface-2 rounded-xl p-3.5 border border-border space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Delivery & Fulfillment
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-text-muted block text-[10px]">
                  Meal Type
                </span>
                <span className="font-semibold text-text capitalize">
                  {order.mealType}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-[10px]">
                  Delivery Date
                </span>
                <span className="font-semibold text-text">{order.date}</span>
              </div>
              {order.mealName && (
                <div className="col-span-2">
                  <span className="text-text-muted block text-[10px]">
                    Meal / Dish Name
                  </span>
                  <span className="font-semibold text-text" data-testid="order-meal-name">
                    {order.mealName}
                  </span>
                </div>
              )}
              {order.itemsLabel && (
                <div className="col-span-2">
                  <span className="text-text-muted block text-[10px]">
                    Items Included
                  </span>
                  <span className="font-semibold text-text" data-testid="order-items-label">
                    {order.itemsLabel}
                  </span>
                </div>
              )}
              {order.deliveryWindow && (
                <div>
                  <span className="text-text-muted block text-[10px]">
                    Delivery Window
                  </span>
                  <span className="font-semibold text-text">
                    {order.deliveryWindow.start} – {order.deliveryWindow.end}
                  </span>
                </div>
              )}
              <div>
                <span className="text-text-muted block text-[10px]">
                  Delivery Partner
                </span>
                <span className="font-semibold text-text">
                  {partnerName ||
                    (order.deliveryPartnerId ? "Assigned" : "Unassigned")}
                </span>
              </div>
              {order.kitchenStatus && (
                <div>
                  <span className="text-text-muted block text-[10px]">
                    Kitchen Status
                  </span>
                  <span className="font-semibold text-text capitalize">
                    {order.kitchenStatus}
                  </span>
                </div>
              )}
              <div>
                <span className="text-text-muted block text-[10px]">
                  Source
                </span>
                <span className="font-semibold text-text capitalize">
                  {order.source === "subscription"
                    ? "Subscription"
                    : "One-Time"}
                </span>
              </div>
            </div>

            {order.specialInstructions && (
              <div className="pt-2 border-t border-border">
                <span className="text-[10px] font-bold text-warning uppercase tracking-wider block">
                  Special Instructions
                </span>
                <span className="text-text font-medium">
                  {order.specialInstructions}
                </span>
              </div>
            )}
            {order.packingNotes && (
              <div className="pt-2 border-t border-border">
                <span className="text-[10px] font-bold text-info uppercase tracking-wider block">
                  Packing Notes
                </span>
                <span className="text-text font-medium">
                  {order.packingNotes}
                </span>
              </div>
            )}
          </div>

          {/* Financial details */}
          <div className="bg-surface-2 rounded-xl p-3.5 border border-border flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Order Amount
              </span>
              <span className="text-base font-bold text-primary">
                ₹{order.price || 0} {order.currency || "INR"}
              </span>
            </div>
            {order.subscriptionId && (
              <div className="text-right">
                <span className="text-[10px] text-text-muted block">
                  Subscription ID
                </span>
                <span className="font-mono text-[11px] text-text-muted">
                  {order.subscriptionId.slice(0, 12)}...
                </span>
              </div>
            )}
          </div>

          {/* Cancellation button if eligible today order */}
          {order.status === "scheduled" &&
            order.source === "subscription" &&
            order.subscriptionId && (
              <div className="pt-2">
                <Button
                  variant="danger-tonal"
                  size="sm"
                  onClick={handleCancelMeal}
                  disabled={isCancelling}
                  className="w-full text-xs font-semibold py-2.5 min-h-[44px] h-auto whitespace-normal break-words"
                >
                  {isCancelling
                    ? "Cancelling Meal..."
                    : "Cancel Today Meal (Apply Credit to Invoice)"}
                </Button>
                <p className="text-[10px] text-text-muted text-center mt-1">
                  Enforces business cutoffs and applies canonical subscription meal
                  credit.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const today = getTodayIST();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [statusFilter, setStatusFilter] = useState<
    OrderStatus | "all" | "unassigned"
  >("all");
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType | "all">(
    getDefaultMealType(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDetailOrder, setSelectedDetailOrder] = useState<Order | null>(
    null,
  );

  const queryKey = useMemo(
    () => ["admin", "orders", selectedDate],
    [selectedDate],
  );

  useEffect(() => {
    if (!selectedDate) return;
    const unsubscribe = orderRepository.subscribeToDayOrders(
      selectedDate,
      undefined,
      (ordersData: Order[]) => queryClient.setQueryData(queryKey, ordersData),
    );
    return () => unsubscribe();
  }, [selectedDate, queryClient, queryKey]);

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => orderRepository.getByDate(selectedDate),
    staleTime: 0,
  });

  const { diagnosticResult, isChecking, recheck } = useOrderAutoChecker(
    selectedDate,
    orders.length,
    isLoading,
  );

  const allCustomerIds = useMemo(
    () => [...new Set(orders.map((o) => o.customerId))],
    [orders],
  );
  const allPartnerIds = useMemo(
    () => [
      ...new Set(
        orders.map((o) => o.deliveryPartnerId).filter(Boolean) as string[],
      ),
    ],
    [orders],
  );

  const { data: customerMap = new Map() } =
    useCustomerProfileMap(allCustomerIds);
  const partnerNameMap = usePartnerNameMap(allPartnerIds);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      newStatus,
    }: {
      orderId: string;
      newStatus: OrderStatus;
    }) => {
      await orderRepository.updateWorkflow(
        orderId,
        newStatus,
        "Admin override",
      );
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({
        queryKey: ["admin", "orders", selectedDate],
      });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update status");
    },
  });

  // Compute per-status counts for KPI chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      unassigned: 0,
    };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (!o.deliveryPartnerId) {
        counts.unassigned++;
      }
    }
    return counts;
  }, [orders]);

  if (error) {
    return (
      <ErrorState
        title="Failed to load orders"
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: ["admin", "orders"] })
        }
      />
    );
  }

  const mealSortOrder: Record<string, number> = {
    breakfast: 1,
    lunch: 2,
    dinner: 3,
  };

  const filteredOrders = orders
    .filter((o) => {
      if (statusFilter === "unassigned" && o.deliveryPartnerId) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "unassigned" &&
        o.status !== statusFilter
      )
        return false;
      if (mealTypeFilter !== "all" && o.mealType !== mealTypeFilter)
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customer = customerMap.get(o.customerId);
        const cName = (customer?.fullName || o.customerName || "").toLowerCase();
        const displayId = (customer?.displayId || o.customerCode || "").toLowerCase();
        const oDisplayId = (o.displayId || "").toLowerCase();
        if (
          !cName.includes(q) &&
          !displayId.includes(q) &&
          !oDisplayId.includes(q) &&
          !o.id.includes(q)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.mealType !== b.mealType) {
        return (
          (mealSortOrder[a.mealType] || 99) - (mealSortOrder[b.mealType] || 99)
        );
      }
      return (a.deliveryWindow?.start || "").localeCompare(
        b.deliveryWindow?.start || "",
      );
    });

  const handleStatusChange = async (
    orderId: string,
    newStatus: OrderStatus,
  ) => {
    await updateStatusMutation.mutateAsync({ orderId, newStatus });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        userName="Orders"
        subtitle={`${selectedDate} · ${orders.length} total`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => recheck()}
              disabled={isChecking}
              className="flex items-center gap-1.5 h-9"
            >
              <RefreshCw
                size={14}
                className={cn(isChecking && "animate-spin text-secondary")}
              />
              <span className="hidden sm:inline">Diagnose</span>
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto text-sm h-9 px-3"
            />
          </div>
        }
      />

      {/* When orders exist but there are pauses/skips/faults, show diagnostic banner */}
      {orders.length > 0 && diagnosticResult && (
        <OrderDiagnosticCard
          diagnostic={diagnosticResult}
          isChecking={isChecking}
          onRecheck={recheck}
        />
      )}

      {/* Search + Filter toggle row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search customer, MP-A001, ORD-..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-[14px] border border-border bg-card text-sm text-text placeholder:text-text-faint focus:border-secondary/60 focus:outline-none focus:ring-2 focus:ring-secondary/20 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? "tonal" : "secondary"}
          size="md"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filters</span>
        </Button>
      </div>

      {/* Expanded filters */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          showFilters
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="bg-card rounded-[20px] border border-border p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2">
                Meal Type
              </label>
              <div className="flex flex-wrap gap-2">
                {(["all", "breakfast", "lunch", "dinner"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMealTypeFilter(m)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                      mealTypeFilter === m
                        ? "bg-primary text-white border-primary"
                        : "bg-surface-2 text-text-muted border-border hover:border-secondary/40",
                    )}
                  >
                    {m === "all"
                      ? "All Meals"
                      : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status KPI Filter Chips — horizontally scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {STATUS_KPI_CHIPS.map((chip) => {
          const count = statusCounts[chip.key] || 0;
          const isActive = statusFilter === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setStatusFilter(chip.key as OrderStatus | "all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                isActive ? chip.activeColor : chip.color,
                "hover:shadow-xs",
              )}
            >
              {chip.label}
              {count > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                    isActive ? "bg-white/25" : "bg-black/10",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex h-52 items-center justify-center rounded-[20px] border border-dashed border-secondary/30 bg-pastel-lavender/30">
          <Loader2 className="h-7 w-7 animate-spin text-secondary" />
        </div>
      ) : orders.length === 0 ? (
        <OrderDiagnosticCard
          diagnostic={diagnosticResult}
          isChecking={isChecking}
          onRecheck={recheck}
        />
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-surface-2 py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-text-faint" />
          <h3 className="text-base font-display font-bold text-text">
            No Orders Found
          </h3>
          <p className="mt-1 text-sm text-text-muted max-w-xs">
            No orders match the selected filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => {
            const customer = customerMap.get(order.customerId);
            const addr =
              customer?.addresses?.find(
                (a: any) => a.id === customer?.defaultAddressId,
              ) || customer?.addresses?.[0];
            const addressText = addr
              ? [addr.line1, addr.line2, addr.city].filter(Boolean).join(", ")
              : undefined;
            const planName = order.planTier
              ? order.planTier.charAt(0).toUpperCase() + order.planTier.slice(1)
              : null;

            return (
              <OrderCard
                key={order.id}
                order={order}
                variant="admin"
                customer={
                  customer
                    ? {
                        fullName: customer.fullName,
                        displayId: customer.displayId,
                        phone: customer.phone,
                        photoUrl: customer.photoUrl,
                        address: addressText,
                      }
                    : {
                        fullName:
                          order.customerName ||
                          formatAllottedId(
                            order.customerCode,
                            order.customerId,
                            "customer",
                          ),
                        displayId: order.customerCode,
                        phone: order.customerPhone,
                        address: order.address,
                      }
                }
                planName={planName}
                partnerName={
                  order.deliveryPartnerId
                    ? partnerNameMap.get(order.deliveryPartnerId) ||
                      formatAllottedId(
                        undefined,
                        order.deliveryPartnerId,
                        "delivery_partner",
                      )
                    : null
                }
                onStatusChange={handleStatusChange}
                isAdvancing={
                  updateStatusMutation.isPending &&
                  updateStatusMutation.variables?.orderId === order.id
                }
                extraActions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDetailOrder(order)}
                    className="h-8 px-2 text-xs"
                  >
                    Details
                  </Button>
                }
              />
            );
          })}
        </div>
      )}

      {selectedDetailOrder && (
        <AdminOrderDetailDialog
          order={selectedDetailOrder}
          customer={customerMap.get(selectedDetailOrder.customerId)}
          partnerName={
            selectedDetailOrder.deliveryPartnerId
              ? partnerNameMap.get(selectedDetailOrder.deliveryPartnerId) ||
                formatAllottedId(
                  undefined,
                  selectedDetailOrder.deliveryPartnerId,
                  "delivery_partner",
                )
              : null
          }
          onClose={() => setSelectedDetailOrder(null)}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey });
          }}
        />
      )}
    </div>
  );
}
