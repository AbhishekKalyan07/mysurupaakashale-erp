import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { mealPlanRepository } from '@/shared/services/firestore/mealPlanRepository';
import { where } from 'firebase/firestore';

export function useMealPlans() {
  return useQuery({
    queryKey: queryKeys.mealPlans.all,
    queryFn: async () => {
      const plans = await mealPlanRepository.list(where('isActive', '==', true));
      return plans.sort((a, b) => a.sortOrder - b.sortOrder);
    },
  });
}
