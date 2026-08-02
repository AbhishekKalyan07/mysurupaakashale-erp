import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionService } from '../productionService';
import { orderRepository } from '../../firestore/orderRepository';
import { auditRepository } from '../../firestore/auditRepository';

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

describe('productionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Aggregation Methods', () => {
    const orders = [
      { id: 'o1', mealType: 'breakfast', status: 'preparing', source: 'subscription', planTier: 'basic', itemsLabel: 'Idli', customerId: 'c5' },
      { id: 'o2', mealType: 'lunch', status: 'ready_for_pickup', source: 'subscription', planTier: 'regular', itemsLabel: 'Meals', customerId: 'c2' },
      { id: 'o3', mealType: 'lunch', status: 'cancelled', source: 'one_time', itemsLabel: 'Biryani', customerId: 'c3' },
      { id: 'o4', mealType: 'dinner', status: 'scheduled', source: 'one_time', itemsLabel: 'Chapati', customerId: 'c4' },
      { id: 'o5', mealType: 'breakfast', status: 'out_for_delivery', source: 'subscription', planTier: 'basic', itemsLabel: 'Idli', zoneId: 'z1', customerId: 'c2' },
      { id: 'o6', mealType: 'breakfast', status: 'delivered', source: 'one_time', itemsLabel: 'Dose', zoneId: 'z2', deliveryPartnerId: 'p1', customerId: 'c1' },
    ] as any[];

    it('getProductionSummary calculates totals correctly ignoring cancelled', () => {
      const summary = ProductionService.getProductionSummary(orders);
      expect(summary).toEqual({ breakfast: 3, lunch: 1, dinner: 1, total: 5 });
    });

    it('getPlanSummary calculates plans correctly ignoring cancelled', () => {
      const summary = ProductionService.getPlanSummary(orders);
      expect(summary).toEqual({ basic: 2, regular: 1, oneTime: 2 }); // o3 is cancelled oneTime so not counted
    });

    it('getMealBreakdown calculates exact items per mealType', () => {
      const breakdown = ProductionService.getMealBreakdown(orders, 'breakfast');
      expect(breakdown).toEqual([
        { itemName: 'Idli', count: 2 },
        { itemName: 'Dose', count: 1 }
      ]);
    });

    it('getProductionProgress calculates progress correctly', () => {
      const progress = ProductionService.getProductionProgress(orders);
      // Total: 5 (ignoring o3)
      // preparing: 1 (o1)
      // ready: 1 (o2)
      // remaining: 5 - 1 - 1 = 3
      // completed: ready + out + delivered = 1(o2) + 1(o5) + 1(o6) = 3
      // percentage: (3/5)*100 = 60
      expect(progress).toEqual({ total: 5, preparing: 1, ready: 1, remaining: 3, completionPercentage: 60 });
    });

    it('getProductionProgress handles empty array', () => {
      expect(ProductionService.getProductionProgress([])).toEqual({ total: 0, preparing: 0, ready: 0, remaining: 0, completionPercentage: 0 });
    });

    it('getAreaPacking groups correctly', () => {
      const zoneMap = new Map([['z1', 'Zone 1'], ['z2', 'Zone 2']]);
      const packing = ProductionService.getAreaPacking(orders, zoneMap);
      
      expect(packing.length).toBe(3); // Unassigned, Zone 1, Zone 2
      expect(packing.find(p => p.areaName === 'Zone 1')).toEqual(
        expect.objectContaining({ breakfast: 1, basic: 1 })
      );
    });

    it('getPrintPackingSheet formats rows correctly', () => {
      const zoneMap = new Map([['z1', 'Zone 1']]);
      const partnerMap = new Map([['p1', 'Partner 1']]);
      const customerMap = new Map([['c1', 'Customer 1']]);
      
      const sheet = ProductionService.getPrintPackingSheet(orders, zoneMap, partnerMap, customerMap);
      expect(sheet.length).toBe(5);
      
      const o6Row = sheet.find(r => r.customerName === 'Customer 1');
      expect(o6Row).toEqual({
        area: 'z2', // z2 not in zoneMap, falls back to id
        customerName: 'Customer 1',
        meal: 'Dose',
        plan: 'One-Time',
        deliveryPartner: 'Partner 1'
      });
    });
  });

  describe('Lifecycle Methods', () => {
    const adminId = 'a1';

    describe('startPreparing', () => {
      it('throws if orderId missing', async () => {
        await expect(ProductionService.startPreparing('', adminId)).rejects.toThrow('Order ID is required.');
      });

      it('throws if order not found', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue(null);
        await expect(ProductionService.startPreparing('o1', adminId)).rejects.toThrow('Order o1 not found.');
      });

      it('returns early if already preparing (idempotency)', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'preparing' } as any);
        await ProductionService.startPreparing('o1', adminId);
        expect(orderRepository.update).not.toHaveBeenCalled();
      });

      it('throws if invalid transition', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup' } as any);
        await expect(ProductionService.startPreparing('o1', adminId)).rejects.toThrow('Cannot transition from ready_for_pickup to preparing.');
      });

      it('updates status and logs audit', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'scheduled' } as any);
        await ProductionService.startPreparing('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'preparing' });
        expect(auditRepository.logAction).toHaveBeenCalledWith('production_preparing', adminId, expect.any(String), 'o1', 'order', expect.any(Object));
      });
    });

    describe('markReady', () => {
      it('throws if orderId missing', async () => {
        await expect(ProductionService.markReady('', adminId)).rejects.toThrow('Order ID is required.');
      });

      it('throws if invalid transition', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'scheduled' } as any);
        await expect(ProductionService.markReady('o1', adminId)).rejects.toThrow('Cannot transition from scheduled to ready_for_pickup.');
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'preparing' } as any);
        await ProductionService.markReady('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'ready_for_pickup' });
      });
    });

    describe('lockProduction', () => {
      it('throws if orderId missing', async () => {
        await expect(ProductionService.lockProduction('', adminId)).rejects.toThrow('Order ID is required.');
      });

      it('throws if invalid transition', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'preparing' } as any);
        await expect(ProductionService.lockProduction('o1', adminId)).rejects.toThrow('Cannot transition from preparing to locked.');
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup' } as any);
        await ProductionService.lockProduction('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'locked' });
      });
    });

    describe('closeProduction', () => {
      it('throws if orderId missing', async () => {
        await expect(ProductionService.closeProduction('', adminId)).rejects.toThrow('Order ID is required.');
      });

      it('throws if invalid transition', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup' } as any);
        await expect(ProductionService.closeProduction('o1', adminId)).rejects.toThrow('Cannot transition from ready_for_pickup to closed.');
      });

      it('updates status', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'locked' } as any);
        await ProductionService.closeProduction('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'closed' });
      });
    });

    describe('reopenProduction', () => {
      it('throws if orderId missing', async () => {
        await expect(ProductionService.reopenProduction('', adminId)).rejects.toThrow('Order ID is required.');
      });

      it('throws if invalid transition', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'ready_for_pickup' } as any);
        await expect(ProductionService.reopenProduction('o1', adminId)).rejects.toThrow('Cannot transition from ready_for_pickup to reopened.');
      });

      it('updates status from closed', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'closed' } as any);
        await ProductionService.reopenProduction('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'reopened' });
      });

      it('updates status from locked', async () => {
        vi.mocked(orderRepository.getById).mockResolvedValue({ status: 'locked' } as any);
        await ProductionService.reopenProduction('o1', adminId);
        expect(orderRepository.update).toHaveBeenCalledWith('o1', { status: 'reopened' });
      });
    });
  });
});
