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

export function useSkipDay() {
  const { firebaseUser } = useAuth();
  const { useMutation, useQueryClient } = require('@tanstack/react-query');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      date,
      mealTypes,
      reason,
      creditAmount
    }: {
      subscriptionId: string;
      date: string;
      mealTypes: ('breakfast' | 'lunch' | 'dinner')[];
      reason: string;
      creditAmount: number;
    }) => {
      if (!firebaseUser?.uid) throw new Error('Not authenticated');
      await subscriptionRepository.addSkip(
        subscriptionId,
        date,
        mealTypes,
        reason,
        firebaseUser.uid,
        creditAmount
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.active(firebaseUser?.uid || ''),
      });
      // Also invalidate the skips subcollection if we ever fetch it explicitly
    },
  });
}
