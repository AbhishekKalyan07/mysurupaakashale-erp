import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } from '@firebase/firestore';

const PROJECT_ID = 'demo-security-hr';
const withEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withEmulator('🔐 HR Security Rules', () => {
  let env: RulesTestEnvironment;
  const STAFF_UID = 'uid-staff-hr';
  const OTHER_STAFF_UID = 'uid-other-staff-hr';
  const ADMIN_UID = 'uid-admin-hr';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', STAFF_UID), { id: STAFF_UID, role: 'kitchen' });
      await setDoc(doc(db, 'users', OTHER_STAFF_UID), { id: OTHER_STAFF_UID, role: 'kitchen' });
      await setDoc(doc(db, 'users', ADMIN_UID), { id: ADMIN_UID, role: 'admin' });

      await setDoc(doc(db, 'leaves', 'leave-1'), {
        id: 'leave-1',
        staffId: STAFF_UID,
        status: 'pending',
        startDate: '2025-01-01',
        endDate: '2025-01-02'
      });

      await setDoc(doc(db, 'attendance', 'att-1'), {
        id: 'att-1',
        staffId: STAFF_UID,
        date: '2025-01-01',
        checkInTime: '2025-01-01T08:00:00.000Z',
        checkOutTime: null,
        status: 'present',
        updatedAt: new Date()
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // Leaves
  it('ALLOW: Staff can create a leave request for themselves', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'leaves', 'new-leave'), {
      staffId: STAFF_UID,
      status: 'pending',
      startDate: '2025-02-01',
      endDate: '2025-02-02'
    }));
  });

  it('DENY: Staff cannot create a leave request for someone else', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertFails(setDoc(doc(db, 'leaves', 'new-leave-other'), {
      staffId: OTHER_STAFF_UID,
      status: 'pending'
    }));
  });

  it('DENY: Staff cannot self-approve or edit leaves', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertFails(updateDoc(doc(db, 'leaves', 'leave-1'), {
      status: 'approved'
    }));
    await assertFails(updateDoc(doc(db, 'leaves', 'leave-1'), {
      startDate: '2025-01-03'
    }));
  });

  it('ALLOW: Admin can approve leaves', async () => {
    const db = env.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'leaves', 'leave-1'), {
      status: 'approved'
    }));
  });

  // Attendance
  it('ALLOW: Staff can check-in (create attendance) for themselves', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'attendance', 'new-att'), {
      staffId: STAFF_UID,
      date: '2025-02-01',
      checkInTime: '2025-02-01T08:00:00.000Z',
      checkOutTime: null,
      status: 'present'
    }));
  });

  it('DENY: Staff cannot check-in for someone else', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertFails(setDoc(doc(db, 'attendance', 'bad-att'), {
      staffId: OTHER_STAFF_UID,
      date: '2025-02-01',
      checkInTime: '2025-02-01T08:00:00.000Z',
      checkOutTime: null,
      status: 'present'
    }));
  });

  it('ALLOW: Staff can check-out (update checkOutTime)', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertSucceeds(updateDoc(doc(db, 'attendance', 'att-1'), {
      checkOutTime: '2025-01-01T17:00:00.000Z',
      totalWorkingHours: 9,
      updatedAt: new Date()
    }));
  });

  it('DENY: Staff cannot change checkInTime, date, or status', async () => {
    const db = env.authenticatedContext(STAFF_UID).firestore();
    await assertFails(updateDoc(doc(db, 'attendance', 'att-1'), {
      checkInTime: '2025-01-01T09:00:00.000Z',
      updatedAt: new Date()
    }));
    await assertFails(updateDoc(doc(db, 'attendance', 'att-1'), {
      status: 'absent',
      updatedAt: new Date()
    }));
  });
});
