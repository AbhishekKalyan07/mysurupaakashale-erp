import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollRepository, salaryProfileRepository } from '@/shared/services/firestore/payrollRepository';
import type { PayrollRecord, EmployeeSalaryProfile, PayrollStatus } from '@/shared/types';
import { serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import { notificationRepository } from '@/features/notifications/services/notificationRepository';
import toast from 'react-hot-toast';

export const queryKeys = {
  payroll: {
    base: ['payroll'] as const,
    byMonth: (month: string) => [...queryKeys.payroll.base, 'month', month] as const,
    byStaff: (staffId: string) => [...queryKeys.payroll.base, 'staff', staffId] as const,
    profiles: ['salaryProfiles'] as const,
    profile: (staffId: string) => [...queryKeys.payroll.profiles, staffId] as const,
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

export function useUpdateSalaryProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmployeeSalaryProfile) => {
      const exists = await salaryProfileRepository.getProfile(data.id);
      if (exists) {
        await salaryProfileRepository.update(data.id, {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } else {
        await salaryProfileRepository.create({
          ...data,
          updatedAt: serverTimestamp(),
        }, data.id);
      }
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('salary_profile_updated', user.uid, user.displayName || 'Admin', data.id, 'salary_profile');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.profiles });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.profile(variables.id) });
      toast.success('Salary profile updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update salary profile');
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await payrollRepository.create(record, id);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_generated', user.uid, user.displayName || 'Admin', id, 'payroll');
        
        await notificationRepository.createNotification({
          recipientId: data.staffId,
          title: `Payroll Generated: ${data.month}`,
          message: `Your draft payroll for ${data.month} has been generated.`,
          type: 'system',
          priority: 'normal',
          metadata: { payrollId: id, month: data.month }
        });
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll generated successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to generate payroll');
    },
  });
}

export function useUpdatePayroll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PayrollRecord> }) => {
      await payrollRepository.update(id, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_updated', user.uid, user.displayName || 'Admin', id, 'payroll', { updatedKeys: Object.keys(data) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update payroll');
    },
  });
}

export function useUpdatePayrollStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PayrollStatus }) => {
      await payrollRepository.update(id, {
        status,
        updatedAt: serverTimestamp(),
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('payroll_status_updated', user.uid, user.displayName || 'Admin', id, 'payroll', { status });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Payroll status updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update payroll status');
    },
  });
}

export function usePaySalary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const paymentDate = new Date().toISOString().split('T')[0];
      await payrollRepository.update(id, {
        status: 'paid',
        paymentDate,
        updatedAt: serverTimestamp(),
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('salary_paid', user.uid, user.displayName || 'Admin', id, 'payroll');
        
        const record = await payrollRepository.getById(id);
        if (record) {
          await notificationRepository.createNotification({
            recipientId: record.staffId,
            title: `Salary Paid: ${record.month}`,
            message: `Your salary for ${record.month} (₹${record.netSalary}) has been transferred successfully.`,
            type: 'system',
            priority: 'high',
            metadata: { payrollId: id, amount: record.netSalary }
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.base });
      toast.success('Salary marked as paid');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to mark salary as paid');
    },
  });
}
