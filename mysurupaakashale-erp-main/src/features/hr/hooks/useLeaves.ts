import { Timestamp } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveRepository } from '@/shared/services/firestore/leaveRepository';
import type { LeaveRequest, LeaveStatus } from '@/shared/types';
import { serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import { notificationRepository } from '@/shared/services/firestore/notificationRepository';
import { db } from '@/shared/lib/firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';

export const queryKeys = {
  leaves: {
    base: ['leaves'] as const,
    byStaff: (staffId: string) => [...queryKeys.leaves.base, 'staff', staffId] as const,
    pending: () => [...queryKeys.leaves.base, 'pending'] as const,
  },
};

export function useStaffLeaves(staffId: string) {
  return useQuery({
    queryKey: queryKeys.leaves.byStaff(staffId),
    queryFn: () => leaveRepository.getLeavesByStaff(staffId),
    enabled: !!staffId,
  });
}

export function usePendingLeaves() {
  return useQuery({
    queryKey: queryKeys.leaves.pending(),
    queryFn: () => leaveRepository.getPendingLeaves(),
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<LeaveRequest, 'id' | 'status' | 'approvedBy' | 'createdAt' | 'updatedAt'>) => {
      const id = crypto.randomUUID();
      const record: LeaveRequest = {
        ...data,
        id,
        status: 'pending',
        approvedBy: null,
        createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      };
      await leaveRepository.create(record, id);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('leave_requested', user.uid, user.displayName || 'Staff', id, 'leave');
      }
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.leaves.base });
      toast.success('Leave request submitted');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to submit leave request');
    },
  });
}

export function useUpdateLeaveStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeaveStatus }) => {
      const user = getAuth().currentUser;
      await leaveRepository.update(id, {
        status,
        approvedBy: user?.uid || 'Admin',
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });
      if (user) {
        await auditRepository.logAction(`leave_${status}`, user.uid, user.displayName || 'Admin', id, 'leave');
        
        // Notify the staff member about the leave update
        const leaveRecord = await leaveRepository.getById(id);
        if (leaveRecord && (status === 'approved' || status === 'rejected')) {
          await notificationRepository.createNotification({
            recipientId: leaveRecord.staffId,
            recipientRole: 'staff',
            channel: 'in_app',
            title: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: `Your leave request for ${leaveRecord.startDate} has been ${status}.`,
            type: 'leave_updated',
            priority: status === 'approved' ? 'normal' : 'high',
            metadata: { leaveId: id, status }
          });
          
          // Phase 6: Automatic Route Reassignment
          // If approved, unassign any orders given to this delivery partner during their leave
          if (status === 'approved') {
            const ordersRef = collection(db, 'orders');
            const q = query(
              ordersRef, 
              where('deliveryPartnerId', '==', leaveRecord.staffId),
              where('date', '>=', leaveRecord.startDate),
              where('date', '<=', leaveRecord.endDate)
            );
            
            const strandedOrders = await getDocs(q);
            if (!strandedOrders.empty) {
              const batch = writeBatch(db);
              strandedOrders.forEach((doc) => {
                batch.update(doc.ref, { 
                  deliveryPartnerId: null,
                  updatedAt: serverTimestamp() as unknown as Timestamp 
                });
              });
              await batch.commit();
              toast(`Unassigned ${strandedOrders.size} stranded orders. Please reassign them in Delivery Dashboard.`, { icon: '⚠️' });
            }
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.leaves.base });
      toast.success('Leave status updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update leave status');
    },
  });
}
