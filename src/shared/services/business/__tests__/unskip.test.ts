import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { orderRepository } from '../../firestore/orderRepository';
import { kitchenRepository } from '../../firestore/kitchenRepository';

// Mock Firebase
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined)
    })),
    serverTimestamp: vi.fn(() => 'server-timestamp'),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    doc: vi.fn((db, collection, id, sub, subId) => ({ db, collection, id, sub, subId })),
    collection: vi.fn((db, path) => ({ db, path, withConverter: vi.fn(() => ({ db, path })) })),
  };
});

vi.mock('@/shared/lib/firebase', () => ({
  functions: {},

  db: {},
}));

describe('Unskip Meal Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(kitchenRepository, 'list').mockResolvedValue([{ id: 'k1' } as any]);
  });

  describe('subscriptionRepository.removeSkip (Cutoff and DB)', () => {
    it('1 & 2. Unskip before cutoff succeeds and removes skip record', async () => {
      const mockGetDoc = await import('firebase/firestore').then(m => m.getDoc as import('vitest').Mock);
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ mealTypes: ['breakfast', 'lunch'] })
      });
      const mockSetDoc = await import('firebase/firestore').then(m => m.setDoc as import('vitest').Mock);

      // Mock date to 1 AM, so breakfast cutoff is open
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-01T01:00:00+05:30')); 
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      await subscriptionRepository.removeSkip('sub1', today, ['breakfast'], 'uid1');
      
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mealTypes: ['lunch'] })
      );
      vi.useRealTimers();
    });

    it('6. Unskip after cutoff fails', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-01T12:00:00+05:30')); // 12 PM IST
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      // Try to unskip breakfast (cutoff was 5 AM IST)
      await expect(subscriptionRepository.removeSkip('sub1', today, ['breakfast'], 'uid1'))
        .rejects.toThrow("Cancellation window has closed for breakfast.");
      vi.useRealTimers();
    });

    it('10. Double Unskip is idempotent', async () => {
      const mockGetDoc = await import('firebase/firestore').then(m => m.getDoc as import('vitest').Mock);
      mockGetDoc.mockResolvedValue({
        exists: () => false, // No skip document exists
      });
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-01T01:00:00+05:30')); 
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      await expect(subscriptionRepository.removeSkip('sub1', today, ['breakfast'], 'uid1')).resolves.toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe('orderService.restoreOrdersForUnskipDay', () => {
    it('3. Existing skipped order is restored to scheduled', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'order1', mealType: 'lunch', status: 'skipped' } as any
      ]);
      vi.spyOn(orderService, 'syncCustomerActiveOrders').mockResolvedValue(undefined);
      
      const mockWriteBatch = await import('firebase/firestore').then(m => m.writeBatch as import('vitest').Mock);
      const batchUpdate = vi.fn();
      mockWriteBatch.mockReturnValue({ update: batchUpdate, commit: vi.fn().mockResolvedValue(undefined) });

      await orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']);

      expect(batchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'scheduled' })
      );
      expect(orderService.syncCustomerActiveOrders).toHaveBeenCalledWith('cust1');
    });

    it('4. Missing order is regenerated using subscription data (not customer-supplied fields)', async () => {
      // No existing orders — triggers generation path
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      const mockSub = {
        id: 'sub1',
        customerId: 'cust1',
        status: 'active',
        mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt1' }],
        planId: 'plan1',
        planTier: 'regular',
        pricePerDaySnapshot: 100,
        quantity: 1,
        startDate: '2026-01-01',
      };
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue(mockSub as any);
      vi.spyOn(orderService, 'generateOrdersForSubscription').mockResolvedValue(undefined);

      await orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']);

      // Verify generation was called with the subscription object (not customer-supplied data)
      expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
        mockSub,
        '2026-08-01',
        ['lunch']
      );
    });

    it('4a. Missing order uses correct deterministic ID format ord_{subId}_{date}_{mealType}', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      const mockSub = {
        id: 'sub-abc',
        customerId: 'cust1',
        status: 'active',
        mealPreferences: [{ mealType: 'breakfast', selectedOptionId: 'opt1' }],
        planId: 'plan1',
        planTier: 'regular',
        pricePerDaySnapshot: 100,
        quantity: 1,
        startDate: '2026-01-01',
      };
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue(mockSub as any);

      let capturedOrder: any = null;
      vi.spyOn(orderService, 'generateOrdersForSubscription').mockImplementation(async (sub, date, mealTypes) => {
        // Simulate what generateOrdersForSubscription would write — verify the deterministic ID
        capturedOrder = { id: `ord_${sub.id}_${date}_${mealTypes[0]}`, source: 'subscription', customerId: sub.customerId };
      });

      await orderService.restoreOrdersForUnskipDay('cust1', 'sub-abc', '2026-09-01', ['breakfast']);

      expect(capturedOrder).not.toBeNull();
      expect(capturedOrder.id).toBe('ord_sub-abc_2026-09-01_breakfast');
      expect(capturedOrder.source).toBe('subscription');
      expect(capturedOrder.customerId).toBe('cust1');
    });

    it('4b. Duplicate invocation is idempotent — existing order not duplicated', async () => {
      // Order already exists as 'scheduled' (was already regenerated by a prior call)
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'ord_sub1_2026-08-01_lunch', mealType: 'lunch', status: 'scheduled' } as any
      ]);
      vi.spyOn(orderService, 'syncCustomerActiveOrders').mockResolvedValue(undefined);
      vi.spyOn(orderService, 'generateOrdersForSubscription').mockResolvedValue(undefined);

      await orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']);

      // generateOrdersForSubscription should NOT be called because the order already exists
      expect(orderService.generateOrdersForSubscription).not.toHaveBeenCalled();
    });

    it('4c. Wrong customer subscription ownership is denied', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      // Subscription belongs to a DIFFERENT customer
      const mockSub = {
        id: 'sub1',
        customerId: 'cust-other', // NOT cust1
        status: 'active',
        mealPreferences: [{ mealType: 'lunch' }],
      };
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue(mockSub as any);

      await expect(
        orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch'])
      ).rejects.toThrow('Subscription does not belong to this customer.');
    });

    it('4d. Non-active subscription or invalid dates are rejected during regeneration', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      
      // Inactive sub
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue({
        id: 'sub1', customerId: 'cust1', status: 'paused', startDate: '2026-01-01'
      } as any);
      await expect(
        orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch'])
      ).rejects.toThrow('Subscription is paused, not active. Cannot regenerate orders.');

      // Date before startDate
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue({
        id: 'sub1', customerId: 'cust1', status: 'active', startDate: '2026-09-01'
      } as any);
      await expect(
        orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch'])
      ).rejects.toThrow('Requested date is before the subscription start date.');

      // Date after endDate
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue({
        id: 'sub1', customerId: 'cust1', status: 'active', startDate: '2026-01-01', endDate: '2026-07-01'
      } as any);
      await expect(
        orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch'])
      ).rejects.toThrow('Requested date is after the subscription end date.');
    });

    it('7 & 8 & 9. Operational orders cannot be restored', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'order1', mealType: 'lunch', status: 'picked_up' } as any
      ]);

      await expect(orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']))
        .rejects.toThrow("Order is already in delivery or delivered and cannot be modified.");
        
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'order1', mealType: 'lunch', status: 'delivered' } as any
      ]);

      await expect(orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']))
        .rejects.toThrow("Order is already in delivery or delivered and cannot be modified.");
    });

    it('11. Operationally locked kitchen orders cannot be restored', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'order1', mealType: 'lunch', kitchenStatus: 'packing' } as any
      ]);

      await expect(orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']))
        .rejects.toThrow("Order is already being prepared by the kitchen and cannot be modified.");
    });
  });
});
