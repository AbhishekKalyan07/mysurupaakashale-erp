import { QueryClient, MutationCache } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { extractErrorMessage } from '@/shared/utils/errorHandler';

/**
 * Defaults chosen for an all-day, tab-open ERP rather than TanStack Query's
 * out-of-the-box generic defaults:
 *  - staleTime 30s: dashboards refresh often enough to feel live without
 *    re-querying Firestore on every focus/mount.
 *  - refetchOnWindowFocus: false — an Admin or Accounts user alt-tabbing to
 *    check email all day shouldn't refetch every collection on return;
 *    Firestore's own onSnapshot listeners (used for live screens like the
 *    Kitchen order board) handle real-time updates where it actually matters.
 *  - mutations retry: 0 — a write like "assign delivery partner" or "mark
 *    delivered" should surface a failure immediately, never silently retry
 *    and risk a duplicate side effect.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      // Global error handler for mutations. Extracts a friendly message and prevents raw Firebase errors.
      toast.error(extractErrorMessage(error));
    },
  }),
});
