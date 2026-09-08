import { describe, it, expect } from 'vitest';
import { calculatePayroll, type PayrollConfig } from '../payrollCalculator';
import type { EmployeeSalaryProfile, AttendanceRecord, AttendanceStatus } from '@/shared/types';
import { Timestamp } from 'firebase/firestore';

const config: PayrollConfig = {
  standardWorkingDays: 22,
  standardWorkingHours: 8,
  taxPercentage: 0,
  leaveDeductionMultiplier: 1,
};

const createAttendance = (status: AttendanceStatus, hours: number = 8): AttendanceRecord => ({
  id: 'test',
  staffId: '123',
  staffName: 'Test',
  date: '2026-09-01',
  checkInTime: null,
  checkOutTime: null,
  totalWorkingHours: hours,
  status,
  notes: null,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
});

describe('calculatePayroll', () => {
  it('uses configured basicSalary of 30000 instead of 15000 fallback', () => {
    const profile: EmployeeSalaryProfile = {
      id: '123',
      basicSalary: 30000,
      overtimeRate: 150,
      isActive: true,
      updatedAt: Timestamp.now(),
    };

    // Employee is absent all month (0 days present).
    // The deduction should be 30000 (22 days * (30000/22)), resulting in 0 net salary and 30000 deduction.
    // If it used 15000 fallback, deduction would be 15000.
    const result = calculatePayroll(profile, [], config);

    expect(result.basicSalary).toBe(30000);
    expect(result.leaveDeduction).toBeCloseTo(30000);
    expect(result.grossSalary).toBe(30000);
    expect(result.netSalary).toBe(0);
  });

  it('calculates overtime correctly using configured overtimeRate of 150', () => {
    const profile: EmployeeSalaryProfile = {
      id: '123',
      basicSalary: 30000,
      overtimeRate: 150,
      isActive: true,
      updatedAt: Timestamp.now(),
    };

    // Employee worked 22 days, but 1 day had 10 hours (2 hours overtime).
    const attendance: AttendanceRecord[] = Array.from({ length: 21 }, () => createAttendance('present', 8));
    attendance.push(createAttendance('present', 10)); // 2 hours overtime

    const result = calculatePayroll(profile, attendance, config);

    expect(result.overtimeHours).toBe(2);
    expect(result.overtimeRate).toBe(150);
    expect(result.bonus).toBe(300); // 2 * 150
    expect(result.grossSalary).toBe(30300); // 30000 + 300
    expect(result.netSalary).toBe(30300);
  });

  it('respects a basicSalary of 0 without falling back to 15000', () => {
    const profile: EmployeeSalaryProfile = {
      id: '123',
      basicSalary: 0,
      overtimeRate: 150,
      isActive: true,
      updatedAt: Timestamp.now(),
    };

    const attendance: AttendanceRecord[] = Array.from({ length: 22 }, () => createAttendance('present', 8));
    const result = calculatePayroll(profile, attendance, config);

    expect(result.basicSalary).toBe(0);
    expect(result.grossSalary).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it('falls back to 15000 and 100 when profile is missing', () => {
    // Missing profile (legacy employee)
    const result = calculatePayroll(null, [], config);

    expect(result.basicSalary).toBe(15000);
    expect(result.overtimeRate).toBe(100);
    expect(result.leaveDeduction).toBeCloseTo(15000);
  });
});
