import type { EmployeeSalaryProfile, AttendanceRecord } from "@/shared/types";

export interface PayrollConfig {
  standardWorkingDays: number;
  standardWorkingHours: number;
  taxPercentage: number;
  leaveDeductionMultiplier: number;
}

export function calculatePayroll(
  profile: EmployeeSalaryProfile | null | undefined,
  attendanceRecords: AttendanceRecord[],
  config: PayrollConfig,
) {
  // Use configured basicSalary if it exists and is >= 0, otherwise fallback to 0.
  // Same for overtimeRate.
  const basic = profile?.basicSalary ?? 0;
  const otRate = profile?.overtimeRate ?? 100;

  const {
    standardWorkingDays,
    standardWorkingHours,
    taxPercentage,
    leaveDeductionMultiplier,
  } = config;

  const presentDays = attendanceRecords.filter(
    (a) => a.status === "present",
  ).length;
  const halfDays = attendanceRecords.filter(
    (a) => a.status === "half_day",
  ).length;
  const totalWorkingDays = presentDays + halfDays * 0.5;

  let overtimeHours = 0;
  attendanceRecords.forEach((a) => {
    if (a.totalWorkingHours > standardWorkingHours) {
      overtimeHours += a.totalWorkingHours - standardWorkingHours;
    }
  });

  const overtimeBonus = overtimeHours * otRate;

  // Deductions: if they worked fewer days than standard, deduct proportionately.
  const dailyWage = basic / standardWorkingDays;
  let leaveDeduction = 0;
  if (totalWorkingDays < standardWorkingDays) {
    const daysShort = standardWorkingDays - totalWorkingDays;
    leaveDeduction = daysShort * dailyWage * leaveDeductionMultiplier;
  }

  const gross = basic + overtimeBonus;
  const taxDeduction = gross * (taxPercentage / 100);
  const deductions = leaveDeduction + taxDeduction;
  const net = Math.max(0, gross - deductions);

  return {
    basicSalary: basic,
    workingDays: totalWorkingDays,
    presentDays,
    overtimeHours,
    overtimeRate: otRate,
    bonus: overtimeBonus,
    deductions,
    taxDeduction,
    leaveDeduction,
    grossSalary: gross,
    netSalary: net,
  };
}
