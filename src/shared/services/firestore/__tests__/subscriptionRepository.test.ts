import { describe, it, expect, vi } from 'vitest';
import { subscriptionRepository } from '../subscriptionRepository';
import { getDocs, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';

describe('subscriptionRepository', () => {
  const customerId = 'cust-1';
  const subId = 'sub-1';

  describe('getByCustomerId', () => {
    it('returns subscriptions for customer', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ data: () => ({ id: subId, customerId }) }]
      } as any);
      
      const subs = await subscriptionRepository.getByCustomerId(customerId);
      expect(subs.length).toBe(1);
      expect(subs[0].id).toBe(subId);
    });
  });

  describe('getActiveSubscriptionByCustomerId', () => {
    it('returns active subscription if exists', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'sub-2', status: 'pending_payment' }) },
          { data: () => ({ id: 'sub-1', status: 'active' }) },
        ]
      } as any);

      const sub = await subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
      expect(sub?.status).toBe('active');
    });

    it('returns pending_payment if no active exists', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'sub-2', status: 'pending_payment' }) },
        ]
      } as any);

      const sub = await subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
      expect(sub?.status).toBe('pending_payment');
    });

    it('returns null if no subscriptions exist', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      const sub = await subscriptionRepository.getActiveSubscriptionByCustomerId(customerId);
      expect(sub).toBeNull();
    });
  });

  describe('addSkip', () => {
    it('adds skip document and increments credit', async () => {
      await subscriptionRepository.addSkip(subId, '2026-08-01', ['lunch'], 'holiday', 'admin-1', 150);
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSkips', () => {
    it('returns list of skips', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => ({ date: '2026-08-01', mealTypes: ['lunch'] }) }
        ]
      } as any);
      
      const skips = await subscriptionRepository.getSkips(subId);
      expect(skips.length).toBe(1);
      expect(skips[0].date).toBe('2026-08-01');
    });
  });

  describe('getSubscriptionsPaginated', () => {
    it('returns paginated subscriptions and last document', async () => {
      const mockDocs = Array.from({ length: 20 }).map((_, i) => ({
        data: () => ({ id: `sub-${i}` })
      }));
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockDocs
      } as any);
      
      const result = await subscriptionRepository.getSubscriptionsPaginated({ status: 'active' }, 20);
      expect(result.subscriptions.length).toBe(20);
      expect(result.lastDoc).toBeTruthy();
    });

    it('returns null last document if less than page size', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ data: () => ({ id: 'sub-1' }) }]
      } as any);
      
      const result = await subscriptionRepository.getSubscriptionsPaginated({}, 20, {} as any);
      expect(result.subscriptions.length).toBe(1);
      expect(result.lastDoc).toBeNull();
    });
  });

  describe('getAllSubscriptions', () => {
    it('returns all subscriptions', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ data: () => ({ id: 'sub-1' }) }]
      } as any);
      const subs = await subscriptionRepository.getAllSubscriptions();
      expect(subs.length).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('updates subscription status', async () => {
      await subscriptionRepository.updateStatus(subId, 'paused');
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'paused' })
      );
    });
  });

  describe('subscribeActiveSubscription', () => {
    it('calls onSnapshot and returns unsubscribe function', () => {
      const mockUnsub = vi.fn();
      vi.mocked(onSnapshot).mockReturnValueOnce(mockUnsub as any);

      const onNext = vi.fn();
      const unsub = subscriptionRepository.subscribeActiveSubscription(customerId, onNext);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsub).toBe('function');
    });

    it('prefers active/paused over pending_payment in snapshot callback', () => {
      let capturedCallback: ((snap: any) => void) | undefined;
      vi.mocked(onSnapshot).mockImplementationOnce((_q, cb: any) => {
        capturedCallback = cb;
        return vi.fn() as any;
      });

      const onNext = vi.fn();
      subscriptionRepository.subscribeActiveSubscription(customerId, onNext);

      // Simulate snapshot with mixed statuses — active should win
      capturedCallback!({
        docs: [
          { data: () => ({ id: 'sub-p', status: 'pending_payment' }) },
          { data: () => ({ id: 'sub-a', status: 'active' }) },
        ]
      });

      expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    });

    it('returns null when snapshot is empty', () => {
      let capturedCallback: ((snap: any) => void) | undefined;
      vi.mocked(onSnapshot).mockImplementationOnce((_q, cb: any) => {
        capturedCallback = cb;
        return vi.fn() as any;
      });

      const onNext = vi.fn();
      subscriptionRepository.subscribeActiveSubscription(customerId, onNext);

      capturedCallback!({ docs: [] });

      expect(onNext).toHaveBeenCalledWith(null);
    });
  });
});

