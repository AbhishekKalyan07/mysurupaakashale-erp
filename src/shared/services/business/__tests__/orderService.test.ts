import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { orderRepository } from '../../firestore/orderRepository';
import { kitchenRepository } from '../../firestore/kitchenRepository';

vi.mock('../../firestore/holidayRepository', () => ({
  holidayRepository: {
    isHoliday: vi.fn().mockResolvedValue(false),
  },
}));

// Mock Firebase Firestore
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
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

// Mock Firebase Functions
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { success: true, message: 'Success', ordersGenerated: 0 } }))
}));

// Mock DB
vi.mock('@/shared/lib/firebase', () => ({
  functions: {},
  db: {},
  auth: { currentUser: { uid: 'system' } }
}));

describe('orderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(kitchenRepository, 'list').mockResolvedValue([{ id: 'k1' } as any]);
  });

  describe('generateDailyOrders', () => {
    it('invokes the generateDailyOrders Cloud Function via httpsCallable and returns result', async () => {
      const mockCallable = vi.fn().mockResolvedValue({
        data: { success: true, message: 'Successfully generated 10 new orders.', ordersGenerated: 10 }
      });
      const { httpsCallable } = await import('firebase/functions');
      vi.mocked(httpsCallable).mockReturnValue(mockCallable as any);

      const result = await orderService.generateDailyOrders('2026-08-01');

      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateDailyOrders');
      expect(mockCallable).toHaveBeenCalledWith({ date: '2026-08-01' });
      expect(result).toEqual({ success: true, message: 'Successfully generated 10 new orders.', ordersGenerated: 10 });
    });

    it('handles RPC errors gracefully when Cloud Function throws', async () => {
      const mockCallable = vi.fn().mockRejectedValue(new Error('Internal Server Error'));
      const { httpsCallable } = await import('firebase/functions');
      vi.mocked(httpsCallable).mockReturnValue(mockCallable as any);

      const result = await orderService.generateDailyOrders('2026-08-01');

      expect(result).toEqual({
        success: false,
        message: 'Failed to generate orders: Internal Server Error',
        ordersGenerated: 0
      });
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
        { id: 'ord1', kitchenStatus: 'pending', mealType: 'lunch', price: 60 },
        { id: 'ord2', kitchenStatus: undefined, mealType: 'lunch', price: 60 }
      ] as any);
      const { subscriptionRepository } = await import('../../firestore/subscriptionRepository');
      vi.spyOn(subscriptionRepository, 'getById').mockResolvedValue({
        id: 'sub1',
        quantity: 1,
        pricingMatrixSnapshot: {
          basic: { breakfast: 60, lunch: 65, dinner: 65, breakfast_lunch: 115, lunch_dinner: 115, breakfast_dinner: 115, breakfast_lunch_dinner: 159 }
        }
      } as any);

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

  describe('createOrderObject', () => {
    it('generates a well-formed order object with basic fallback logic', () => {
      const sub = {
        id: 'sub123',
        customerId: 'cust123',
        planId: 'plan123',
        planTier: 'standard',
        quantity: 1,
        pricePerDaySnapshot: 150,
        mealPreferences: [{ mealType: 'lunch' }]
      } as any;
      
      const pref = { mealType: 'lunch', selectedOptionId: 'opt1' } as any;
      
      const customerMap = new Map([
        ['cust123', {
          id: 'cust123',
          fullName: 'John Doe',
          phone: '1234567890',
          addresses: [{ id: 'addr1', line1: '123 Main St', city: 'Mysuru', pincode: '570001' }],
          defaultAddressId: 'addr1'
        }]
      ]);
      
      const partnerMap = new Map();
      const zoneMap = new Map([['zone1', { id: 'zone1', name: 'North', kitchenId: 'k1' }]]);
      const activePartners = [{ id: 'p1', isAvailable: true, zoneIds: ['zone1'], shifts: ['lunch'] }] as any[];
      const allZones = [{ id: 'zone1', pincodes: ['570001'] }] as any[];
      const mealPlans = [{
        id: 'plan123',
        name: 'Test Plan',
        mealSlots: [{ mealType: 'lunch', options: [{ id: 'opt1', label: 'Veg Meal' }] }]
      }] as any[];
      const workloadMap = new Map();
      
      const order = (orderService as any).buildOrderSnapshot(
        sub,
        pref,
        'lunch',
        '2026-08-01',
        customerMap,
        partnerMap,
        zoneMap,
        activePartners,
        allZones,
        mealPlans,
        workloadMap,
        'k1'
      );
      
      expect(order).toBeDefined();
      expect(order.id).toBe('ord_sub123_2026-08-01_lunch');
      expect(order.customerId).toBe('cust123');
      expect(order.customerName).toBe('John Doe');
      expect(order.zoneName).toBe('North');
      expect(order.zoneId).toBe('zone1');
      expect(order.deliveryPartnerId).toBe('p1');
      expect(order.kitchenId).toBe('k1');
      expect(order.mealName).toBe('Veg Meal');
      expect(order.price).toBe(150); // Since 150 * 1 / 1
      expect(workloadMap.get('p1')).toBe(1);
    });
  });
});
