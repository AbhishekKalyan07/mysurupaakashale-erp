import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminDashboardMetrics } from '../useAdminDashboardMetrics';

vi.mock('react', () => ({
  useEffect: vi.fn((cb) => {
    const cleanup = cb();
    if (typeof cleanup === 'function') cleanup();
  }),
  useMemo: vi.fn((cb) => cb()),
}));

vi.mock('@tanstack/react-query', () => {
  let queryData: any = {};
  return {
    useQueryClient: vi.fn(() => ({
      setQueryData: vi.fn((_key, updateFn) => {
        if (typeof updateFn === 'function') {
           queryData = updateFn(queryData);
        } else {
           queryData = updateFn;
        }
      }),
    })),
    useQuery: vi.fn((options: any) => {
      if (options.queryFn) {
        // simulate a call
        options.queryFn();
      }
      return { data: queryData, isLoading: false };
    })
  };
});

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn(),
    where: vi.fn(),
    query: vi.fn(),
    onSnapshot: vi.fn((_q, cb) => {
      // simulate snapshot
      cb({
        size: 1,
        forEach: (fn: any) => {
          fn({
            data: () => ({ role: 'customer' })
          });
          fn({
            data: () => ({
              status: 'delivered',
              kitchenStatus: 'ready_for_pickup',
              price: 150,
              outForDeliveryAt: { toMillis: () => 1000 },
              deliveredAt: { toMillis: () => 61000 }, // 1 min diff
            })
          });
        },
        docs: [
          { data: () => ({ id: 'genRun1' }) }
        ]
      });
      return vi.fn();
    }),
    Timestamp: {
      fromDate: vi.fn(() => 'MOCK_TIMESTAMP'),
    }
  };
});

vi.mock('@/shared/lib/firebase', () => ({
  db: {}
}));

vi.mock('@/shared/lib/date', () => ({
  getTodayInTimezone: vi.fn(() => '2026-09-04')
}));

describe('useAdminDashboardMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs without throwing and computes basic metrics', () => {
    const res = useAdminDashboardMetrics();
    expect(res).toBeDefined();
    // In our mocked setup, we expect the metrics to be updated directly
    expect(res.data?.totalCustomers).toBe(1);
    expect(res.data?.todayOrders.total).toBe(1);
    expect(res.data?.revenueToday).toBe(150);
  });
});
