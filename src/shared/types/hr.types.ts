import { Timestamp } from "firebase/firestore";

export type AttendanceStatus = "present" | "absent" | "half_day" | "leave";

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

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveType = "sick" | "casual" | "unpaid" | "other";

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

export type PayrollStatus =
  "draft" | "review" | "approved" | "paid" | "archived" | "rejected";

export type SalaryAdvanceStatus = "pending" | "deducted" | "voided";

export interface SalaryAdvance {
  id: string;
  staffId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  /** Canonical payroll period. Null for legacy/unassigned advances created before
   *  this field existed. Legacy advances must NEVER be automatically deducted. */
  payrollMonth: string | null; // YYYY-MM
  reason: string;
  notes?: string;
  status: SalaryAdvanceStatus;
  payrollId: string | null;
  // Void metadata — present only when status === 'voided'
  voidedAt?: Timestamp;
  voidedBy?: string; // actor Firebase UID
  voidedByName?: string; // actor display name
  voidReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // actor Firebase UID
  createdByName?: string; // actor display name at creation time
}

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  month: string; // YYYY-MM — the canonical payroll period
  basicSalary: number;
  workingDays: number;
  presentDays: number;
  overtimeHours: number;
  overtimeRate: number; // per hour
  bonus: number;
  deductions: number;
  deductionReason: string | null;
  grossSalary: number;
  netSalary: number; // The legacy net calculated salary. For backward compatibility.
  calculatedSalary?: number; // Pure calculated gross - standard deductions
  advanceDeduction?: number;
  otherAdjustments?: number;
  suggestedPayable?: number;
  amountPaid?: number; // The actual amount paid by admin — may differ from suggestedPayable
  advancesDeducted?: string[]; // IDs of SalaryAdvances successfully deducted in this payment
  paymentDate: string | null;
  status: PayrollStatus;
  // Rejection / return-to-draft metadata
  rejectionReason?: string;
  rejectedBy?: string; // actor Firebase UID
  rejectedByName?: string; // actor display name
  rejectedAt?: string; // ISO date string YYYY-MM-DD
  returnReason?: string;
  returnedBy?: string;
  returnedByName?: string;
  returnedAt?: string;
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
