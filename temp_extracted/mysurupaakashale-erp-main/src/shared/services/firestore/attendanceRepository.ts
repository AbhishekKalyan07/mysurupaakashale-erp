import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { AttendanceRecord } from '@/shared/types';
import { query, where, getDocs, limit, orderBy } from 'firebase/firestore';

class AttendanceRepository extends BaseRepository<AttendanceRecord> {
  constructor() {
    super(db, 'attendance', createConverter<AttendanceRecord>());
  }

  async getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
    const q = query(this.collectionRef, where('date', '==', date));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  async getAttendanceByStaff(staffId: string, startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
    let q = query(this.collectionRef, where('staffId', '==', staffId), orderBy('date', 'desc'));
    // Firestore composite index required if combining where('date') and where('staffId') with inequality.
    // For simplicity, we fetch all for a staff member, or assume we have the index.
    const snapshot = await getDocs(q);
    let records = snapshot.docs.map(doc => doc.data());
    
    if (startDate) {
      records = records.filter(r => r.date >= startDate);
    }
    if (endDate) {
      records = records.filter(r => r.date <= endDate);
    }
    
    return records;
  }
  
  async getRecord(staffId: string, date: string): Promise<AttendanceRecord | null> {
    const q = query(this.collectionRef, where('staffId', '==', staffId), where('date', '==', date), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  }
}

export const attendanceRepository = new AttendanceRepository();
