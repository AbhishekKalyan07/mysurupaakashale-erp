import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { LeaveRequest } from '@/shared/types';
import { query, where, getDocs, orderBy } from 'firebase/firestore';

class LeaveRepository extends BaseRepository<LeaveRequest> {
  constructor() {
    super(db, 'leaves', createConverter<LeaveRequest>());
  }

  async getLeavesByStaff(staffId: string): Promise<LeaveRequest[]> {
    const q = query(this.collectionRef, where('staffId', '==', staffId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  async getPendingLeaves(): Promise<LeaveRequest[]> {
    const q = query(this.collectionRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }
}

export const leaveRepository = new LeaveRepository();
