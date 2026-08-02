import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliveryService } from '../deliveryService';
import { orderRepository } from '../../firestore/orderRepository';
import { auditRepository } from '../../firestore/auditRepository';
import type { Order } from '@/shared/types';

vi.mock('../../firestore/orderRepository', () => ({
  orderRepository: {
    getById: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('../../firestore/auditRepository', () => ({
  auditRepository: {
    logAction: vi.fn()
  }
}));

describe('deliveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Aggregation Methods', () => {
    const orders: Order[] = [
      { id: 'o1', status: 'ready_for_pickup', deliveryPartnerId: 'd1', zoneId: 'z1' },
      { id: 'o2', status: 'picked_up', deliveryPartnerId: 'd1', zoneId: 'z1' },
      { id: 'o3', status: 'out_for_delivery', deliveryPartnerId: 'd2', zoneId: 'z2', routeSequence: 2 },
      { id: 'o4', status: 'delivered', deliveryPartnerId: 'd2', zoneId: 'z2', routeSequence: 1 },
      { id: 'o5', status: 'failed_delivery', deliveryPartnerId: 'd1', zoneId: 'z3' },
      { id: 'o6', status: 'returned_delivery', deliveryPartnerId: 'd2', zoneId: 'z3' },
      { id: 'o7', status: 'cancelled', deliveryPartnerId: 'd1' }, // ignored
      { id: 'o8', status: 'scheduled' }, // no delivery partner, unassigned
    ] as any[];

    it('getDeliverySummary calculates totals correctly', () => {
      const summary = deliveryService.getDeliverySummary(orders);
      expect(summary).toEqual({
        assigned: 6,
        pickedUp: 1,
        outForDelivery: 1,
        delivered: 1,
        failed: 1,
        returned: 1,
        remaining: 6 - 1 - 1 - 1, // assigned - delivered - failed - returned = 3
        completionPercentage: 50 // (1+1+1)/6 * 100
      });
    });

    it('getDeliverySummary handles empty arrays', () => {
      const summary = deliveryService.getDeliverySummary([]);
      expect(summary).toEqual({
        assigned: 0, pickedUp: 0, outForDelivery: 0, delivered: 0,
        failed: 0, returned: 0, remaining: 0, completionPercentage: 0
      });
    });

    it('getAreaDeliveryGroups groups by Partner -> Area -> Orders', () => {
      const partnerMap = new Map([['d1', 'Driver 1'], ['d2', 'Driver 2']]);
      const zoneMap = new Map([['z1', 'Zone 1'], ['z2', 'Zone 2'], ['z3', 'Zone 3']]);

      const groups = deliveryService.getAreaDeliveryGroups(orders, partnerMap, zoneMap);
      
      expect(groups.length).toBe(2);
      const driver1 = groups.find(g => g.partnerName === 'Driver 1')!;
      expect(driver1.areas.length).toBe(2); // Zone 1, Zone 3
      expect(driver1.areas.find(a => a.areaName === 'Zone 1')!.orders.length).toBe(2);
      
      const driver2 = groups.find(g => g.partnerName === 'Driver 2')!;
      const zone2 = driver2.areas.find(a => a.areaName === 'Zone 2')!;
      
      // Checking routeSequence sorting
      expect(zone2.orders[0].id).toBe('o4'); // routeSequence: 1
      expect(zone2.orders[1].id).toBe('o3'); // routeSequence: 2
    });
  });

  describe('Lifecycle Methods', () => {
    const adminId = 'a1';
    const driverId = 'd1';

    describe('assignDriver', () => {
      it('throws if missing args', async () => {
        await expect(deliveryService.assignDriver('', 'd1', adminId)).rejects.toThrow('Order ID and Driver ID are required.');
      });

      it('throws if order not found', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue(null);
        await expect(deliveryService.assignDriver('o1', 'd1', adminId)).rejects.toThrow('Order o1 not found.');
      });

      it('returns early if driver is already assigned (idempotency)', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ id: 'o1', deliveryPartnerId: 'd1' } as any);
        await deliveryService.assignDriver('o1', 'd1', adminId);
        expect(orderRepository.update).not.toHaveBeenCalled();
      });

      it('assigns driver and logs audit', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ id: 'o1', deliveryPartnerId: 'd0' } as any);
        await deliveryService.assignDriver('o1', 'd1', adminId);
        
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { deliveryPartnerId: 'd1' });
        expect(auditRepository.logAction).toHaveBeenCalledWith('driver_assigned', adminId, 'Admin', 'o1', 'order', expect.any(Object));
      });
    });

    describe('markPickedUp', () => {
      it('throws if missing args', async () => {
        await expect(deliveryService.markPickedUp('', driverId)).rejects.toThrow('Order ID and Driver ID are required.');
      });

      it('throws if driver mismatch', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup', deliveryPartnerId: 'd2' } as any);
        await expect(deliveryService.markPickedUp('o1', driverId)).rejects.toThrow('Cannot update order assigned to another driver.');
      });

      it('throws if invalid status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'scheduled', deliveryPartnerId: driverId } as any);
        await expect(deliveryService.markPickedUp('o1', driverId)).rejects.toThrow('Cannot transition from scheduled to picked_up.');
      });

      it('returns early if already picked up (idempotency)', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'picked_up', deliveryPartnerId: driverId } as any);
        await deliveryService.markPickedUp('o1', driverId);
        expect(orderRepository.update).not.toHaveBeenCalled();
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup', deliveryPartnerId: driverId } as any);
        await deliveryService.markPickedUp('o1', driverId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'picked_up' });
      });
    });

    describe('startDelivery', () => {
      it('throws if invalid status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup', deliveryPartnerId: driverId } as any);
        await expect(deliveryService.startDelivery('o1', driverId)).rejects.toThrow('Cannot transition from ready_for_pickup to out_for_delivery.');
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'picked_up', deliveryPartnerId: driverId } as any);
        await deliveryService.startDelivery('o1', driverId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'out_for_delivery' });
      });
    });

    describe('markDelivered', () => {
      it('throws if invalid status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'picked_up', deliveryPartnerId: driverId } as any);
        await expect(deliveryService.markDelivered('o1', driverId)).rejects.toThrow('Cannot transition from picked_up to delivered.');
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'out_for_delivery', deliveryPartnerId: driverId } as any);
        await deliveryService.markDelivered('o1', driverId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'delivered' });
      });
    });

    describe('markFailed', () => {
      it('updates status with failure reason', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'out_for_delivery', deliveryPartnerId: driverId } as any);
        await deliveryService.markFailed('o1', driverId, 'Customer not available');
        expect(orderRepository.update).toHaveBeenCalledWith('o1', expect.objectContaining({ status: 'failed_delivery', failureReason: 'Customer not available' }));
      });
    });

    describe('markReturned', () => {
      it('updates status from failed_delivery', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'failed_delivery', deliveryPartnerId: driverId } as any);
        await deliveryService.markReturned('o1', driverId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'returned_delivery' });
      });
    });
  });
});
