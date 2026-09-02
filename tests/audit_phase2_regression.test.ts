import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before any module that imports firebase.ts tries to call initializeFirestore
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    initializeFirestore: vi.fn(() => ({} as any)),
    collection: vi.fn((...args: any[]) => ({ _path: args })),
    query: vi.fn((coll: any, ...args: any[]) => ({ coll, args })),
    where: vi.fn((field: string, op: string, val: any) => ({ field, op, val })),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    orderBy: vi.fn(),
    doc: vi.fn(),
    setDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    onSnapshot: vi.fn(),
  };
});
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/shared/lib/date', () => ({
  getTodayInTimezone: vi.fn().mockReturnValue('2026-08-25')
}));

// Mock repositories before importing the targets
vi.mock('@/shared/services/firestore/userRepository', () => ({
  userRepository: {
    list: vi.fn(),
    getById: vi.fn(),
  }
}));

vi.mock('@/shared/services/firestore/deliveryZoneRepository', () => ({
  deliveryZoneRepository: {
    list: vi.fn().mockResolvedValue([])
  }
}));

// Mock react-query — capture queryFn/queryKey for customerProfiles
let lastQueryFn: any = null;
let lastQueryKey: any = null;
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: any) => {
    if (opts.queryKey && opts.queryKey.includes('customerProfiles')) {
      lastQueryFn = opts.queryFn;
      lastQueryKey = opts.queryKey;
    }
    return { data: new Map(), isLoading: false };
  }),
  useQueryClient: vi.fn(() => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  })),
}));

// Mock React hooks so they work outside a component context
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (fn: () => any) => fn(),
    useEffect: (fn: () => any) => { fn(); },
    useCallback: (fn: any) => fn,
  };
});

import { accountsRepository } from '@/shared/services/firestore/accountsRepository';
import { useReferenceData } from '@/shared/hooks/useReferenceData';
import { userRepository } from '@/shared/services/firestore/userRepository';

describe('Phase 2 Regression Tests', () => {

  describe('1. useReferenceData N+1 Fix', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      lastQueryFn = null;
      lastQueryKey = null;
    });

    it('should deduplicate IDs, batch requests, and stabilize cache key', async () => {
      const mockUsers = [
        { id: 'CUST-1', fullName: 'Alice' },
        { id: 'CUST-2', fullName: 'Bob' },
      ];
      vi.mocked(userRepository.list).mockResolvedValueOnce(mockUsers as any);

      // We pass duplicates and unsorted array
      const customerIds = ['CUST-2', 'CUST-1', 'CUST-2', 'CUST-1'];
      useReferenceData(customerIds);

      // Verify stable cache key
      expect(lastQueryKey).toEqual(['reference', 'customerProfiles', 'CUST-1', 'CUST-2']);
      
      const map = await lastQueryFn();
      expect(Object.keys(map).length).toBe(2);

      expect(userRepository.list).toHaveBeenCalledTimes(1); 
      
      const customerListCall = vi.mocked(userRepository.list).mock.calls[0];
      const queryStr = JSON.stringify(customerListCall);
      expect(queryStr).toContain('CUST-1');
      expect(queryStr).toContain('CUST-2');

      // Check if cache key is stable by calling again with a different order but same IDs
      useReferenceData(['CUST-1', 'CUST-2']);
      expect(lastQueryKey).toEqual(['reference', 'customerProfiles', 'CUST-1', 'CUST-2']);
    });

    it('should chunk requests when exceeding 30 IDs', async () => {
      const largeIdsList = Array.from({ length: 40 }, (_, i) => `CUST-${i}`);
      vi.mocked(userRepository.list).mockResolvedValue([] as any); // empty return is fine, just checking calls

      useReferenceData(largeIdsList);

      const map = await lastQueryFn();
      expect(Object.keys(map).length).toBe(40); // Will fallback to IDs

      const customerListCalls = vi.mocked(userRepository.list).mock.calls;
      expect(customerListCalls.length).toBe(2); // Two chunks (30 + 10)
    });

    it('should gracefully handle missing profiles by returning the raw ID', async () => {
      vi.mocked(userRepository.list).mockResolvedValueOnce([{ id: 'CUST-1', fullName: 'Alice' }] as any);
      
      useReferenceData(['CUST-1', 'CUST-MISSING']);
      
      const map = await lastQueryFn();
      expect(map['CUST-1']).toBe('Alice');
      expect(map['CUST-MISSING']).toBe('CUST-MISSING');
    });
  });

  describe('2. Accounts Timezone Boundaries & 3. CSV Report Generation', () => {
    it('generateMonthlyReport should strictly use Asia/Kolkata timezone boundaries', async () => {
      // Mock getInvoicesInRange
      const getInvoicesInRangeMock = vi.spyOn(accountsRepository, 'getInvoicesInRange');
      getInvoicesInRangeMock.mockResolvedValueOnce([]);

      await accountsRepository.generateMonthlyReport('2026-08');

      // Check the exact Date boundaries passed
      expect(getInvoicesInRangeMock).toHaveBeenCalledTimes(1);
      const [startBound, endBound] = getInvoicesInRangeMock.mock.calls[0] as [Date, Date];

      // In UTC, '2026-08-01T00:00:00+05:30' corresponds to '2026-07-31T18:30:00.000Z'
      expect(startBound.toISOString()).toBe('2026-07-31T18:30:00.000Z');
      
      // In UTC, '2026-08-31T23:59:59.999+05:30' corresponds to '2026-08-31T18:29:59.999Z'
      expect(endBound.toISOString()).toBe('2026-08-31T18:29:59.999Z');
    });

    it('generateMonthlyReport handles year transition (e.g. February bounds)', async () => {
      const getInvoicesInRangeMock = vi.spyOn(accountsRepository, 'getInvoicesInRange');
      getInvoicesInRangeMock.mockResolvedValueOnce([]);

      await accountsRepository.generateMonthlyReport('2027-02');

      const [startBound, endBound] = getInvoicesInRangeMock.mock.calls[0] as [Date, Date];
      
      // Feb 1st 2027 00:00 IST -> Jan 31st 2027 18:30 UTC
      expect(startBound.toISOString()).toBe('2027-01-31T18:30:00.000Z');
      // Feb 28th 2027 23:59:59.999 IST -> Feb 28th 2027 18:29:59.999 UTC
      expect(endBound.toISOString()).toBe('2027-02-28T18:29:59.999Z');
    });

    it('generateDailyReport should produce properly escaped CSV strings', async () => {
      const getOrdersInDateRangeMock = vi.spyOn(accountsRepository, 'getOrdersInDateRange');
      getOrdersInDateRangeMock.mockResolvedValueOnce([
        { id: 'ORD-1', customerId: 'CUST-1, Test', date: '2026-08-25', planTier: '"Premium"', mealType: 'lunch', status: 'delivered' }
      ] as any);

      const csvString = await accountsRepository.generateDailyReport('2026-08-25');
      
      // Must not be a data URI
      expect(csvString.startsWith('ID,Customer')).toBe(true);
      expect(csvString).not.toContain('data:text/csv');
      
      // Value with comma must be quoted: "CUST-1, Test"
      expect(csvString).toContain('"CUST-1, Test"');
      // Value with quote must be escaped: """Premium"""
      expect(csvString).toContain('"""Premium"""');
    });
  });

  describe('4. Dashboard KPI Failed Payments Date Filter', () => {
    it('useAdminDashboardMetrics filters failed payments by today using IST boundaries', async () => {
      const { useAdminDashboardMetrics } = await import('@/features/dashboard/hooks/useAdminDashboardMetrics');
      
      try {
        useAdminDashboardMetrics();
      } catch (e) {
        // Ignore React hook errors if any, we just want to execute the hook body to trigger onSnapshot
      }

      const firestoreMock = await import('firebase/firestore');
      const onSnapshotCalls = vi.mocked(firestoreMock.onSnapshot).mock.calls;

      const paymentQueryCall = onSnapshotCalls.find(call => {
        const q = call[0] as any;
        return q.args && q.args.some((a: any) => a.val === 'failed');
      });

      expect(paymentQueryCall).toBeDefined();
      
      const args = (paymentQueryCall![0] as any).args;
      
      const createdAtStart = args.find((a: any) => a.field === 'createdAt' && a.op === '>=');
      const createdAtEnd = args.find((a: any) => a.field === 'createdAt' && a.op === '<=');

      expect(createdAtStart).toBeDefined();
      expect(createdAtEnd).toBeDefined();

      const startT = createdAtStart.val.toDate();
      expect(startT.toISOString()).toBe('2026-08-24T18:30:00.000Z');
    });
  });

});
