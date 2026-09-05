import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as repositories from '../repositories';
import * as adminFirestore from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
    }
  };
});

vi.mock('firebase-functions/logger', () => {
  return {
    warn: vi.fn(),
    info: vi.fn()
  };
});

describe('repositories.ts', () => {
  let mockDb: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDoc = {
      get: vi.fn().mockResolvedValue({ exists: true, id: 'doc1', data: () => ({ name: 'test' }) }),
      update: vi.fn(),
      set: vi.fn()
    };

    mockQuery = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [
          { id: 'doc1', data: () => ({ name: 'test' }) }
        ]
      })
    };

    mockCollection = {
      doc: vi.fn(() => mockDoc),
      where: vi.fn(() => mockQuery),
      add: vi.fn().mockResolvedValue({ id: 'new-id' })
    };

    mockDb = {
      collection: vi.fn(() => mockCollection),
      runTransaction: vi.fn(),
      doc: vi.fn()
    };

    (adminFirestore.getFirestore as any).mockReturnValue(mockDb);
  });

  describe('createRepo', () => {
    it('getById returns mapped data if doc exists', async () => {
      const result = await repositories.userRepository.getById('doc1');
      expect(result).toEqual({ id: 'doc1', name: 'test' });
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.doc).toHaveBeenCalledWith('doc1');
    });

    it('getById returns null if doc does not exist', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });
      const result = await repositories.userRepository.getById('notfound');
      expect(result).toBeNull();
    });

    it('list applies constraints and returns docs', async () => {
      const result = await repositories.userRepository.list(
        { field: 'f1', op: '==', val: 'v1' },
        { field: 'f2', op: '==', val: 'v2' }
      );
      // It loops over constraints and returns q
      expect(result).toEqual([{ id: 'doc1', name: 'test' }]);
      // Wait, our mock for where() just returns `mockQuery` which is itself, so it's chaining
      // Because where is called on mockCollection which is not mockQuery, wait, our mockCollection.where returns mockQuery
      // and mockQuery.where returns mockQuery
    });

    it('update sets data with server timestamp', async () => {
      await repositories.userRepository.update('doc1', { foo: 'bar' });
      expect(mockDoc.update).toHaveBeenCalledWith({
        foo: 'bar',
        updatedAt: 'SERVER_TIMESTAMP'
      });
    });

    it('create sets data with id', async () => {
      const id = await repositories.userRepository.create({ foo: 'bar' }, 'my-id');
      expect(id).toBe('my-id');
      expect(mockDoc.set).toHaveBeenCalledWith({
        foo: 'bar',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP'
      });
    });

    it('create adds data without id', async () => {
      const id = await repositories.userRepository.create({ foo: 'bar' });
      expect(id).toBe('new-id');
      expect(mockCollection.add).toHaveBeenCalledWith({
        foo: 'bar',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP'
      });
    });
  });

  describe('custom repositories', () => {
    it('orderRepository.getCustomerOrdersInRange', async () => {
      const result = await repositories.orderRepository.getCustomerOrdersInRange('c1', '2026-09-01', '2026-09-30');
      expect(mockDb.collection).toHaveBeenCalledWith('orders');
      expect(mockCollection.where).toHaveBeenCalledWith('customerId', '==', 'c1');
      expect(result).toEqual([{ id: 'doc1', name: 'test' }]);
    });

    it('paymentRepository.getByCustomerId', async () => {
      const result = await repositories.paymentRepository.getByCustomerId('c1');
      expect(mockDb.collection).toHaveBeenCalledWith('payments');
      expect(result).toEqual([{ id: 'doc1', name: 'test' }]);
    });

    it('holidayRepository.isHoliday returns true when not empty', async () => {
      const result = await repositories.holidayRepository.isHoliday('2026-10-02');
      expect(result).toBe(true);
    });

    it('holidayRepository.isHoliday returns false when empty', async () => {
      mockQuery.get.mockResolvedValueOnce({ empty: true });
      const result = await repositories.holidayRepository.isHoliday('2026-10-02');
      expect(result).toBe(false);
    });

    it('auditRepository.logAction adds log', async () => {
      await repositories.auditRepository.logAction('A', 'EID', 'ETYPE', 'PBY', 'PROLE', { d: 1 });
      expect(mockCollection.add).toHaveBeenCalledWith({
        action: 'A',
        entityId: 'EID',
        entityType: 'ETYPE',
        performedBy: 'PBY',
        performedByRole: 'PROLE',
        details: { d: 1 },
        timestamp: 'SERVER_TIMESTAMP'
      });
    });

    it('failureQueueRepository.logFailure adds log', async () => {
      await repositories.failureQueueRepository.logFailure('c1', 's1', 'B', '2026', 'reason');
      expect(mockCollection.add).toHaveBeenCalledWith({
        customerId: 'c1',
        subscriptionId: 's1',
        mealType: 'B',
        date: '2026',
        reason: 'reason',
        stack: undefined,
        status: 'pending',
        createdAt: 'SERVER_TIMESTAMP'
      });
    });

    it('transactionRepository.runTransaction executes callback', async () => {
      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const t = {
          get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
          set: vi.fn()
        };
        await cb(t);
      });

      await repositories.transactionRepository.runTransaction(async (txn) => {
        const doc = await txn.get({ path: 'a/b' });
        txn.set({ path: 'a/b' }, { foo: 'bar' });
        expect(doc).toEqual({});
      });
      // also test false
      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        const t = {
          get: vi.fn().mockResolvedValue({ exists: false }),
          set: vi.fn()
        };
        await cb(t);
      });
      await repositories.transactionRepository.runTransaction(async (txn) => {
        const doc = await txn.get({ path: 'a/b' });
        expect(doc).toBeNull();
      });
    });

    it('notificationService', async () => {
      await repositories.notificationService.notifyAdminAlert([], 't', 'm');
      expect(logger.warn).toHaveBeenCalledWith('[Admin Alert] t: m');

      await repositories.notificationService.notifyOrderGeneratedCustomer('c', 'o', 'm', 'd');
      expect(logger.info).toHaveBeenCalledWith('Customer notification: order o generated.');

      await repositories.notificationService.notifyOrderGeneratedDriver('d', 'o', 'm');
      expect(logger.info).toHaveBeenCalledWith('Driver notification: order o generated.');

      await repositories.notificationService.notifyDailyOrdersGenerated([], 'd', 5);
      expect(logger.info).toHaveBeenCalledWith('Admin notification: 5 daily orders generated for d.');
    });
  });
});
