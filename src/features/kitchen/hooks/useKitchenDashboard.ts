import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';

import type { Order, MealType, OrderStatus } from '@/shared/types';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { queryKeys } from '@/shared/lib/queryKeys';

// ─────────────────────────────────────────────────────────────────────────────
// Business date helper (mirrors the Cloud Function's getBusinessDateString)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns today's date as YYYY-MM-DD in Asia/Kolkata timezone.
 * Uses the same Intl.DateTimeFormat approach as the Cloud Function so the
 * frontend and backend always agree on which business day "today" is.
 * Modern browsers fully support IANA timezone IDs — no polyfill needed.
 */
export { getTodayInTimezone as getTodayIST } from '@/shared/lib/date';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MealTypeSummary {
  total: number;
  scheduled: number;
  packing: number;
  packed: number;
  readyForPickup: number;
  pickedUp: number;
}

export interface KitchenDashboardData {
  /** Total order count for the day. */
  totalOrders: number;
  /** Breakdown by meal type. */
  byMealType: Record<MealType, MealTypeSummary>;
  /** Aggregated status counts across all meal types. */
  byStatus: Record<OrderStatus, number>;
  /** Orders considered "done" from the kitchen's perspective. */
  completedCount: number;

  /** Zone-wise order count for operational awareness. */
  byZone: Record<string, number>;
  /** ISO timestamp of the last data refresh. */
  asOf: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// useKitchenOrdersSummary — raw orders for a given date
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all orders for the given date and keeps them live via Firestore
 * `onSnapshot`. Updates are pushed into the React Query cache automatically,
 * so components reading `useKitchenDashboard()` re-render without polling.
 *
 * Architecture constraint: reads ONLY from `orders` — never `subscriptions`.
 */
export function useKitchenOrdersSummary(date: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isKitchenStaff = profile?.role === 'kitchen';
  const kitchenId = isKitchenStaff ? (profile.kitchenId || null) : null;
  const isReady = isKitchenStaff ? !!kitchenId : true;
  
  const queryKey = queryKeys.kitchen.dayOrders(date, kitchenId || 'all');

  useEffect(() => {
    if (!isReady) return;
    
    const effectQueryKey = queryKeys.kitchen.dayOrders(date, kitchenId || 'all');
    const unsubscribe = orderRepository.subscribeToDayOrders(
      date,
      kitchenId,
      (orders) => {
        queryClient.setQueryData(effectQueryKey, orders);
      },
      (error) => {
        console.error('[useKitchenOrdersSummary] onSnapshot error:', error);
      }
    );
    return unsubscribe;
  }, [date, kitchenId, queryClient, isReady]);

  return useQuery<Order[]>({
    queryKey,
    queryFn: () => orderRepository.getByDate(date, kitchenId),
    staleTime: 0,
    enabled: isReady,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useKitchenDashboard — computed KPI aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives Kitchen Dashboard KPIs from the live orders cache.
 *
 * This is presentation-layer aggregation of already-fetched data — NOT
 * business logic. All business logic (order generation, status transitions)
 * lives exclusively in Cloud Functions.
 */
export function useKitchenDashboard(date: string) {
  const ordersQuery = useKitchenOrdersSummary(date);

  const dashboard = useMemo<KitchenDashboardData | null>(() => {
    if (!ordersQuery.data) return null;
    return computeDashboard(ordersQuery.data);
  }, [ordersQuery.data]);

  return {
    ...ordersQuery,
    dashboard,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure aggregation (no side effects, fully testable)
// ─────────────────────────────────────────────────────────────────────────────

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

const KITCHEN_COMPLETED_STATUSES: OrderStatus[] = [
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
];

const KITCHEN_PICKED_UP_STATUSES: OrderStatus[] = [
  'out_for_delivery',
  'delivered',
];

function emptyMealTypeSummary(): MealTypeSummary {
  return { total: 0, scheduled: 0, packing: 0, packed: 0, readyForPickup: 0, pickedUp: 0 };
}

function computeDashboard(orders: Order[]): KitchenDashboardData {
  const byMealType: Record<MealType, MealTypeSummary> = {
    breakfast: emptyMealTypeSummary(),
    lunch:     emptyMealTypeSummary(),
    dinner:    emptyMealTypeSummary(),
  };

  const byStatus: Record<string, number> = {};
  const byZone: Record<string, number> = {};

  for (const order of orders) {
    // Status counters
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;

    // Zone counters
    const zone = order.zoneId ?? 'unassigned';
    byZone[zone] = (byZone[zone] ?? 0) + 1;

    // Per-meal-type breakdown
    const mt = byMealType[order.mealType];
    if (!mt) continue; // guard against unknown meal types
    mt.total++;
    if (order.status === 'scheduled')       mt.scheduled++;
    if (order.status === 'packing')       mt.packing++;
    if (order.status === 'packed')        mt.packed++;
    if (order.status === 'ready_for_pickup') mt.readyForPickup++;
    if (KITCHEN_PICKED_UP_STATUSES.includes(order.status as OrderStatus)) mt.pickedUp++;
  }

  const completedCount = orders.filter((o) =>
    KITCHEN_COMPLETED_STATUSES.includes(o.status as OrderStatus)
  ).length;


  // Ensure all meal types appear even if count is 0
  for (const mt of MEAL_TYPES) {
    if (!byMealType[mt]) byMealType[mt] = emptyMealTypeSummary();
  }

  return {
    totalOrders: orders.length,
    byMealType,
    byStatus: byStatus as Record<OrderStatus, number>,
    completedCount,
    byZone,
    asOf: new Date().toISOString(),
  };
}
