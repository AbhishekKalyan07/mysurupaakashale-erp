import { Timestamp } from 'firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave';

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  checkInTime: string | null; // ISO string or HH:mm
  checkOutTime: string | null;
  totalWorkingHours: number;
  status: AttendanceStatus;
  notes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveType = 'sick' | 'casual' | 'unpaid' | 'other';

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  approvedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PayrollStatus = 'draft' | 'review' | 'approved' | 'paid' | 'archived';

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  month: string; // YYYY-MM
  basicSalary: number;
  workingDays: number;
  presentDays: number;
  overtimeHours: number;
  overtimeRate: number; // per hour
  bonus: number;
  deductions: number;
  deductionReason: string | null;
  grossSalary: number;
  netSalary: number;
  paymentDate: string | null;
  status: PayrollStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmployeeSalaryProfile {
  id: string; // matches staffId
  basicSalary: number;
  overtimeRate: number;
  isActive: boolean;
  updatedAt: Timestamp;
}
