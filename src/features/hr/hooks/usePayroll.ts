import { Timestamp, serverTimestamp, runTransaction, doc } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollRepository, salaryProfileRepository, salaryAdvanceRepository } from '@/shared/services/firestore/payrollRepository';
import type { PayrollRecord, EmployeeSalaryProfile, PayrollStatus, SalaryAdvance } from '@/shared/types';
import { db } from '@/shared/lib/firebase';
import { getAuth } from 'firebase/auth';
import { getTodayInTimezone } from '@/shared/lib/date';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import { notificationRepository } from '@/shared/services/firestore/notificationRepository';
import toast from 'react-hot-toast';

export const queryKeys = {
  payroll: {
    base: ['payroll'] as const,
    byMonth: (month: string) => [...queryKeys.payroll.base, 'month', month] as const,
    byStaff: (staffId: string) => [...queryKeys.payroll.base, 'staff', staffId] as const,
    profiles: ['salaryProfiles'] as const,
    profile: (staffId: string) => [...queryKeys.payroll.profiles, staffId] as const,
    advances: ['salaryAdvances'] as const,
    pendingAdvances: (staffId: string) => [...queryKeys.payroll.advances, 'pending', staffId] as const,
  },
};

export function usePayrollByMonth(month: string) {
  return useQuery({
    queryKey: queryKeys.payroll.byMonth(month),
    queryFn: () => payrollRepository.getPayrollByMonth(month),
    enabled: !!month,
  });
}

export function usePayrollByStaff(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.byStaff(staffId),
    queryFn: () => payrollRepository.getPayrollByStaff(staffId),
    enabled: !!staffId,
  });
}

export function useSalaryProfile(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.profile(staffId),
    queryFn: () => salaryProfileRepository.getProfile(staffId),
    enabled: !!staffId,
  });
}

export function usePendingAdvances(staffId: string) {
  return useQuery({
    queryKey: queryKeys.payroll.pendingAdvances(staffId),
    queryFn: () => salaryAdvanceRepository.getPendingAdvancesByStaff(staffId),
    enabled: !!staffId,
  });
}

export function useAddSalaryAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<SalaryAdvance, 'id' | 'status' | 'payrollId' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
      const id = crypto.randomUUID();
      const user = getAuth().currentUser;
      if (!user) throw new Error('Not authenticated');

      const record: SalaryAdvance = {
        ...data,
        id,
        status: 'pending',
        payrollId: null,
        createdBy: user.uid,
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp,
      };
      
      await salaryAdvanceRepository.create(record, id);
      await auditRepository.logAction('salary_advance_added', user.uid, user.displayName || 'Admin', id, 'salaryAdvance', { amount: data.amount });
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.advances });
      toast.success('Salary advance added successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to add salary advance');
    },
  });
}

export function useUpdateSalaryProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmployeeSalaryProfile) => {
      const exists = await salaryProfileRepository.getProfile(data.id);
      if (exists) {
        await salaryProfileRepository.update(data.id, {
          ...data,
          updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        });
      } else {
        await salaryProfileRepository.create({
          ...data,
          updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        }, data.id);
      }
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          exists ? 'salary_profile_updated' : 'salary_profile_created',
          user.uid,
          user.displayName || 'Admin',
          data.id,
          'salary_profile',
          {
            previousBasicSalary: exists ? exists.basicSalary : null,
            newBasicSalary: data.basicSalary,
            previousOvertimeRate: exists ? exists.overtimeRate : null,
            newOvertimeRate: data.overtimeRate,
          }
        );
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.profiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.profile(variables.id) });
      toast.success('Salary profile updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update salary profile');
    },
  });
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<PayrollRecord, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'paymentDate'>) => {
      const id = crypto.randomUUID();
      const record: PayrollRecord = {
        ...data,
        id,
        status: 'draft',
        paymentDate: null,
        createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      };
      await payrollRepository.create(record, id);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_generated', user.uid, user.displayName || 'Admin', id, 'payroll');
        
        await notificationRepository.createNotification({
          recipientId: data.staffId,
          recipientRole: 'staff',
          channel: 'in_app',
          title: `Payroll Generated: ${data.month}`,
          message: `Your draft payroll for ${data.month} has been generated.`,
          type: 'payroll_generated',
          priority: 'normal',
          metadata: { payrollId: id, month: data.month }
        });
      }
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll generated successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to generate payroll');
    },
  });
}

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PayrollRecord> }) => {
      await payrollRepository.update(id, {
        ...data,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_updated', user.uid, user.displayName || 'Admin', id, 'payroll', { updatedKeys: Object.keys(data) });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update payroll');
    },
  });
}

export function useUpdatePayrollStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PayrollStatus }) => {
      await payrollRepository.update(id, {
        status,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_status_updated', user.uid, user.displayName || 'Admin', id, 'payroll', { status });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll status updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update payroll status');
    },
  });
}

export function usePaySalary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      payrollId,
      amountPaid,
      advanceDeduction,
      otherAdjustments,
      advancesToDeduct,
    }: {
      payrollId: string;
      amountPaid: number;
      advanceDeduction: number;
      otherAdjustments: number;
      advancesToDeduct: string[];
    }) => {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Authentication required to pay salary');

      const paymentDate = getTodayInTimezone();
      let staffIdForNotification = '';
      let monthForNotification = '';

      await runTransaction(db, async (transaction) => {
        const payrollRef = doc(db, 'payroll', payrollId);
        const payrollDoc = await transaction.get(payrollRef);
        
        if (!payrollDoc.exists()) {
          throw new Error('Payroll record does not exist.');
        }
        
        const payrollData = payrollDoc.data() as PayrollRecord;
        if (payrollData.status === 'paid' || payrollData.status === 'archived') {
          throw new Error('Payroll is already marked as paid or archived.');
        }

        staffIdForNotification = payrollData.staffId;
        monthForNotification = payrollData.month;

        // Verify all advances are still pending
        const advanceRefs = advancesToDeduct.map(id => doc(db, 'salaryAdvances', id));
        const advanceDocs = advanceRefs.length > 0 ? await Promise.all(advanceRefs.map(ref => transaction.get(ref))) : [];
        
        for (const adDoc of advanceDocs) {
          if (!adDoc.exists()) {
            throw new Error(`Advance record ${adDoc.id} not found.`);
          }
          if (adDoc.data().status !== 'pending') {
            throw new Error(`Advance record ${adDoc.id} is no longer pending.`);
          }
        }

        // Apply mutations
        const suggestedPayable = payrollData.netSalary - advanceDeduction + otherAdjustments;

        transaction.update(payrollRef, {
          status: 'paid',
          paymentDate,
          advanceDeduction,
          otherAdjustments,
          suggestedPayable,
          amountPaid,
          advancesDeducted: advancesToDeduct,
          updatedAt: serverTimestamp(),
        });

        for (const adRef of advanceRefs) {
          transaction.update(adRef, {
            status: 'deducted',
            payrollId,
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Transaction successful, do side effects
      await auditRepository.logAction('salary_paid', user.uid, user.displayName || 'Admin', payrollId, 'payroll', {
        amountPaid,
        advanceDeduction,
        otherAdjustments,
      });
      
      await notificationRepository.createNotification({
        recipientId: staffIdForNotification,
        recipientRole: 'staff',
        channel: 'in_app',
        title: `Salary Paid: ${monthForNotification}`,
        message: `Your salary for ${monthForNotification} (₹${amountPaid}) has been transferred successfully.`,
        type: 'salary_paid',
        priority: 'high',
        metadata: { payrollId, amount: String(amountPaid) }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      await queryClient.invalidateQueries({ queryKey: queryKeys.payroll.advances });
      toast.success('Salary marked as paid successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to process salary payment');
    },
  });
}
