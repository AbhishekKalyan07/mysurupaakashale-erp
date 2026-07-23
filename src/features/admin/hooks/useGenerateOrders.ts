import { useState } from 'react';
import { orderService } from '@/shared/services/business/orderService';
import toast from 'react-hot-toast';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';

export function useGenerateOrders() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateOrders = async () => {
    setIsGenerating(true);
    try {
      const today = getTodayIST();
      const result = await orderService.generateDailyOrders(today);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      console.error('Error generating orders:', err);
      toast.error(err.message || 'Failed to generate orders.');
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateOrders, isGenerating };
}
