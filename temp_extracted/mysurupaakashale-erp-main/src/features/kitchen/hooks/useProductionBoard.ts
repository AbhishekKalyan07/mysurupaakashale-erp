import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { serverTimestamp } from 'firebase/firestore';
import type { Order, MealType, OrderStatus } from '@/shared/types';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getTodayIST } from './useKitchenDashboard';

// Re-export for consumers that want the date helper without importing from Dashboard hook
export { getTodayIST };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type KitchenWorkflowStatus = Extract<
  OrderStatus,
  'scheduled' | 'preparing' | 'ready_for_pickup'
>;

export interface EnrichedOrder extends Order {
  /** Resolved from users/{customerId}. Falls back to customerId if not loaded. */
  customerName: string;
}

export interface ProductionBoardFilters {
  searchQuery: string;
  statusFilter: KitchenWorkflowStatus | 'all';
  zoneFilter: string | 'all';
  sortBy: 'customer' | 'zone' | 'status';
}

export const DEFAULT_FILTERS: ProductionBoardFilters = {
  searchQuery: '',
  statusFilter: 'all',
  zoneFilter: 'all',
  sortBy: 'customer',
};

// ─────────────────────────────────────────────────────────────────────────────
// useMealTypeOrders — live orders for one meal type (shared by the three below)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core hook: live Firestore subscription for a single meal type.
 * Each meal section mounts its own subscription so a status change in breakfast
 * doesn't trigger a re-render in the lunch or dinner section.
 *
 * Architecture constraint: reads ONLY from `orders` — never `subscriptions`.
 */
function useMealTypeOrders(date: string, mealType: MealType) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.kitchen.mealTypeOrders(date, mealType);

  useEffect(() => {
    const unsubscribe = orderRepository.subscribeToDayMealTypeOrders(
      date,
      mealType,
      (orders) => queryClient.setQueryData(queryKey, orders),
      (err) => console.error(`[useMealTypeOrders:${mealType}] onSnapshot error:`, err)
    );
    return unsubscribe;
  }, [date, mealType, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery<Order[]>({
    queryKey,
    queryFn: () => orderRepository.getByDateAndMealType(date, mealType),
    staleTime: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public per-meal-type hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useBreakfastOrders(date = getTodayIST()) {
  return useMealTypeOrders(date, 'breakfast');
}

export function useLunchOrders(date = getTodayIST()) {
  return useMealTypeOrders(date, 'lunch');
}

export function useDinnerOrders(date = getTodayIST()) {
  return useMealTypeOrders(date, 'dinner');
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer name resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Batch-fetches user profiles for unique customerIds present in any order.
 * Results are cached by React Query under individual profile keys so they
 * survive across page navigations and are not re-fetched when order status
 * updates come in (customer names don't change).
 *
 * Returns a map of { customerId → displayName }.
 */
export function useCustomerNameMap(customerIds: string[]): Map<string, string> {
  const uniqueIds = useMemo(() => [...new Set(customerIds)], [customerIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // One useQuery per unique customerId. React Query deduplicates concurrent
  // requests for the same uid automatically.
  const profileQueries = useQuery({
    queryKey: ['kitchen', 'customerProfiles', ...uniqueIds],
    queryFn: async () => {
      if (uniqueIds.length === 0) return {};
      const profiles = await Promise.all(
        uniqueIds.map((uid) => userRepository.getById(uid).catch(() => null))
      );
      const map: Record<string, string> = {};
      uniqueIds.forEach((uid, i) => {
        map[uid] = profiles[i]?.fullName ?? uid;
      });
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000, // names don't change frequently; 5-min cache
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    if (profileQueries.data) {
      for (const [uid, name] of Object.entries(profileQueries.data)) {
        map.set(uid, name);
      }
    }
    return map;
  }, [profileQueries.data]);
}

// ─────────────────────────────────────────────────────────────────────────────
// useProductionBoard — all three sections + enrichment + filtering
// ─────────────────────────────────────────────────────────────────────────────

export interface MealSection {
  mealType: MealType;
  allOrders: EnrichedOrder[];
  filteredOrders: EnrichedOrder[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  total: number;
  scheduledCount: number;
  preparingCount: number;
  readyCount: number;
}

export interface UseProductionBoardReturn {
  breakfast: MealSection;
  lunch: MealSection;
  dinner: MealSection;
  filters: ProductionBoardFilters;
  setFilters: React.Dispatch<React.SetStateAction<ProductionBoardFilters>>;
  allZones: string[];
  isAnyLoading: boolean;
  isAnyError: boolean;
  /** Updates order status directly in Firestore. Moved from Cloud Function to client-side write (Spark plan). */
  advanceStatus: (orderId: string, newStatus: KitchenWorkflowStatus) => Promise<void>;
  isAdvancing: boolean;
}

export function useProductionBoard(): UseProductionBoardReturn {
  const today = getTodayIST();
  const [filters, setFilters] = useState<ProductionBoardFilters>(DEFAULT_FILTERS);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────
  const breakfastQuery = useBreakfastOrders(today);
  const lunchQuery = useLunchOrders(today);
  const dinnerQuery = useDinnerOrders(today);

  // ── Collect all customer IDs for name resolution ─────────────────────────
  const allOrders = useMemo(
    () => [
      ...(breakfastQuery.data ?? []),
      ...(lunchQuery.data ?? []),
      ...(dinnerQuery.data ?? []),
    ],
    [breakfastQuery.data, lunchQuery.data, dinnerQuery.data]
  );

  const allCustomerIds = useMemo(
    () => allOrders.map((o) => o.customerId),
    [allOrders]
  );

  const nameMap = useCustomerNameMap(allCustomerIds);

  // ── All delivery zones (for the zone filter dropdown) ────────────────────
  const allZones = useMemo(() => {
    const zones = new Set<string>();
    for (const o of allOrders) {
      if (o.zoneId) zones.add(o.zoneId);
    }
    return Array.from(zones).sort();
  }, [allOrders]);

  // ── Enrich + filter helper ────────────────────────────────────────────────
  const enrichAndFilter = useMemo(
    () =>
      (orders: Order[] | undefined): { all: EnrichedOrder[]; filtered: EnrichedOrder[] } => {
        if (!orders) return { all: [], filtered: [] };

        const enriched: EnrichedOrder[] = orders.map((o) => ({
          ...o,
          customerName: nameMap.get(o.customerId) ?? o.customerId,
        }));

        const filtered = enriched
          .filter((o) => {
            // Status filter
            if (filters.statusFilter !== 'all' && o.status !== filters.statusFilter) {
              return false;
            }
            // Zone filter
            if (filters.zoneFilter !== 'all' && o.zoneId !== filters.zoneFilter) {
              return false;
            }
            // Search — match customer name or plan tier (case-insensitive)
            if (filters.searchQuery.trim()) {
              const q = filters.searchQuery.toLowerCase();
              const matchesName = o.customerName.toLowerCase().includes(q);
              const matchesPlan = (o.planTier ?? '').toLowerCase().includes(q);
              if (!matchesName && !matchesPlan) return false;
            }
            return true;
          })
          .sort((a, b) => {
            switch (filters.sortBy) {
              case 'zone':
                return (a.zoneId ?? '').localeCompare(b.zoneId ?? '');
              case 'status':
                return STATUS_SORT_ORDER[a.status as OrderStatus] -
                       STATUS_SORT_ORDER[b.status as OrderStatus];
              case 'customer':
              default:
                return a.customerName.localeCompare(b.customerName);
            }
          });

        return { all: enriched, filtered };
      },
    [nameMap, filters]
  );

  // ── Build meal sections ───────────────────────────────────────────────────
  const buildSection = (mealType: MealType, query: ReturnType<typeof useBreakfastOrders>): MealSection => {
    const { all, filtered } = enrichAndFilter(query.data);
    return {
      mealType,
      allOrders: all,
      filteredOrders: filtered,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error ?? null,
      total: all.length,
      scheduledCount:  all.filter((o) => o.status === 'scheduled').length,
      preparingCount:  all.filter((o) => o.status === 'preparing').length,
      readyCount:      all.filter((o) => o.status === 'ready_for_pickup').length,
    };
  };

  const breakfast = buildSection('breakfast', breakfastQuery);
  const lunch     = buildSection('lunch',     lunchQuery);
  const dinner    = buildSection('dinner',    dinnerQuery);

  // ── Direct Firestore status update (moved from Cloud Function — Spark plan) ──
  const advanceStatus = async (
    orderId: string,
    newStatus: KitchenWorkflowStatus
  ): Promise<void> => {
    setIsAdvancing(true);
    try {
      // Phase 7: Client-side kitchen status update instead of Cloud Function
      await orderRepository.update(orderId, { 
        status: newStatus,
        updatedAt: serverTimestamp() as any
      });
      // No manual cache invalidation needed — onSnapshot listeners push the
      // updated order into the React Query cache within ~500 ms.
    } finally {
      setIsAdvancing(false);
    }
  };

  return {
    breakfast,
    lunch,
    dinner,
    filters,
    setFilters,
    allZones,
    isAnyLoading: breakfast.isLoading || lunch.isLoading || dinner.isLoading,
    isAnyError: breakfast.isError || lunch.isError || dinner.isError,
    advanceStatus,
    isAdvancing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_SORT_ORDER: Record<OrderStatus, number> = {
  scheduled:        0,
  preparing:        1,
  ready_for_pickup: 2,
  out_for_delivery: 3,
  delivered:        4,
  skipped:          5,
  cancelled:        6,
  failed_delivery:  7,
};
