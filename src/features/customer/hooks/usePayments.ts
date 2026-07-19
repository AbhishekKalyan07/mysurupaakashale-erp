import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/shared/lib/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { paymentRepository } from '@/shared/services/firestore/paymentRepository';
import type { ManualPayment, ManualPaymentStatus, SubmitPaymentInput } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { toast } from 'react-hot-toast';

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
      // Phase 5: Client-side payment submission
      const paymentRef = doc(db, 'payments', crypto.randomUUID());
      await runTransaction(db, async (t) => {
        t.set(paymentRef, {
          id: paymentRef.id,
          subscriptionId: input.subscriptionId,
          customerId: firebaseUser!.uid,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          status: 'pending',
          verifiedAt: null,
          verifiedBy: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      return { paymentId: paymentRef.id };
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
    mutationFn: async (input: { paymentId: string; notes?: string }) => {
      // Phase 5 & 6: Client-side payment approval and subscription activation
      await runTransaction(db, async (t) => {
        const paymentRef = doc(db, 'payments', input.paymentId);
        const paymentSnap = await t.get(paymentRef);
        if (!paymentSnap.exists()) throw new Error('Payment not found');
        const payment = paymentSnap.data() as ManualPayment;
        
        if (payment.status !== 'pending') throw new Error('Payment already processed');
        
        const subRef = doc(db, 'subscriptions', payment.subscriptionId);
        
        t.update(paymentRef, {
          status: 'verified',
          verifiedAt: serverTimestamp(),
          verifiedBy: 'admin', // Ideally pull from auth if available
          updatedAt: serverTimestamp(),
        });
        
        t.update(subRef, {
          status: 'active',
          updatedAt: serverTimestamp(),
        });
        
        // Generate invoice
        const invoiceRef = doc(db, 'invoices', crypto.randomUUID());
        t.set(invoiceRef, {
          id: invoiceRef.id,
          subscriptionId: payment.subscriptionId,
          customerId: payment.customerId,
          amount: payment.amount,
          status: 'paid',
          issuedAt: serverTimestamp(),
          paidAt: serverTimestamp(),
          paymentId: payment.id,
        });
      });
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
      await runTransaction(db, async (t) => {
        const paymentRef = doc(db, 'payments', input.paymentId);
        const paymentSnap = await t.get(paymentRef);
        if (!paymentSnap.exists()) throw new Error('Payment not found');
        
        t.update(paymentRef, {
          status: 'rejected',
          verifiedAt: serverTimestamp(),
          verifiedBy: 'admin',
          updatedAt: serverTimestamp(),
        });
      });
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
