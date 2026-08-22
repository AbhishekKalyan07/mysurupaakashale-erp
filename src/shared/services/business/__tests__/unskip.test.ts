import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { orderRepository } from '../../firestore/orderRepository';

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
  db: {},
}));

describe('Unskip Meal Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      vi.setSystemTime(new Date('2026-08-01T12:00:00+05:30')); // 12 PM
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      // Try to unskip breakfast (cutoff was 5 AM)
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
    it('3. Existing skipped order is restored', async () => {
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

    it('4. Missing order is safely regenerated', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]); // No orders exist
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue({ id: 'sub1' } as any);
      vi.spyOn(orderService, 'generateOrdersForSubscription').mockResolvedValue(undefined);

      await orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']);

      expect(orderService.generateOrdersForSubscription).toHaveBeenCalledWith(
        { id: 'sub1' }, '2026-08-01', ['lunch']
      );
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

    it('11. Operational orders with kitchen locked status cannot be restored', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'order1', mealType: 'lunch', kitchenStatus: 'packing' } as any
      ]);

      await expect(orderService.restoreOrdersForUnskipDay('cust1', 'sub1', '2026-08-01', ['lunch']))
        .rejects.toThrow("Order is already being prepared by the kitchen and cannot be modified.");
    });
  });
});
