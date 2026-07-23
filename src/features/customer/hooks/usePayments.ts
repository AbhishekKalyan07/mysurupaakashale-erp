import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { paymentRepository } from '@/shared/services/firestore/paymentRepository';
import { paymentService } from '@/shared/services/business/paymentService';
import type { ManualPayment, ManualPaymentStatus, SubmitPaymentInput } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { toast } from 'react-hot-toast';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import {
  notifyPaymentVerified,
  notifySubscriptionActivated,
  notifyPaymentRejected,
} from '@/shared/services/firestore/notificationService';

// ── Customer: my payment history ───────────────────────────────────────────────
export function useMyPayments() {
  const { firebaseUser } = useAuth();

  return useQuery({
    queryKey: queryKeys.payments.byCustomer(firebaseUser?.uid ?? ''),
    queryFn: () => paymentRepository.getByCustomerId(firebaseUser!.uid),
    enabled: !!firebaseUser,
    staleTime: 30_000,
  });
}

// ── Customer: submit a payment ─────────────────────────────────────────────────
export function useSubmitPayment() {
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async (input: SubmitPaymentInput) => {
      const paymentId = await paymentService.submitPayment(
        input, 
        firebaseUser!.uid,
        firebaseUser!.displayName || 'Customer'
      );
      return { paymentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.byCustomer(firebaseUser?.uid ?? ''),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all,
      });
      toast.success('Payment details submitted. Awaiting admin verification.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to submit payment. Please try again.');
    },
  });
}

// ── Admin: paginated payments list by status ───────────────────────────────────
export function useAdminPayments(status: ManualPaymentStatus | 'all', page: number = 0) {
  return useQuery({
    queryKey: queryKeys.payments.adminList(status, page),
    queryFn: async (): Promise<ManualPayment[]> => {
      const filter = status === 'all' ? {} : { status };
      const { payments } = await paymentRepository.getPaymentsPaginated(filter, 20);
      return payments;
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

// ── Admin: single payment detail ───────────────────────────────────────────────
export function usePaymentDetail(paymentId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.detail(paymentId ?? ''),
    queryFn: () => paymentRepository.getById(paymentId!),
    enabled: !!paymentId,
    staleTime: 30_000,
  });
}

// ── Admin: approve payment ─────────────────────────────────────────────────────
export function useApprovePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { 
      paymentId: string; 
      notes?: string;
      meta?: {
        customerEmail: string;
        customerName: string;
        planName: string;
        planTier: string;
        deliveryAddress: string;
        pricePerDay: number;
      };
    }) => {
      // Phase 5 & 6: Client-side payment approval and subscription activation
      const capturedPayment = await paymentService.approvePayment(
        input.paymentId, 
        getAuth().currentUser?.uid ?? 'admin', 
        input.notes,
        input.meta
      );
      
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        await auditRepository.logAction('payment_approved', currentUser.uid, currentUser.displayName || 'Admin', input.paymentId, 'payment', { notes: input.notes });
      }

      // Notify customer — fire-and-forget so a notification failure never reverts the approval.
      // `payment` captured above inside the transaction closure is safe to reference here.
      notifyPaymentVerified(capturedPayment.customerId, input.paymentId, capturedPayment.amount)
        .catch((err) => console.error('[useApprovePayment] verified notification failed:', err));
      notifySubscriptionActivated(
        capturedPayment.customerId,
        capturedPayment.subscriptionId,
        capturedPayment.subscriptionId, // planTier not on payment; subscription page shows it
        new Date().toISOString().split('T')[0],
      ).catch((err) => console.error('[useApprovePayment] activated notification failed:', err));

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success('Payment approved. Subscription activated.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to approve payment.');
    },
  });
}

// ── Admin: reject payment ──────────────────────────────────────────────────────
export function useRejectPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { paymentId: string; notes?: string }) => {
      const capturedPayment = await paymentService.rejectPayment(
        input.paymentId,
        getAuth().currentUser?.uid ?? 'admin',
        input.notes
      );
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payment_rejected', user.uid, user.displayName || 'Admin', input.paymentId, 'payment', { notes: input.notes });
      }

      // Notify the customer — fire-and-forget.
      notifyPaymentRejected(
        capturedPayment.customerId,
        input.paymentId,
        capturedPayment.amount,
        input.notes ?? null,
      ).catch((err) => console.error('[useRejectPayment] rejected notification failed:', err));

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.success('Payment rejected. Customer has been notified.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject payment.');
    },
  });
}
