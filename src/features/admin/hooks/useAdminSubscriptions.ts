import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getAuth } from 'firebase/auth';
import toast from 'react-hot-toast';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { subscriptionService } from '@/shared/services/business/subscriptionService';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { mealPlanRepository } from '@/shared/services/firestore/mealPlanRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import {
  notifySubscriptionActivated,
  notifySubscriptionRejected,
  notifySubscriptionPaused,
  notifySubscriptionResumed,
} from '@/shared/services/firestore/notificationService';
import type { Subscription, SubscriptionStatus } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';

export type AdminStatusFilter = SubscriptionStatus | 'all';

/** A subscription row enriched with the display fields the admin table needs — Subscription itself only stores customerId/planId. */
export interface SubscriptionRow extends Subscription {
  customerName: string;
  customerPhone: string;
  planName: string;
}

/**
 * Resolves customerName/customerPhone/planName for a page of subscriptions.
 * Fetches each unique customer/plan through the shared queryClient cache
 * (fetchQuery dedupes and reuses results across pages and tabs — a repeat
 * customer or plan across rows costs one Firestore read total, not one per row).
 */
async function attachDisplayFields(
  subscriptions: Subscription[],
  queryClient: QueryClient,
): Promise<SubscriptionRow[]> {
  const customerIds = [...new Set(subscriptions.map((s) => s.customerId))];
  const planIds = [...new Set(subscriptions.map((s) => s.planId))];

  const [customers, plans] = await Promise.all([
    Promise.all(
      customerIds.map((id) =>
        queryClient.fetchQuery({
          queryKey: ['user', id],
          queryFn: () => userRepository.getById(id),
          staleTime: 5 * 60_000,
        }),
      ),
    ),
    Promise.all(
      planIds.map((id) =>
        queryClient.fetchQuery({
          queryKey: ['plan', id],
          queryFn: () => mealPlanRepository.getById(id),
          staleTime: 5 * 60_000,
        }),
      ),
    ),
  ]);

  const customerById = new Map(customerIds.map((id, i) => [id, customers[i]]));
  const planById = new Map(planIds.map((id, i) => [id, plans[i]]));

  return subscriptions
    .filter((sub) => {
      const customer = customerById.get(sub.customerId);
      return customer != null; // Ensure the customer exists and hasn't been deleted
    })
    .map((sub) => {
      const customer = customerById.get(sub.customerId)!;
      const plan = planById.get(sub.planId);
      return {
        ...sub,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        planName: plan?.name ?? sub.planTier,
      };
    });
}

// ── Admin: paginated subscriptions list by status ──────────────────────────────
export function useAdminSubscriptions(status: AdminStatusFilter) {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: queryKeys.subscriptions.adminList(status),
    queryFn: async ({ pageParam }: { pageParam: QueryDocumentSnapshot<Subscription> | undefined }) => {
      const filter = status === 'all' ? {} : { status };
      const { subscriptions, lastDoc } = await subscriptionRepository.getSubscriptionsPaginated(
        filter,
        20,
        pageParam,
      );
      const rows = await attachDisplayFields(subscriptions, queryClient);
      return { rows, lastDoc };
    },
    initialPageParam: undefined as QueryDocumentSnapshot<Subscription> | undefined,
    getNextPageParam: (lastPage) => lastPage.lastDoc ?? undefined,
    staleTime: 15_000,
  });
}

function invalidateSubscriptionLists(queryClient: ReturnType<typeof useQueryClient>, subscription: Subscription) {
  queryClient.invalidateQueries({ queryKey: ['subscriptions', 'admin'] });
  queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.detail(subscription.id) });
  queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.active(subscription.customerId) });
}

// ── Admin: approve a pending/draft subscription ─────────────────────────────────
export function useApproveSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscription: Subscription) => {
      await subscriptionService.approveSubscription(subscription);

      const admin = getAuth().currentUser;
      if (admin) {
        await auditRepository.logAction(
          'subscription_approved',
          admin.uid,
          admin.displayName || 'Admin',
          subscription.id,
          'subscription',
          { previousStatus: subscription.status },
        );
      }

      notifySubscriptionActivated(subscription.customerId, subscription.id, subscription.planTier, subscription.startDate)
        .catch((err) => console.error('[useApproveSubscription] notification failed:', err));

      return subscription;
    },
    onSuccess: (subscription) => {
      invalidateSubscriptionLists(queryClient, subscription);
      toast.success('Subscription approved and activated.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to approve subscription.');
    },
  });
}

// ── Admin: reject a pending/draft subscription ──────────────────────────────────
export function useRejectSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subscription, reason }: { subscription: Subscription; reason?: string }) => {
      await subscriptionService.rejectSubscription(subscription);

      const admin = getAuth().currentUser;
      if (admin) {
        await auditRepository.logAction(
          'subscription_rejected',
          admin.uid,
          admin.displayName || 'Admin',
          subscription.id,
          'subscription',
          { reason: reason ?? null },
        );
      }

      notifySubscriptionRejected(subscription.customerId, subscription.id, reason)
        .catch((err) => console.error('[useRejectSubscription] notification failed:', err));

      return subscription;
    },
    onSuccess: (subscription) => {
      invalidateSubscriptionLists(queryClient, subscription);
      toast.success('Subscription rejected. Customer has been notified.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject subscription.');
    },
  });
}

// ── Admin: pause an active subscription ──────────────────────────────────────────
export function usePauseSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscription: Subscription) => {
      await subscriptionService.pauseSubscription(subscription);

      const admin = getAuth().currentUser;
      if (admin) {
        await auditRepository.logAction('subscription_paused', admin.uid, admin.displayName || 'Admin', subscription.id, 'subscription');
      }

      notifySubscriptionPaused(subscription.customerId, subscription.id)
        .catch((err) => console.error('[usePauseSubscription] notification failed:', err));

      return subscription;
    },
    onSuccess: (subscription) => {
      invalidateSubscriptionLists(queryClient, subscription);
      toast.success('Subscription paused.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to pause subscription.');
    },
  });
}

// ── Admin: resume a paused subscription ──────────────────────────────────────────
export function useResumeSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscription: Subscription) => {
      await subscriptionService.resumeSubscription(subscription);

      const admin = getAuth().currentUser;
      if (admin) {
        await auditRepository.logAction('subscription_resumed', admin.uid, admin.displayName || 'Admin', subscription.id, 'subscription');
      }

      notifySubscriptionResumed(subscription.customerId, subscription.id)
        .catch((err) => console.error('[useResumeSubscription] notification failed:', err));

      return subscription;
    },
    onSuccess: (subscription) => {
      invalidateSubscriptionLists(queryClient, subscription);
      toast.success('Subscription resumed.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to resume subscription.');
    },
  });
}
