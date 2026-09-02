import { useQuery } from '@tanstack/react-query';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { where, Timestamp } from 'firebase/firestore';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { paymentRepository } from '@/shared/services/firestore/paymentRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { getTodayInTimezone } from '@/shared/lib/date';

export type DateRangeFilter = 
  | 'today' | 'yesterday' | 'last7' | 'last30' 
  | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export function getDateRange(filter: DateRangeFilter, customRange?: DateRange): DateRange {
  const now = new Date();
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
    case 'last7': return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case 'last30': return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case 'thisMonth': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'lastMonth': {
      const lastMo = subMonths(now, 1);
      return { start: startOfMonth(lastMo), end: endOfMonth(lastMo) };
    }
    case 'thisYear': return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom': return customRange || { start: startOfDay(now), end: endOfDay(now) };
    default: return { start: startOfDay(now), end: endOfDay(now) };
  }
}

export interface AnalyticsData {
  revenue: {
    total: number;
    today: number;
    monthly: number;
    averageOrderValue: number;
    pending: number;
    verified: number;
    rejected: number;
    methodDistribution: Record<string, number>;
    dailyTrend: { date: string; amount: number }[];
  };
  customers: {
    total: number;
    active: number;
    newRegistrations: number;
  };
  subscriptions: {
    active: number;
    expired: number;
    paused: number;
    planDistribution: Record<string, number>;
  };
  orders: {
    total: number;
    todayTotal: number;
    completed: number;
    pending: number;
    byMealType: Record<string, number>;
  };
  delivery: {
    success: number;
    failed: number;
    byArea: Record<string, number>;
    topPartner: string;
  };
  kitchen: {
    preparedToday: number;
    pendingToday: number;
    peakHour: string;
  };
}

export function useAnalyticsData(filter: DateRangeFilter, customRange?: DateRange) {
  const range = getDateRange(filter, customRange);

  return useQuery({
    queryKey: ['analytics', filter, range.start.toISOString(), range.end.toISOString()],
    queryFn: async (): Promise<AnalyticsData> => {
      const startTs = Timestamp.fromDate(range.start);
      const endTs = Timestamp.fromDate(range.end);
      const startIso = range.start.toISOString().split('T')[0];
      const endIso = range.end.toISOString().split('T')[0];

      
      const todayIso = getTodayInTimezone();

      // 1. Fetch Payments in range (and also this month for monthly KPI)
      // To save reads for MVP, we might fetch a broader range, but let's stick to the selected range
      // and do a separate quick query for the month if the range doesn't cover it.
      // 1. Fetch Payments in range
      const payments = await paymentRepository.list(
        where('createdAt', '>=', startTs),
        where('createdAt', '<=', endTs)
      );

      // 2. Fetch Users (Customers) in range for new registrations, all for total
      const allCustomers = await userRepository.list(where('role', '==', 'customer'));
      const newCustomers = allCustomers.filter(c => {
        const parsedDate = parseFirestoreDate(c.createdAt);
        const ts = parsedDate ? parsedDate.getTime() : 0;
        return ts >= startTs.toMillis() && ts <= endTs.toMillis();
      });

      // 3. Fetch Subscriptions
      const subscriptions = await subscriptionRepository.list();

      // 4. Fetch Orders
      const orders = await orderRepository.list(
        where('date', '>=', startIso),
        where('date', '<=', endIso)
      );

      // Process Revenue
      let totalRev = 0, pendingRev = 0, verifiedRev = 0, rejectedRev = 0;
      let todayRev = 0;
      const methodDist: Record<string, number> = {};
      const dailyTrendMap: Record<string, number> = {};

      payments.forEach(p => {
        const pDate = p.paymentDate || new Date(p.createdAt.toMillis()).toISOString().split('T')[0];
        
        if (p.status === 'verified') {
          totalRev += p.amount;
          verifiedRev += p.amount;
          methodDist[p.paymentMethod] = (methodDist[p.paymentMethod] || 0) + p.amount;
          dailyTrendMap[pDate] = (dailyTrendMap[pDate] || 0) + p.amount;
          
          if (pDate === todayIso) todayRev += p.amount;
        } else if (p.status === 'pending') {
          pendingRev += p.amount;
        } else if (p.status === 'rejected') {
          rejectedRev += p.amount;
        }
      });
      
      const dailyTrend = Object.entries(dailyTrendMap)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Process Subscriptions
      let activeSubs = 0, expiredSubs = 0, pausedSubs = 0;
      const planDist: Record<string, number> = {};
      
      subscriptions.forEach(s => {
        if (s.status === 'active') activeSubs++;
        if (s.status === 'expired') expiredSubs++;
        if (s.status === 'paused') pausedSubs++;
        if (s.status === 'active' || s.status === 'paused') {
          planDist[s.planTier] = (planDist[s.planTier] || 0) + 1;
        }
      });

      // Process Orders, Kitchen & Delivery
      let completedOrders = 0;
      let pendingOrders = 0;
      let todayTotalOrders = 0;
      
      let deliverySuccess = 0, deliveryFailed = 0;
      const deliveryByArea: Record<string, number> = {};
      const partnerCount: Record<string, number> = {};
      
      let kitchenPreparedToday = 0;
      let kitchenPendingToday = 0;
      const hourCount: Record<string, number> = {};

      const mealTypeDist: Record<string, number> = {};
      
      orders.forEach(o => {
        mealTypeDist[o.mealType] = (mealTypeDist[o.mealType] || 0) + 1;
        
        if (o.status === 'delivered') {
          completedOrders++;
          deliverySuccess++;
          if (o.zoneId) deliveryByArea[o.zoneId] = (deliveryByArea[o.zoneId] || 0) + 1;
          if (o.deliveryPartnerId) partnerCount[o.deliveryPartnerId] = (partnerCount[o.deliveryPartnerId] || 0) + 1;
        } else if (o.status === 'failed_delivery') {
          deliveryFailed++;
        } else if (['scheduled', 'preparing', 'packing', 'packed', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)) {
          pendingOrders++;
        }
        
        if (o.date === todayIso) {
          todayTotalOrders++;
          if (['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(o.status)) {
            kitchenPreparedToday++;
          } else if (['scheduled', 'preparing', 'packing', 'packed'].includes(o.status)) {
            kitchenPendingToday++;
          }
        }
        
        // Estimate peak hour from creation or delivery window
        if (o.createdAt) {
          const parsedDate = parseFirestoreDate(o.createdAt);
          if (parsedDate) {
            const hour = parsedDate.getHours();
            hourCount[hour] = (hourCount[hour] || 0) + 1;
          }
        }
      });

      // Calc Top Partner
      let topPartner = 'N/A';
      let maxP = 0;
      Object.entries(partnerCount).forEach(([pId, count]) => {
        if (count > maxP) {
          maxP = count;
          topPartner = pId; // In a real app we'd map this to a name
        }
      });
      
      // Calc Peak Hour
      let peakHourStr = 'N/A';
      let maxH = 0;
      Object.entries(hourCount).forEach(([hr, count]) => {
        if (count > maxH) {
          maxH = count;
          const h = parseInt(hr);
          peakHourStr = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
        }
      });

      const averageOrderValue = completedOrders > 0 ? (totalRev / completedOrders) : 0;

      return {
        revenue: {
          total: totalRev,
          today: todayRev,
          monthly: totalRev, // approximate if filter is month
          averageOrderValue,
          pending: pendingRev,
          verified: verifiedRev,
          rejected: rejectedRev,
          methodDistribution: methodDist,
          dailyTrend,
        },
        customers: {
          total: allCustomers.length,
          active: activeSubs, // approx active customers = active subs
          newRegistrations: newCustomers.length,
        },
        subscriptions: {
          active: activeSubs,
          expired: expiredSubs,
          paused: pausedSubs,
          planDistribution: planDist,
        },
        orders: {
          total: orders.length,
          todayTotal: todayTotalOrders,
          completed: completedOrders,
          pending: pendingOrders,
          byMealType: mealTypeDist,
        },
        delivery: {
          success: deliverySuccess,
          failed: deliveryFailed,
          byArea: deliveryByArea,
          topPartner,
        },
        kitchen: {
          preparedToday: kitchenPreparedToday,
          pendingToday: kitchenPendingToday,
          peakHour: peakHourStr,
        }
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
