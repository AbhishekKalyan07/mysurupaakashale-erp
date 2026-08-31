import { useEffect, useRef } from 'react';
import { orderService } from '@/shared/services/business/orderService';
import { orderGenerationRunRepository } from '@/shared/services/firestore/analyticsRepository';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import toast from 'react-hot-toast';

export function useAutomatedDailyOrders() {
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run this check once per session to prevent excessive reads
    if (hasRun.current) return;
    hasRun.current = true;

    const checkAndGenerateOrders = async () => {
      try {
        const today = getTodayIST();
        


        // 2. Check if orders were already generated today
        const existingRun = await orderGenerationRunRepository.getById(today);
        if (existingRun && existingRun.status === 'success') {
          console.log(`[Auto-Cron] Orders already generated for ${today}.`);
          return;
        }

        console.log(`[Auto-Cron] Orders not generated for ${today}. Generating now...`);
        
        // 3. Automatically generate daily orders
        const result = await orderService.generateDailyOrders(today);
        
        if (result.success && result.ordersGenerated > 0) {
          toast.success(`Automated: ${result.message}`, { duration: 5000 });
        } else if (result.success && result.ordersGenerated === 0) {
          console.log(`[Auto-Cron] No new active subscriptions found to generate orders for today.`);
        } else {
          console.warn(`[Auto-Cron] Issue generating orders:`, result.message);
        }

      } catch (err: unknown) {
        console.error('[Auto-Cron] Error running automated daily orders:', err);
        toast.error('System failed to auto-generate daily orders. Please generate manually.');
      }
    };

    checkAndGenerateOrders();
  }, []);
}
