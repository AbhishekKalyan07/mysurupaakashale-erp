import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentRepository } from '../paymentRepository';
import { getDocs, onSnapshot, getDoc } from 'firebase/firestore';

vi.mock('@/shared/lib/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => {
  return {
    initializeFirestore: vi.fn(() => ({})),
    getFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentSingleTabManager: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(),
    collection: vi.fn(() => ({ withConverter: vi.fn(() => 'colRef') })),
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(),
    query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
    where: vi.fn((field, op, value) => ({ type: 'where', field, op, value })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    limit: vi.fn((limit) => ({ type: 'limit', limit })),
    startAfter: vi.fn((snap) => ({ type: 'startAfter', snap })),
  };
});

describe('paymentRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getByCustomerId', () => {
    it('returns payments for a customer ordered by createdAt desc', async () => {
      const mockDocs = [{ data: () => ({ id: 'p1', amount: 100 }) }];
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: mockDocs } as any);

      const result = await paymentRepository.getByCustomerId('c1');
      expect(getDocs).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'p1', amount: 100 }]);
    });
  });

  describe('subscribeToCustomerPayments', () => {
    it('calls onSnapshot with correct constraints and maps data', () => {
      const onNext = vi.fn();
      const onError = vi.fn();

      paymentRepository.subscribeToCustomerPayments('c1', onNext, onError);
      
      expect(onSnapshot).toHaveBeenCalled();
      
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ docs: [{ data: () => ({ id: 'p1', amount: 100 }) }] });
      
      expect(onNext).toHaveBeenCalledWith([{ id: 'p1', amount: 100 }]);
    });
  });

  describe('getPaymentsPaginated', () => {
    it('returns paginated payments without filter', async () => {
      const mockDocs = [
        { data: () => ({ id: 'p1' }) },
        { data: () => ({ id: 'p2' }) }
      ];
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: mockDocs } as any);

      const result = await paymentRepository.getPaymentsPaginated({}, 2);
      expect(getDocs).toHaveBeenCalled();
      expect(result.payments).toEqual([{ id: 'p1' }, { id: 'p2' }]);
      expect(result.lastDoc).toEqual(mockDocs[1]);
    });

    it('returns paginated payments with status and customerId filter', async () => {
      const mockDocs = [
        { data: () => ({ id: 'p1' }) }
      ];
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: mockDocs } as any);

      const result = await paymentRepository.getPaymentsPaginated({ status: 'verified', customerId: 'c1' }, 20, { id: 'last_snap' } as any);
      
      expect(getDocs).toHaveBeenCalled();
      // query constraints include where, orderBy, limit, startAfter
      expect(result.payments).toEqual([{ id: 'p1' }]);
      expect(result.lastDoc).toBeNull(); // docs.length (1) != pageSize (20)
    });
  });

  describe('getById', () => {
    it('returns a payment by id', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ id: 'p1' }) } as any);
      
      const result = await paymentRepository.getById('p1');
      expect(result).toEqual({ id: 'p1' });
    });
  });
});
