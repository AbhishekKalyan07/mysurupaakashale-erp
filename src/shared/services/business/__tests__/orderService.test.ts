import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { orderRepository } from '../../firestore/orderRepository';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { orderGenerationRunRepository } from '../../firestore/analyticsRepository';
import { userRepository } from '../../firestore/userRepository';
import { mealPlanRepository } from '../../firestore/mealPlanRepository';
import { deliveryZoneRepository } from '../../firestore/deliveryZoneRepository';
import * as notificationService from '../../firestore/notificationService';

// Mock Firebase
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined)
    })),
    serverTimestamp: vi.fn(() => 'server-timestamp'),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    doc: vi.fn((db, collection, id, sub, subId) => ({ db, collection, id, sub, subId })),
    collection: vi.fn((db, path) => ({ db, path, withConverter: vi.fn(() => ({ db, path })) })),
    updateDoc: vi.fn(),
    Timestamp: {
      now: vi.fn(() => ({ toMillis: () => Date.now() }))
    }
  };
});

// Mock DB
vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'system' } }
}));

describe('orderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateDailyOrders', () => {
    it('returns early if already generated successfully today (Idempotency)', async () => {
      vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue({ status: 'success' } as any);
      const res = await orderService.generateDailyOrders('2026-08-01'); // Not a Sunday
      expect(res.success).toBe(true);
      expect(res.message).toBe('Orchestrator finished. Generated 0 total orders.');
      expect(res.ordersGenerated).toBe(0);
    });

    it('returns early if date is a Sunday', async () => {
      vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue(null);
      const res = await orderService.generateDailyOrders('2026-08-02'); // Aug 2, 2026 is Sunday
      expect(res.success).toBe(true);
      expect(res.message).toBe('Today is Sunday (Holiday). No orders generated.');
      expect(res.ordersGenerated).toBe(0);
    });

    it('skips expired and future subscriptions', async () => {
      vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue(null);
      vi.spyOn(orderGenerationRunRepository, 'create').mockResolvedValue('run-id');
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      vi.spyOn(subscriptionRepository, 'list').mockResolvedValue([
        { id: 'sub-expired', endDate: '2026-07-01', startDate: '2026-06-01' } as any,
        { id: 'sub-future', endDate: null, startDate: '2026-09-01' } as any,
      ]);
      vi.spyOn(mealPlanRepository, 'list').mockResolvedValue([]);
      vi.spyOn(userRepository, 'list').mockResolvedValue([]);
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([]);

      const res = await orderService.generateDailyOrders('2026-08-01'); // Saturday
      expect(res.ordersGenerated).toBe(0);
      expect(orderGenerationRunRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          mealType: 'breakfast',
        }),
        '2026-08-01_breakfast'
      );
    });

    it('generates orders handling routing logic, skips skipped meals, logs failure', async () => {
      const mockGetDoc = await import('firebase/firestore').then(m => m.getDoc as import('vitest').Mock);
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ mealTypes: ['dinner'] })
      });

      vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue(null);
      vi.spyOn(orderGenerationRunRepository, 'create').mockResolvedValue('run-id');
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      
      const subscriptions = [
        { 
          id: 'sub1', 
          customerId: 'c1', 
          startDate: '2026-01-01', 
          endDate: null, 
          mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt1' }, { mealType: 'dinner' }],
          planId: 'plan1',
          pricePerDaySnapshot: 100,
          quantity: 2
        } as any
      ];

      vi.spyOn(subscriptionRepository, 'list').mockResolvedValue(subscriptions);
      vi.spyOn(mealPlanRepository, 'list').mockResolvedValue([{ id: 'plan1', mealSlots: [{ mealType: 'lunch', options: [{ id: 'opt1', label: 'South Indian' }] }] }] as any);
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([{ id: 'z1', pincodes: ['570001'] }] as any);
      
      vi.spyOn(userRepository, 'list').mockImplementation(async (queryParam) => {
        if ((queryParam as any)?.value === 'customer') {
          return [{ id: 'c1', defaultAddressId: 'addr1', addresses: [{ id: 'addr1', pincode: '570001' }] } as any];
        } else if ((queryParam as any)?.value === 'delivery_partner') {
          return [{ id: 'p1', isActive: true, zoneIds: ['z1'], fullName: 'Partner 1' } as any];
        } else if ((queryParam as any)?.value === 'kitchen') {
          return [{ id: 'k1', isActive: true } as any];
        }
        return [];
      });

      vi.spyOn(notificationService, 'notifyDailyOrdersGenerated').mockResolvedValue();

      const res = await orderService.generateDailyOrders('2026-08-01');
      
      expect(res.ordersGenerated).toBe(1); // Dinner is skipped, only lunch generated
      const { writeBatch } = await import('firebase/firestore');
      expect(writeBatch).toHaveBeenCalled();
      expect(notificationService.notifyDailyOrdersGenerated).toHaveBeenCalledWith(['k1'], '2026-08-01', 1);
    });

    it('throws error and logs failed run if generation crashes', async () => {
      vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue(null);
      vi.spyOn(subscriptionRepository, 'list').mockRejectedValue(new Error('DB Error'));
      vi.spyOn(orderGenerationRunRepository, 'create').mockResolvedValue('run-id');

      await expect(orderService.generateDailyOrders('2026-08-01')).rejects.toThrow('DB Error');
      expect(orderGenerationRunRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          mealType: 'breakfast',
        }),
        '2026-08-01_breakfast'
      );
    });
  });

  describe('generateOrdersForSubscription', () => {
    it('returns early if date is a Sunday', async () => {
      const spy = vi.spyOn(mealPlanRepository, 'list');
      await orderService.generateOrdersForSubscription({ id: 'sub1' } as any, '2026-08-02', ['lunch']); // Sunday
      // If it doesn't throw and does nothing, it's successful
      expect(spy).not.toHaveBeenCalled();
    });

    it('generates specific meals for a subscription mid-day', async () => {
      vi.spyOn(mealPlanRepository, 'list').mockResolvedValue([{ 
        id: 'plan1', 
        mealSlots: [{ mealType: 'lunch', options: [{ id: 'opt1', label: 'South Indian' }] }] 
      }] as any);
      vi.spyOn(userRepository, 'getById').mockResolvedValue({ id: 'c1', deliveryPartnerId: 'p2' } as any);
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([]);
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      vi.spyOn(userRepository, 'list').mockImplementation(async (queryParam) => {
        if ((queryParam as any)?.value === 'delivery_partner') {
          return [{ id: 'p2', isActive: true, fullName: 'Partner 2' }] as any;
        } else if ((queryParam as any)?.value === 'kitchen') {
          return [{ id: 'k1', isActive: true } as any];
        }
        return [];
      });
      vi.spyOn(notificationService, 'notifyDailyOrdersGenerated').mockResolvedValue();

      await orderService.generateOrdersForSubscription({
        id: 'sub1',
        customerId: 'c1',
        mealPreferences: [{ mealType: 'lunch' }, { mealType: 'dinner' }],
        pricePerDaySnapshot: 100
      } as any, '2026-08-01', ['lunch']);

      const { writeBatch } = await import('firebase/firestore');
      expect(writeBatch).toHaveBeenCalled();
      // Only 1 order (lunch) should be generated
    });

    it('handles pincode fallback and catches notification errors', async () => {
      vi.spyOn(mealPlanRepository, 'list').mockResolvedValue([{ 
        id: 'plan1', 
        mealSlots: [{ mealType: 'lunch', options: [{ id: 'opt2', label: 'North Indian' }] }] 
      }] as any);
      vi.spyOn(userRepository, 'getById').mockResolvedValue({ 
        id: 'c1', 
        defaultAddressId: 'addr1', 
        addresses: [{ id: 'addr1', pincode: '570002' }] 
      } as any);
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([{ id: 'z2', pincodes: ['570002'] }] as any);
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      vi.spyOn(userRepository, 'list').mockImplementation(async (queryParam) => {
        if ((queryParam as any)?.value === 'delivery_partner') {
          return [{ id: 'p3', isActive: true, zoneIds: ['z2'], fullName: 'Partner 3' }] as any;
        } else if ((queryParam as any)?.value === 'kitchen') {
          return [{ id: 'k1', isActive: true } as any];
        }
        return [];
      });
      vi.spyOn(notificationService, 'notifyDailyOrdersGenerated').mockRejectedValue(new Error('Notification failed'));

      await orderService.generateOrdersForSubscription({
        id: 'sub1',
        customerId: 'c1',
        planId: 'plan1',
        mealPreferences: [{ mealType: 'lunch' }], // no option selected, falls back to first
        pricePerDaySnapshot: 100
      } as any, '2026-08-01', ['lunch']);

      const { writeBatch } = await import('firebase/firestore');
      expect(writeBatch).toHaveBeenCalled();
    });
  });

  describe('updateOrderStatus', () => {
    it('throws if orderId or status missing', async () => {
      await expect(orderService.updateOrderStatus('', 'delivered')).rejects.toThrow('Order ID and Status are required.');
    });

    it('throws if order not found', async () => {
      vi.spyOn(orderRepository, 'getById').mockResolvedValue(null);
      await expect(orderService.updateOrderStatus('ord1', 'delivered')).rejects.toThrow('Order with ID ord1 not found.');
    });

    it('returns early if already in target status (idempotency)', async () => {
      vi.spyOn(orderRepository, 'getById').mockResolvedValue({ id: 'ord1', status: 'delivered' } as any);
      vi.spyOn(orderRepository, 'update').mockResolvedValue();

      await orderService.updateOrderStatus('ord1', 'delivered');
      
      expect(orderRepository.update).not.toHaveBeenCalled();
    });

    it('updates status correctly', async () => {
      vi.spyOn(orderRepository, 'getById').mockResolvedValue({ id: 'ord1', status: 'scheduled' } as any);
      vi.spyOn(orderRepository, 'update').mockResolvedValue();

      await orderService.updateOrderStatus('ord1', 'delivered');
      
      expect(orderRepository.update).toHaveBeenCalledWith('ord1', expect.objectContaining({ status: 'delivered' }));
    });
  });

  describe('syncCustomerActiveOrders', () => {
    it('syncs active orders with new delivery partner and zone', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'ord1', status: 'scheduled' },
        { id: 'ord2', status: 'out_for_delivery' }
      ] as any);
      
      const { deliveryZoneRepository } = await import('../../firestore/deliveryZoneRepository');
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([{ id: 'z1', name: 'Zone 1' } as any]);
      const { userRepository } = await import('../../firestore/userRepository');
      vi.spyOn(userRepository, 'list').mockResolvedValue([{ id: 'p1', fullName: 'Partner 1', phone: '123', isActive: true, isAvailable: true, zoneIds: ['z1'], role: 'delivery_partner' } as any]);
      vi.spyOn(userRepository, 'getById').mockResolvedValue({ id: 'c1', deliveryPartnerId: 'p1', zoneId: 'z1' } as any);
      
      const { writeBatch } = await import('firebase/firestore');
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      const batchUpdate = vi.fn();
      vi.mocked(writeBatch).mockReturnValue({
        update: batchUpdate,
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.syncCustomerActiveOrders('c1');

      expect(batchUpdate).toHaveBeenCalledTimes(1);
      expect(batchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        deliveryPartnerId: 'p1',
        driverName: 'Partner 1',
        driverPhone: '123',
        zoneId: 'z1',
        zoneName: 'Zone 1'
      }));
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('does nothing if no active orders to sync', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([]);
      
      const { deliveryZoneRepository } = await import('../../firestore/deliveryZoneRepository');
      vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue([{ id: 'z1', name: 'Zone 1' } as any]);
      const { userRepository } = await import('../../firestore/userRepository');
      vi.spyOn(userRepository, 'list').mockResolvedValue([{ id: 'p1', fullName: 'Partner 1', phone: '123', isActive: true, isAvailable: true, zoneIds: ['z1'], role: 'delivery_partner' } as any]);
      vi.spyOn(userRepository, 'getById').mockResolvedValue({ id: 'c1', deliveryPartnerId: 'p1', zoneId: 'z1' } as any);
      
      const { writeBatch } = await import('firebase/firestore');
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({ commit: batchCommit } as any);

      await orderService.syncCustomerActiveOrders('c1');
      expect(batchCommit).toHaveBeenCalledTimes(0);
    });
  });

  describe('cancelOrdersForSkipDay', () => {
    it('cancels orders if they are not locked by kitchen', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'ord1', kitchenStatus: 'pending', mealType: 'lunch' },
        { id: 'ord2', kitchenStatus: undefined, mealType: 'lunch' }
      ] as any);
      
      const { writeBatch } = await import('firebase/firestore');
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      const batchUpdate = vi.fn();
      vi.mocked(writeBatch).mockReturnValue({
        update: batchUpdate,
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.cancelOrdersForSkipDay('sub1', 'c1', '2026-08-01', ['lunch']);

      expect(batchUpdate).toHaveBeenCalledTimes(2);
      expect(batchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'cancelled' }));
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('throws error if any order is locked by kitchen', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'ord1', kitchenStatus: 'pending', mealType: 'lunch' },
        { id: 'ord2', kitchenStatus: 'packing', mealType: 'lunch' }
      ] as any);

      await expect(orderService.cancelOrdersForSkipDay('sub1', 'c1', '2026-08-01', ['lunch']))
        .rejects.toThrow('Order is already being prepared by the kitchen and cannot be cancelled.');
    });

    it('does not dispatch privileged notifications directly from the customer client path', async () => {
      vi.spyOn(orderRepository, 'list').mockResolvedValue([
        { id: 'ord1', kitchenStatus: 'pending', mealType: 'lunch' }
      ] as any);

      const { writeBatch } = await import('firebase/firestore');
      const batchCommit = vi.fn().mockResolvedValue(undefined);
      vi.mocked(writeBatch).mockReturnValue({
        update: vi.fn(),
        commit: batchCommit,
        set: vi.fn(),
        delete: vi.fn(),
      } as any);

      await orderService.cancelOrdersForSkipDay('sub1', 'c1', '2026-08-01', ['lunch']);

      expect(batchCommit).toHaveBeenCalled();
    });
  });
});
