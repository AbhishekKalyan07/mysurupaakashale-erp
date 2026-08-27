import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { OrderCard } from '@/shared/components/ui/OrderCard';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import type { Order, OrderStatus, MealType } from '@/shared/types';
import toast from 'react-hot-toast';
import { useCustomerNameMap, useCustomerNameMap as usePartnerNameMap } from '@/features/admin/hooks/useAdmin';
import { cn } from '@/shared/lib/cn';

// ─────────────────────────────────────────────────────────────────────────────
// Customer detail fetcher (for OrderCard customer prop)
// ─────────────────────────────────────────────────────────────────────────────

function useCustomerMap(customerIds: string[]) {
  return useQuery({
    queryKey: ['customers-map', customerIds.join(',')],
    queryFn: async () => {
      const { where } = await import('firebase/firestore');
      const users = await userRepository.list(where('role', '==', 'customer'));
      return new Map(users.map(u => [u.id, u]));
    },
    staleTime: 5 * 60 * 1000,
    enabled: customerIds.length > 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Status filter chips
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_KPI_CHIPS: Array<{
  key: OrderStatus | 'all';
  label: string;
  color: string;
  activeColor: string;
}> = [
  { key: 'all',              label: 'All',           color: 'bg-surface-2 text-text-muted border-border',                        activeColor: 'bg-primary text-white border-primary' },
  { key: 'scheduled',        label: 'Scheduled',     color: 'bg-[#F3EBF7] text-[#6A1B9A] border-[#CE93D8]',                     activeColor: 'bg-[#6A1B9A] text-white border-[#6A1B9A]' },
  { key: 'preparing',        label: 'Preparing',     color: 'bg-info-subtle text-info border-info/30',                           activeColor: 'bg-info text-white border-info' },
  { key: 'ready_for_pickup', label: 'Ready',         color: 'bg-pastel-lavender text-secondary border-secondary/30',             activeColor: 'bg-secondary text-white border-secondary' },
  { key: 'out_for_delivery', label: 'Out for Delivery', color: 'bg-pastel-orange text-[#E65100] border-[#FFCC80]',              activeColor: 'bg-[#E65100] text-white border-[#E65100]' },
  { key: 'delivered',        label: 'Delivered',     color: 'bg-success-subtle text-success border-success/30',                  activeColor: 'bg-success text-white border-success' },
  { key: 'failed_delivery',  label: 'Failed',        color: 'bg-danger-subtle text-danger border-danger/30',                    activeColor: 'bg-danger text-white border-danger' },
  { key: 'cancelled',        label: 'Cancelled',     color: 'bg-surface-3 text-text-muted border-border',                       activeColor: 'bg-text-muted text-white border-text-muted' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDefaultMealType(): MealType | 'all' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 23) return 'dinner';
  return 'all';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const today = getTodayIST();
  
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType | 'all'>(getDefaultMealType());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const queryKey = useMemo(() => ['admin', 'orders', selectedDate], [selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    const unsubscribe = orderRepository.subscribeToDayOrders(
      selectedDate,
      undefined,
      (ordersData: Order[]) => queryClient.setQueryData(queryKey, ordersData)
    );
    return () => unsubscribe();
  }, [selectedDate, queryClient, queryKey]);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => orderRepository.getByDate(selectedDate),
    staleTime: 0,
  });

  const allCustomerIds = useMemo(() => [...new Set(orders.map(o => o.customerId))], [orders]);
  const allPartnerIds = useMemo(() => [...new Set(orders.map(o => o.deliveryPartnerId).filter(Boolean) as string[])], [orders]);
  
  const nameMap = useCustomerNameMap(allCustomerIds);
  const { data: customerMap = new Map() } = useCustomerMap(allCustomerIds);
  const partnerNameMap = usePartnerNameMap(allPartnerIds);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string, newStatus: OrderStatus }) => {
      await orderRepository.updateWorkflow(orderId, newStatus, 'Admin override');
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', selectedDate] });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update status');
    }
  });

  // Compute per-status counts for KPI chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  if (error) {
    return <ErrorState title="Failed to load orders" onRetry={() => queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })} />;
  }

  const mealSortOrder: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };

  const filteredOrders = orders
    .filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (mealTypeFilter !== 'all' && o.mealType !== mealTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cName = (nameMap.get(o.customerId) || '').toLowerCase();
        const customer = customerMap.get(o.customerId);
        const displayId = (customer?.displayId || '').toLowerCase();
        if (!cName.includes(q) && !displayId.includes(q) && !o.id.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.mealType !== b.mealType) {
        return (mealSortOrder[a.mealType] || 99) - (mealSortOrder[b.mealType] || 99);
      }
      return (a.deliveryWindow?.start || '').localeCompare(b.deliveryWindow?.start || '');
    });

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    await updateStatusMutation.mutateAsync({ orderId, newStatus });
  };

  return (
    <div className="space-y-5">
      <PageHeader 
        userName="Orders"
        subtitle={`${selectedDate} · ${orders.length} total`}
        actions={
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto text-sm h-9 px-3"
          />
        }
      />

      {/* Search + Filter toggle row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search customer, MP-A001..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-[14px] border border-border bg-card text-sm text-text placeholder:text-text-faint focus:border-secondary/60 focus:outline-none focus:ring-2 focus:ring-secondary/20 shadow-xs"
          />
          {searchQuery && (
            <button aria-label="Button action"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? 'tonal' : 'secondary'}
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
          'grid transition-all duration-300 ease-in-out',
          showFilters ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="bg-card rounded-[20px] border border-border p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-2">Meal Type</label>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'breakfast', 'lunch', 'dinner'] as const).map(m => (
                    <button aria-label="Button action"
                      key={m}
                      onClick={() => setMealTypeFilter(m)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                        mealTypeFilter === m
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface-2 text-text-muted border-border hover:border-secondary/40'
                      )}
                    >
                      {m === 'all' ? 'All Meals' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Status KPI Filter Chips — horizontally scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {STATUS_KPI_CHIPS.map(chip => {
          const count = statusCounts[chip.key] || 0;
          const isActive = statusFilter === chip.key;
          return (
            <button aria-label="Button action"
              key={chip.key}
              onClick={() => setStatusFilter(chip.key as OrderStatus | 'all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-all shrink-0',
                isActive ? chip.activeColor : chip.color,
                'hover:shadow-xs'
              )}
            >
              {chip.label}
              {count > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  isActive ? 'bg-white/25' : 'bg-black/10'
                )}>
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
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-surface-2 py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-text-faint" />
          <h3 className="text-base font-display font-bold text-text">No Orders Found</h3>
          <p className="mt-1 text-sm text-text-muted max-w-xs">
            No orders match the selected filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOrders.map((order) => {
              const customer = customerMap.get(order.customerId);
              const addr = customer?.addresses?.find((a: any) => a.id === customer?.defaultAddressId) || customer?.addresses?.[0];
              const addressText = addr ? [addr.line1, addr.line2, addr.city].filter(Boolean).join(', ') : undefined;
              const planName = order.planTier ? order.planTier.charAt(0).toUpperCase() + order.planTier.slice(1) : null;

              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  variant="admin"
                  customer={customer ? {
                    fullName: customer.fullName,
                    displayId: customer.displayId,
                    phone: customer.phone,
                    photoUrl: customer.photoUrl,
                    address: addressText,
                  } : { fullName: nameMap.get(order.customerId) || order.customerId }}
                  planName={planName}
                  partnerName={order.deliveryPartnerId ? partnerNameMap.get(order.deliveryPartnerId) : null}
                  onStatusChange={handleStatusChange}
                  isAdvancing={updateStatusMutation.isPending && updateStatusMutation.variables?.orderId === order.id}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
