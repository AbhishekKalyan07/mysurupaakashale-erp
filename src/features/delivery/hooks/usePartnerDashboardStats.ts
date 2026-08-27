import { useState, useEffect } from 'react';
import { deliveryRepository } from '@/shared/services/firestore/deliveryRepository';

export interface DashboardStats {
  today: {
    assigned: number;
    delivered: number;
    remaining: number;
    failed: number;
    cancelled: number;
  };
  month: {
    delivered: number;
  };
  loading: boolean;
  error: Error | null;
}

export function usePartnerDashboardStats(partnerId: string | undefined, todayDate: string) {
  const [stats, setStats] = useState<DashboardStats>({
    today: {
      assigned: 0,
      delivered: 0,
      remaining: 0,
      failed: 0,
      cancelled: 0,
    },
    month: {
      delivered: 0,
    },
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!partnerId || !todayDate) {
      setStats(s => ({ ...s, loading: false }));
      return;
    }

    setStats(s => ({ ...s, loading: true, error: null }));

    let isMounted = true;
    let unsubToday = () => {};

    const fetchMonthly = async () => {
      try {
        const [yearStr, monthStr] = todayDate.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const startDate = `${yearStr}-${monthStr}-01`;
        
        // Calculate last day of the month without timezone conversion drift
        const lastDayNum = new Date(year, month, 0).getDate();
        const endDate = `${yearStr}-${monthStr}-${lastDayNum.toString().padStart(2, '0')}`;

        const monthlyDeliveredOrders = await deliveryRepository.getMonthlyDeliveries(partnerId, startDate, endDate);
        
        if (isMounted) {
          setStats(s => ({
            ...s,
            month: { delivered: monthlyDeliveredOrders.length }
          }));
        }
      } catch (err) {
        console.error('Failed to fetch monthly stats:', err);
        if (isMounted) setStats(s => ({ ...s, error: err as Error }));
      }
    };

    unsubToday = deliveryRepository.subscribePartnerOrders(
      partnerId,
      todayDate,
      undefined,
      (orders) => {
        if (!isMounted) return;

        // Daily Stat Calculation
        let assigned = 0;
        let delivered = 0;
        let failed = 0;
        let cancelled = 0;
        let remaining = 0;

        orders.forEach(o => {
          if (o.status === 'cancelled' || o.status === 'skipped') {
            cancelled++;
          } else {
            assigned++; // Valid assigned order for today
            if (o.status === 'delivered') {
              delivered++;
            } else if (o.status === 'failed_delivery' || o.status === 'returned_delivery') {
              failed++;
            } else {
              remaining++; // Still needs action
            }
          }
        });

        setStats(s => ({
          ...s,
          today: { assigned, delivered, failed, cancelled, remaining },
          loading: false
        }));

        // Fetch monthly stats whenever today changes (e.g. they deliver an order)
        fetchMonthly();
      },
      (err) => {
        if (isMounted) setStats(s => ({ ...s, error: err, loading: false }));
      }
    );

    return () => {
      isMounted = false;
      unsubToday();
    };
  }, [partnerId, todayDate]);

  return stats;
}
