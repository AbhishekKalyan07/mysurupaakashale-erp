import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { PayrollRecord, EmployeeSalaryProfile, SalaryAdvance } from '@/shared/types';
import { query, where, getDocs, orderBy } from 'firebase/firestore';

class PayrollRepository extends BaseRepository<PayrollRecord> {
  constructor() {
    super(db, 'payroll', createConverter<PayrollRecord>());
  }

  async getPayrollByMonth(month: string): Promise<PayrollRecord[]> {
    const q = query(this.collectionRef, where('month', '==', month));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  async getPayrollByStaff(staffId: string): Promise<PayrollRecord[]> {
    const q = query(this.collectionRef, where('staffId', '==', staffId), orderBy('month', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }
}

class SalaryProfileRepository extends BaseRepository<EmployeeSalaryProfile> {
  constructor() {
    super(db, 'salaryProfiles', createConverter<EmployeeSalaryProfile>());
  }
  
  async getProfile(staffId: string): Promise<EmployeeSalaryProfile | null> {
    return this.getById(staffId);
  }
}

class SalaryAdvanceRepository extends BaseRepository<SalaryAdvance> {
  constructor() {
    super(db, 'salaryAdvances', createConverter<SalaryAdvance>());
  }

  async getAdvancesByStaff(staffId: string): Promise<SalaryAdvance[]> {
    const q = query(this.collectionRef, where('staffId', '==', staffId), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  async getPendingAdvancesByStaff(staffId: string): Promise<SalaryAdvance[]> {
    const q = query(this.collectionRef, where('staffId', '==', staffId), where('status', '==', 'pending'), orderBy('date', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }
}

export const payrollRepository = new PayrollRepository();
export const salaryProfileRepository = new SalaryProfileRepository();
export const salaryAdvanceRepository = new SalaryAdvanceRepository();
