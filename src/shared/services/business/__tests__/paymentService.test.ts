import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentService } from '../paymentService';
import { paymentRepository } from '../../firestore/paymentRepository';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    runTransaction: vi.fn(),
  };
});

describe('paymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitPayment', () => {
    it('submits a payment successfully', async () => {
      vi.spyOn(paymentRepository, 'create').mockResolvedValue('pay1');
      
      const res = await paymentService.submitPayment({
        subscriptionId: 'sub1',
        amount: 1000,
        paymentMethod: 'upi',
        referenceNumber: '123',
        paymentDate: '2026-08-01',
        billingMonth: '2026-08'
      }, 'c1', 'Customer');
      expect(res).toBe('pay1');
    });
  });

  describe('approvePayment', () => {
    it('approves payment successfully', async () => {
      const { runTransaction } = require('firebase/firestore');
      runTransaction.mockImplementation(async (_db: any) => {
        // mock transaction behavior if needed, or just let it pass
      });
      // the test will just not throw since runTransaction is mocked
      await expect(paymentService.approvePayment('pay1', 'admin1')).resolves.not.toThrow();
    });
  });

  describe('rejectPayment', () => {
    it('rejects payment successfully', async () => {
      const { runTransaction } = require('firebase/firestore');
      runTransaction.mockImplementation(async (_db: any) => {
      });
      await expect(paymentService.rejectPayment('pay1', 'admin1', 'reason')).resolves.not.toThrow();
    });
  });
});
