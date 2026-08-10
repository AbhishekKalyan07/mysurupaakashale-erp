import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTodayInTimezone } from '@/shared/lib/date';
import { subscriptionService } from '../subscriptionService';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { settingsRepository } from '../../firestore/settingsRepository';
import { paymentRepository } from '../../firestore/paymentRepository';
import { orderService } from '../orderService';

vi.mock('../../firestore/paymentRepository', () => ({
  paymentRepository: {
    getPaymentsPaginated: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('../orderService', () => ({
  orderService: {
    generateOrdersForSubscription: vi.fn()
  }
}));

describe('subscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('throws if missing required fields', async () => {
      await expect(
        subscriptionService.createSubscription('', 'plan1', 'standard', 1, 100, [{ mealType: 'lunch', selectedOptionId: 'opt1' }], '2026-08-01', 'addr1', 'monthly', null)
      ).rejects.toThrow('Invalid subscription data: Missing required fields or invalid quantity.');

      await expect(
        subscriptionService.createSubscription('c1', 'plan1', 'standard', 0, 100, [{ mealType: 'lunch', selectedOptionId: 'opt1' }], '2026-08-01', 'addr1', 'monthly', null)
      ).rejects.toThrow('Invalid subscription data: Missing required fields or invalid quantity.');
    });

    it('throws if meal preferences are missing or empty', async () => {
      await expect(
        subscriptionService.createSubscription('c1', 'plan1', 'standard', 1, 100, [], '2026-08-01', 'addr1', 'monthly', null)
      ).rejects.toThrow('At least one meal preference is required.');
    });

    it('creates a subscription with default deposit if settings not found', async () => {
      vi.spyOn(settingsRepository, 'getBusinessSettings').mockResolvedValue(null as any);
      vi.spyOn(subscriptionRepository, 'create').mockResolvedValue('sub1');

      const id = await subscriptionService.createSubscription(
        'c1', 'plan1', 'standard', 1, 100, [{ mealType: 'lunch', selectedOptionId: 'opt1' }], '2026-08-01', 'addr1', 'monthly', null
      );

      expect(typeof id).toBe('string');
      expect(subscriptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'c1', depositAmount: 1000 }),
        expect.any(String)
      );
    });

    it('creates a subscription with configured deposit', async () => {
      vi.spyOn(settingsRepository, 'getBusinessSettings').mockResolvedValue({ pricing: { securityDepositAmount: 500 } } as any);
      vi.spyOn(subscriptionRepository, 'create').mockResolvedValue('sub1');

      await subscriptionService.createSubscription(
        'c1', 'plan1', 'standard', 1, 100, [{ mealType: 'lunch', selectedOptionId: 'opt1' }], '2026-08-01', 'addr1', 'monthly', null
      );

      expect(subscriptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ depositAmount: 500 }),
        expect.any(String)
      );
    });
  });

  describe('approveSubscription', () => {
    it('throws if subscription object is invalid', async () => {
      await expect(subscriptionService.approveSubscription(null as any)).rejects.toThrow('Valid subscription object is required.');
    });

    it('returns early if already active (idempotency)', async () => {
      vi.spyOn(subscriptionRepository, 'updateStatus').mockResolvedValue(undefined);
      await subscriptionService.approveSubscription({ id: 'sub1', status: 'active' } as any);
      expect(subscriptionRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws if subscription is cancelled or expired', async () => {
      await expect(subscriptionService.approveSubscription({ id: 'sub1', status: 'cancelled' } as any))
        .rejects.toThrow('Cannot approve a cancelled subscription — use renew instead.');
    });

    it('approves subscription and verifies pending payments', async () => {
      vi.spyOn(subscriptionRepository, 'updateStatus').mockResolvedValue(undefined);
      vi.mocked(paymentRepository.getPaymentsPaginated).mockResolvedValue({ 
        payments: [{ id: 'p1', subscriptionId: 'sub1', status: 'pending' } as any],
        lastDoc: null
      });

      await subscriptionService.approveSubscription({ id: 'sub1', status: 'pending_payment', startDate: '2099-01-01', mealPreferences: [] } as any);

      expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith('sub1', 'active');
      expect(paymentRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'verified' }));
    });

    it('generates orders if start date is today or earlier', async () => {
      vi.spyOn(subscriptionRepository, 'updateStatus').mockResolvedValue(undefined);
      vi.mocked(paymentRepository.getPaymentsPaginated).mockResolvedValue({ payments: [], lastDoc: null });
      
      const today = getTodayInTimezone();

      await subscriptionService.approveSubscription({ 
        id: 'sub1', 
        status: 'pending_payment', 
        startDate: today, 
        mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt1' }] 
      } as any);

      expect(orderService.generateOrdersForSubscription).toHaveBeenCalled();
    });
  });

  describe('rejectSubscription', () => {
    it('throws if subscription object is invalid', async () => {
      await expect(subscriptionService.rejectSubscription(null as any)).rejects.toThrow('Valid subscription object is required.');
    });

    it('returns early if already cancelled (idempotency)', async () => {
      vi.spyOn(subscriptionRepository, 'updateStatus').mockResolvedValue(undefined);
      await subscriptionService.rejectSubscription({ id: 'sub1', status: 'cancelled' } as any);
      expect(subscriptionRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects subscription and associated payments', async () => {
      vi.spyOn(subscriptionRepository, 'updateStatus').mockResolvedValue(undefined);
      vi.mocked(paymentRepository.getPaymentsPaginated).mockResolvedValue({ 
        payments: [{ id: 'p1', subscriptionId: 'sub1', status: 'pending' } as any],
        lastDoc: null
      });

      await subscriptionService.rejectSubscription({ id: 'sub1', status: 'pending_payment' } as any);

      expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith('sub1', 'cancelled');
      expect(paymentRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'rejected' }));
    });
  });

  describe('pauseSubscription', () => {
    it('throws if subscription object is invalid', async () => {
      await expect(subscriptionService.pauseSubscription(null as any)).rejects.toThrow('Valid subscription object is required.');
    });

    it('throws if attempting to pause an invalid status immediately', async () => {
      await expect(subscriptionService.pauseSubscription({ id: 'sub1', status: 'pending_payment' } as any))
        .rejects.toThrow('Only an active or already paused subscription can be paused immediately.');
    });

    it('returns early if identical pause is requested (idempotency)', async () => {
      vi.spyOn(subscriptionRepository, 'update').mockResolvedValue(undefined);
      await subscriptionService.pauseSubscription(
        { id: 'sub1', status: 'paused', pauseStartDate: '2026-08-01', pauseEndDate: null } as any,
        true,
        '2026-08-01',
        null
      );
      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('pauses a subscription', async () => {
      vi.spyOn(subscriptionRepository, 'update').mockResolvedValue(undefined);
      await subscriptionService.pauseSubscription({ id: 'sub1', status: 'active' } as any);
      expect(subscriptionRepository.update).toHaveBeenCalledWith('sub1', expect.objectContaining({ status: 'paused' }));
    });
  });

  describe('resumeSubscription', () => {
    it('throws if subscription object is invalid', async () => {
      await expect(subscriptionService.resumeSubscription(null as any)).rejects.toThrow('Valid subscription object is required.');
    });

    it('returns early if already active without pause schedule (idempotency)', async () => {
      vi.spyOn(subscriptionRepository, 'update').mockResolvedValue(undefined);
      await subscriptionService.resumeSubscription({ id: 'sub1', status: 'active' } as any);
      expect(subscriptionRepository.update).not.toHaveBeenCalled();
    });

    it('resumes a paused subscription', async () => {
      vi.spyOn(subscriptionRepository, 'update').mockResolvedValue(undefined);
      await subscriptionService.resumeSubscription({ id: 'sub1', status: 'paused', pauseStartDate: '2026-08-01' } as any);
      expect(subscriptionRepository.update).toHaveBeenCalledWith('sub1', expect.objectContaining({ status: 'active', pauseStartDate: null }));
    });
  });
});
