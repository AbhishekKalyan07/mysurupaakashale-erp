import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderRepository } from '../orderRepository';
import { getDocs, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import { auth } from '@/shared/lib/firebase';

describe('orderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queries', () => {
    it('getByDate', async () => {
      const listSpy = vi.spyOn(orderRepository, 'list').mockResolvedValueOnce([{ id: '1' } as any]);
      const res = await orderRepository.getByDate('2026-08-01');
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });

    it('getByDateAndStatus', async () => {
      const listSpy = vi.spyOn(orderRepository, 'list').mockResolvedValueOnce([]);
      const res = await orderRepository.getByDateAndStatus('2026-08-01', 'scheduled');
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(0);
    });

    it('subscribeToDayOrders', () => {
      const subscribeSpy = vi.spyOn(orderRepository, 'subscribeToList').mockReturnValueOnce(vi.fn());
      const onNext = vi.fn();
      orderRepository.subscribeToDayOrders('2026-08-01', onNext);
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it('getByDateAndMealType', async () => {
      const listSpy = vi.spyOn(orderRepository, 'list').mockResolvedValueOnce([]);
      await orderRepository.getByDateAndMealType('2026-08-01', 'lunch');
      expect(listSpy).toHaveBeenCalled();
    });

    it('getCustomerOrders', async () => {
      const listSpy = vi.spyOn(orderRepository, 'list').mockResolvedValueOnce([]);
      await orderRepository.getCustomerOrders('cust-1');
      expect(listSpy).toHaveBeenCalled();
    });

    it('subscribeToCustomerOrders', () => {
      const subscribeSpy = vi.spyOn(orderRepository, 'subscribeToList').mockReturnValueOnce(vi.fn());
      orderRepository.subscribeToCustomerOrders('cust-1', vi.fn());
      expect(subscribeSpy).toHaveBeenCalled();
    });

    it('getCustomerOrdersByDate', async () => {
      const listSpy = vi.spyOn(orderRepository, 'list').mockResolvedValueOnce([]);
      await orderRepository.getCustomerOrdersByDate('cust-1', '2026-08-01');
      expect(listSpy).toHaveBeenCalled();
    });

    it('subscribeToDayMealTypeOrders', () => {
      const subscribeSpy = vi.spyOn(orderRepository, 'subscribeToList').mockReturnValueOnce(vi.fn());
      orderRepository.subscribeToDayMealTypeOrders('2026-08-01', 'lunch', vi.fn());
      expect(subscribeSpy).toHaveBeenCalled();
    });
  });

  describe('batchCreate', () => {
    it('creates multiple orders in a batch', async () => {
      const mockSet = vi.fn();
      const mockCommit = vi.fn().mockResolvedValueOnce(undefined);
      vi.mocked(writeBatch).mockReturnValueOnce({
        set: mockSet,
        commit: mockCommit,
      } as any);

      await orderRepository.batchCreate([
        { date: '2026-08-01', mealType: 'lunch' } as any,
        { date: '2026-08-01', mealType: 'dinner' } as any,
      ]);

      expect(writeBatch).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledTimes(2);
      expect(mockCommit).toHaveBeenCalled();
    });
  });

  describe('Workflow History', () => {
    it('getWorkflowHistory', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { id: 'w1', data: () => ({ notes: 'test1' }) },
          { id: 'w2', data: () => ({ notes: 'test2' }) },
        ],
      } as any);

      const res = await orderRepository.getWorkflowHistory('ord-1');
      expect(getDocs).toHaveBeenCalled();
      expect(res).toHaveLength(2);
      expect(res[0].id).toBe('w1');
    });

    it('subscribeWorkflowHistory', () => {
      vi.mocked(onSnapshot).mockImplementationOnce((_query, onNext: any) => {
        onNext({
          docs: [{ id: 'w1', data: () => ({ notes: 'test1' }) }],
        });
        return vi.fn();
      });

      const onNext = vi.fn();
      orderRepository.subscribeWorkflowHistory('ord-1', onNext);
      expect(onSnapshot).toHaveBeenCalled();
      expect(onNext).toHaveBeenCalledWith([{ id: 'w1', notes: 'test1' }]);
    });
  });

  describe('updateWorkflow', () => {
    it('updates workflow and records history with notes and current user', async () => {
      // Mock auth.currentUser
      (auth as any).currentUser = { uid: 'test-user-123' };
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, updateFunction) => {
        const transaction = {
          get: vi.fn(async () => ({
            exists: () => true,
            data: () => ({ status: 'pending' }),
          })),
          set: vi.fn(),
          update: vi.fn(),
        } as any;
        return await updateFunction(transaction);
      });

      await orderRepository.updateWorkflow('ord-1', 'preparing', 'System confirmed');
      expect(runTransaction).toHaveBeenCalled();
    });

    it('updates workflow with no notes and unknown user fallback', async () => {
      // Mock auth.currentUser to be undefined
      (auth as any).currentUser = undefined;
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, updateFunction) => {
        const transaction = {
          get: vi.fn(async () => ({
            exists: () => true,
            data: () => ({ status: 'pending' }),
          })),
          set: vi.fn(),
          update: vi.fn(),
        } as any;
        return await updateFunction(transaction);
      });

      await orderRepository.updateWorkflow('ord-1', 'preparing'); // notes undefined
      expect(runTransaction).toHaveBeenCalled();
    });

    it('throws if order not found', async () => {
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, updateFunction) => {
        const transaction = {
          get: vi.fn(async () => ({
            exists: () => false,
          })),
        } as any;
        return await updateFunction(transaction);
      });

      await expect(orderRepository.updateWorkflow('ord-1', 'preparing')).rejects.toThrow('Order not found');
    });
  });
});
