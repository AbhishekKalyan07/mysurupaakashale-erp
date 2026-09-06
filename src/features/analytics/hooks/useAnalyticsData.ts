import { useQuery } from '@tanstack/react-query';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { where, Timestamp } from 'firebase/firestore';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { paymentRepository } from '@/shared/services/firestore/paymentRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { getTodayInTimezone } from '@/shared/lib/date';
import { analyticsRepository } from '@/shared/services/firestore/analyticsRepository';

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

      // 1. Fetch Daily Summaries for the requested date range
      const summaries = await analyticsRepository.list(
        where('date', '>=', startIso),
        where('date', '<=', endIso)
      );

      // Aggregators for historical events
      let totalRev = 0, pendingRev = 0, verifiedRev = 0, rejectedRev = 0;
      let totalDeliveries = 0, completedDeliveries = 0, failedDeliveries = 0;
      let breakfastCount = 0, lunchCount = 0, dinnerCount = 0;
      
      const methodDist: Record<string, number> = {};
      const deliveryByArea: Record<string, number> = {};
      const partnerCount: Record<string, number> = {};
      const hourCount: Record<string, number> = {};
      const dailyTrendMap: Record<string, number> = {};
      
      summaries.forEach(s => {
        if (s.date === todayIso) return; // Skip today's summary if it accidentally exists (e.g., manual run), we will compute today live
        
        totalRev += (s.totalRevenue || 0);
        verifiedRev += (s.verifiedRevenue || 0);
        pendingRev += (s.pendingRevenue || 0);
        rejectedRev += (s.rejectedRevenue || 0);
        
        totalDeliveries += (s.totalDeliveries || 0);
        completedDeliveries += (s.completedDeliveries || 0);
        failedDeliveries += (s.failedDeliveries || 0);
        
        breakfastCount += (s.breakfastCount || 0);
        lunchCount += (s.lunchCount || 0);
        dinnerCount += (s.dinnerCount || 0);
        
        dailyTrendMap[s.date] = s.totalRevenue || 0;
        
        Object.entries(s.methodDistribution || {}).forEach(([k, v]) => methodDist[k] = (methodDist[k] || 0) + v);
        Object.entries(s.deliveryByArea || {}).forEach(([k, v]) => deliveryByArea[k] = (deliveryByArea[k] || 0) + v);
        Object.entries(s.partnerCount || {}).forEach(([k, v]) => partnerCount[k] = (partnerCount[k] || 0) + v);
        Object.entries(s.peakHourCount || {}).forEach(([k, v]) => hourCount[k] = (hourCount[k] || 0) + v);
      });

      // 2. Fetch TODAY's live operational data (Bounded to 1 day = Highly Scalable)
      const isTodayInRange = endIso >= todayIso && startIso <= todayIso;
      let todayRev = 0;
      let todayTotalOrders = 0;
      let kitchenPreparedToday = 0;
      let kitchenPendingToday = 0;
      
      // We still need current active state regardless of the date range
      const allCustomers = await userRepository.list(where('role', '==', 'customer'));
      const activeSubs = await subscriptionRepository.list(where('status', 'in', ['active', 'paused']));
      const planDist: Record<string, number> = {};
      let activeSubsCount = 0, pausedSubsCount = 0;
      
      activeSubs.forEach(s => {
        if (s.status === 'active') activeSubsCount++;
        if (s.status === 'paused') pausedSubsCount++;
        planDist[s.planTier] = (planDist[s.planTier] || 0) + 1;
      });

      if (isTodayInRange) {
        const todayStart = Timestamp.fromDate(new Date(`${todayIso}T00:00:00.000Z`));
        const [todayOrders, todayPayments] = await Promise.all([
          orderRepository.getByDate(todayIso),
          paymentRepository.list(where('createdAt', '>=', todayStart))
        ]);

        todayPayments.forEach(p => {
          const amt = p.amount;
          if (p.status === 'verified') {
            totalRev += amt;
            verifiedRev += amt;
            todayRev += amt;
            methodDist[p.paymentMethod] = (methodDist[p.paymentMethod] || 0) + amt;
            dailyTrendMap[todayIso] = (dailyTrendMap[todayIso] || 0) + amt;
          } else if (p.status === 'pending') {
            pendingRev += amt;
          } else if (p.status === 'rejected') {
            rejectedRev += amt;
          }
        });
        
        todayOrders.forEach(o => {
          if (o.status !== 'cancelled' && o.status !== 'skipped') {
            todayTotalOrders++;
            totalDeliveries++;
            
            if (o.mealType === 'breakfast') breakfastCount++;
            else if (o.mealType === 'lunch') lunchCount++;
            else if (o.mealType === 'dinner') dinnerCount++;
            
            if (o.status === 'delivered') {
              completedDeliveries++;
              if (o.zoneId) deliveryByArea[o.zoneId] = (deliveryByArea[o.zoneId] || 0) + 1;
              if (o.deliveryPartnerId) partnerCount[o.deliveryPartnerId] = (partnerCount[o.deliveryPartnerId] || 0) + 1;
            } else if (o.status === 'failed_delivery') {
              failedDeliveries++;
            }
            
            if (['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(o.status)) {
              kitchenPreparedToday++;
            } else if (['scheduled', 'preparing', 'packing', 'packed'].includes(o.status)) {
              kitchenPendingToday++;
            }
            
            if (o.createdAt) {
              const hr = (o.createdAt as any).toDate ? (o.createdAt as any).toDate().getHours() : new Date((o.createdAt as any).seconds * 1000).getHours();
              hourCount[hr.toString()] = (hourCount[hr.toString()] || 0) + 1;
            }
          }
        });
      }

      // 3. Post-Process
      const dailyTrend = Object.entries(dailyTrendMap)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      let topPartner = 'N/A';
      let maxP = 0;
      Object.entries(partnerCount).forEach(([pId, count]) => {
        if (count > maxP) {
          maxP = count;
          topPartner = pId;
        }
      });
      
      let peakHourStr = 'N/A';
      let maxH = 0;
      Object.entries(hourCount).forEach(([hr, count]) => {
        if (count > maxH) {
          maxH = count;
          const h = parseInt(hr);
          peakHourStr = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
        }
      });

      const averageOrderValue = completedDeliveries > 0 ? (totalRev / completedDeliveries) : 0;
      
      // New Registrations fallback
      const newCustomers = allCustomers.filter(c => {
        const parsedDate = parseFirestoreDate(c.createdAt);
        const ts = parsedDate ? parsedDate.getTime() : 0;
        return ts >= startTs.toMillis() && ts <= endTs.toMillis();
      });

      return {
        revenue: {
          total: totalRev,
          today: todayRev,
          monthly: totalRev,
          averageOrderValue,
          pending: pendingRev,
          verified: verifiedRev,
          rejected: rejectedRev,
          methodDistribution: methodDist,
          dailyTrend,
        },
        customers: {
          total: allCustomers.length,
          active: activeSubsCount,
          newRegistrations: newCustomers.length,
        },
        subscriptions: {
          active: activeSubsCount,
          expired: 0, // State-in-time calculation requires historical queries, fallback to 0 or derive from analytics
          paused: pausedSubsCount,
          planDistribution: planDist,
        },
        orders: {
          total: totalDeliveries,
          todayTotal: todayTotalOrders,
          completed: completedDeliveries,
          pending: totalDeliveries - completedDeliveries - failedDeliveries,
          byMealType: { breakfast: breakfastCount, lunch: lunchCount, dinner: dinnerCount },
        },
        delivery: {
          success: completedDeliveries,
          failed: failedDeliveries,
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
