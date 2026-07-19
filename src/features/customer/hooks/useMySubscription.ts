import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { queryKeys } from '@/shared/lib/queryKeys';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';

export function useMySubscription() {
  const { firebaseUser } = useAuth();
  const customerId = firebaseUser?.uid;

  return useQuery({
    queryKey: queryKeys.subscriptions.active(customerId || ''),
    queryFn: async () => {
      if (!customerId) return null;
      return subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
    },
    enabled: !!customerId,
  });
}
