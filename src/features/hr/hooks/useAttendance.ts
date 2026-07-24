import { Timestamp } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceRepository } from '@/shared/services/firestore/attendanceRepository';
import type { AttendanceRecord } from '@/shared/types';
import { serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';

export const queryKeys = {
  attendance: {
    base: ['attendance'] as const,
    byDate: (date: string) => [...queryKeys.attendance.base, 'date', date] as const,
    byStaff: (staffId: string) => [...queryKeys.attendance.base, 'staff', staffId] as const,
    record: (staffId: string, date: string) => [...queryKeys.attendance.base, 'record', staffId, date] as const,
  },
};

export function useAttendanceByDate(date: string) {
  return useQuery({
    queryKey: queryKeys.attendance.byDate(date),
    queryFn: () => attendanceRepository.getAttendanceByDate(date),
    enabled: !!date,
  });
}

export function useAttendanceByStaff(staffId: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: [...queryKeys.attendance.byStaff(staffId), startDate, endDate],
    queryFn: () => attendanceRepository.getAttendanceByStaff(staffId, startDate, endDate),
    enabled: !!staffId,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ staffId, staffName, date, time }: { staffId: string; staffName: string; date: string; time: string }) => {
      const existing = await attendanceRepository.getRecord(staffId, date);
      if (existing) throw new Error('Already checked in today');

      const id = crypto.randomUUID();
      const record: AttendanceRecord = {
        id,
        staffId,
        staffName,
        date,
        checkInTime: time,
        checkOutTime: null,
        totalWorkingHours: 0,
        status: 'present',
        notes: null,
        createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      };

      await attendanceRepository.create(record, id);

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('attendance_checked_in', user.uid, user.displayName || 'Staff', id, 'attendance', { staffId, date, time });
      }
      return record;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.base });
      toast.success('Checked in successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Check-in failed');
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ staffId, date, time }: { staffId: string; date: string; time: string }) => {
      const record = await attendanceRepository.getRecord(staffId, date);
      if (!record) throw new Error('No check-in record found for today');
      if (record.checkOutTime) throw new Error('Already checked out today');

      // Calculate total working hours
      const checkInParts = record.checkInTime!.split(':').map(Number);
      const checkOutParts = time.split(':').map(Number);
      
      const checkInMinutes = checkInParts[0] * 60 + checkInParts[1];
      const checkOutMinutes = checkOutParts[0] * 60 + checkOutParts[1];
      
      if (checkOutMinutes < checkInMinutes) throw new Error('Check-out time cannot be before check-in time');
      
      const totalHours = Math.round((checkOutMinutes - checkInMinutes) / 60 * 10) / 10;

      await attendanceRepository.update(record.id, {
        checkOutTime: time,
        totalWorkingHours: totalHours,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('attendance_checked_out', user.uid, user.displayName || 'Staff', record.id, 'attendance', { staffId, date, time, totalHours });
      }
      return record.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.base });
      toast.success('Checked out successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Check-out failed');
    },
  });
}

export function useUpdateAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AttendanceRecord> }) => {
      await attendanceRepository.update(id, {
        ...data,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      });
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('attendance_updated', user.uid, user.displayName || 'Admin', id, 'attendance', { updatedKeys: Object.keys(data) });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.base });
      toast.success('Attendance updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update attendance');
    },
  });
}
