import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, runTransaction } from '@firebase/firestore';

const withFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

withFirestoreEmulator('Payroll & Salary Advance Transactions', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'mysuru-paakashale-payroll-test',
      firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'admin'), { id: 'admin', role: 'admin' });
    });
  });

  afterAll(async () => environment.cleanup());

  it('deducts advance exactly once and stores amountPaid correctly in a transaction', async () => {
    const adminContext = environment.authenticatedContext('admin').firestore();
    
    const staffId = 'staff-123';
    const payrollId = 'payroll-123';
    const advanceId = 'advance-123';

    // 1. Seed data as Admin
    await assertSucceeds(
      setDoc(doc(adminContext, 'payroll', payrollId), {
        id: payrollId,
        staffId,
        staffName: 'Test Staff',
        month: '2026-09',
        basicSalary: 30000,
        workingDays: 30,
        presentDays: 30,
        overtimeHours: 0,
        overtimeRate: 0,
        bonus: 0,
        deductions: 0,
        grossSalary: 30000,
        netSalary: 30000,
        status: 'approved',
        paymentDate: null,
      })
    );

    await assertSucceeds(
      setDoc(doc(adminContext, 'salaryAdvances', advanceId), {
        id: advanceId,
        staffId,
        amount: 5000,
        date: '2026-09-05',
        reason: 'Personal requirement',
        status: 'pending',
        payrollId: null,
      })
    );

    // 2. Perform the Payment Transaction (simulating usePaySalary hook)
    const advancesToDeduct = [advanceId];
    const advanceDeduction = 5000;
    const otherAdjustments = -500;
    const amountPaid = 23000;

    await assertSucceeds(
      runTransaction(adminContext, async (transaction) => {
        const payrollRef = doc(adminContext, 'payroll', payrollId);
        const payrollDoc = await transaction.get(payrollRef);
        
        if (!payrollDoc.exists() || payrollDoc.data().status === 'paid') {
          throw new Error('Already paid');
        }

        const advanceRefs = advancesToDeduct.map(id => doc(adminContext, 'salaryAdvances', id));
        const advanceDocs = await Promise.all(advanceRefs.map(ref => transaction.get(ref)));
        
        for (const adDoc of advanceDocs) {
          if (!adDoc.exists() || adDoc.data()?.status !== 'pending') {
            throw new Error(`Advance ${adDoc.id} no longer pending or does not exist`);
          }
        }

        const suggestedPayable = payrollDoc.data().netSalary - advanceDeduction + otherAdjustments;

        transaction.update(payrollRef, {
          status: 'paid',
          paymentDate: '2026-09-08',
          advanceDeduction,
          otherAdjustments,
          suggestedPayable,
          amountPaid,
          advancesDeducted: advancesToDeduct,
        });

        for (const adRef of advanceRefs) {
          transaction.update(adRef, {
            status: 'deducted',
            payrollId
          });
        }
      })
    );

    // 3. Verify Final State
    const finalPayroll = await getDoc(doc(adminContext, 'payroll', payrollId));
    expect(finalPayroll.data()?.status).toBe('paid');
    expect(finalPayroll.data()?.amountPaid).toBe(23000);
    expect(finalPayroll.data()?.suggestedPayable).toBe(24500);
    expect(finalPayroll.data()?.advanceDeduction).toBe(5000);

    const finalAdvance = await getDoc(doc(adminContext, 'salaryAdvances', advanceId));
    expect(finalAdvance.data()?.status).toBe('deducted');
    expect(finalAdvance.data()?.payrollId).toBe(payrollId);

    // 4. Test Idempotency: Duplicate Payment Attempt Should Fail
    await expect(
      runTransaction(adminContext, async (transaction) => {
        const payrollRef = doc(adminContext, 'payroll', payrollId);
        const payrollDoc = await transaction.get(payrollRef);
        if (payrollDoc.data()?.status === 'paid') throw new Error('Already paid');
      })
    ).rejects.toThrow('Already paid');
  });
});
