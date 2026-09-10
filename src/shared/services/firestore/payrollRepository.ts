import { db } from "@/shared/lib/firebase";
import { BaseRepository, createConverter } from "./BaseRepository";
import type {
  PayrollRecord,
  EmployeeSalaryProfile,
  SalaryAdvance,
} from "@/shared/types";
import { query, where, getDocs, orderBy } from "firebase/firestore";

class PayrollRepository extends BaseRepository<PayrollRecord> {
  constructor() {
    super(db, "payroll", createConverter<PayrollRecord>());
  }

  async getPayrollByMonth(month: string): Promise<PayrollRecord[]> {
    const q = query(this.collectionRef, where("month", "==", month));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }

  async getPayrollByStaff(staffId: string): Promise<PayrollRecord[]> {
    const q = query(
      this.collectionRef,
      where("staffId", "==", staffId),
      orderBy("month", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }
}

class SalaryProfileRepository extends BaseRepository<EmployeeSalaryProfile> {
  constructor() {
    super(db, "salaryProfiles", createConverter<EmployeeSalaryProfile>());
  }

  async getProfile(staffId: string): Promise<EmployeeSalaryProfile | null> {
    return this.getById(staffId);
  }
}

class SalaryAdvanceRepository extends BaseRepository<SalaryAdvance> {
  constructor() {
    super(db, "salaryAdvances", createConverter<SalaryAdvance>());
  }

  /** Full advance history for a staff member — for the history/management page. */
  async getAllAdvancesByStaff(staffId: string): Promise<SalaryAdvance[]> {
    const q = query(
      this.collectionRef,
      where("staffId", "==", staffId),
      orderBy("date", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Returns ALL pending advances for a staff member regardless of period.
   * @deprecated Use getPendingAdvancesByStaffAndPeriod for payroll payment processing.
   *             This method remains only for backward-compatibility with non-payment contexts.
   */
  async getPendingAdvancesByStaff(staffId: string): Promise<SalaryAdvance[]> {
    const q = query(
      this.collectionRef,
      where("staffId", "==", staffId),
      where("status", "==", "pending"),
      orderBy("date", "asc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Period-scoped query: returns only pending advances that belong to the
   * specific payroll period. This is the method that MUST be used for
   * payroll payment processing to prevent cross-period advance deduction.
   *
   * Advances with payrollMonth === null are explicitly excluded because
   * they are legacy/unassigned and must never be automatically deducted.
   */
  async getPendingAdvancesByStaffAndPeriod(
    staffId: string,
    payrollMonth: string,
  ): Promise<SalaryAdvance[]> {
    const q = query(
      this.collectionRef,
      where("staffId", "==", staffId),
      where("status", "==", "pending"),
      where("payrollMonth", "==", payrollMonth),
      orderBy("date", "asc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }

  /** All advances across all staff for a specific payroll period — for the history page period filter. */
  async getAdvancesByPeriod(payrollMonth: string): Promise<SalaryAdvance[]> {
    const q = query(
      this.collectionRef,
      where("payrollMonth", "==", payrollMonth),
      orderBy("date", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  }
}

export const payrollRepository = new PayrollRepository();
export const salaryProfileRepository = new SalaryProfileRepository();
export const salaryAdvanceRepository = new SalaryAdvanceRepository();
