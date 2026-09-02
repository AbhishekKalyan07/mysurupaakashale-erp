import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';


vi.mock('@/shared/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    runTransaction: vi.fn(async (_db, cb) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn(),
        update: vi.fn()
      };
      await cb(txn);
      return txn;
    }),
    doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
    serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
  };
});

vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({
  subscriptionRepository: {
    list: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/shared/services/firestore/orderRepository', () => ({
  orderRepository: {
    list: vi.fn(),
    getCustomerOrdersInRange: vi.fn(),
  },
}));

vi.mock('@/shared/services/firestore/paymentRepository', () => ({
  paymentRepository: {
    getByCustomerId: vi.fn().mockResolvedValue([]),
  },
}));

import { billingService } from '../billingService';

describe('billingService.processDailyBilling - Pricing Matrix Snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses pricingMatrixSnapshot when present on subscription', async () => {
    const mockSub = {
      id: 'sub1',
      customerId: 'cust1',
      planTier: 'regular',
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      quantity: 1,
      pricingMatrixSnapshot: {
        breakfast: 50,
        lunch: 70,
        dinner: 70,
        breakfast_lunch: 110,
        lunch_dinner: 110,
        breakfast_dinner: 110,
        breakfast_lunch_dinner: 160,
      },
    };

    const mockOrders = [
      { id: 'ord1', subscriptionId: 'sub1', status: 'delivered', date: '2026-07-15', mealType: 'lunch' },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(mockOrders as any);

    const { runTransaction } = await import('firebase/firestore');
    vi.mocked(runTransaction).mockClear();

    const result = await billingService.processDailyBilling('2026-08-01');

    expect(result.processed).toBe(1);
    
    // Check what was set in the transaction
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses snapshot price 70 instead of regular live matrix price 85
    expect(setPayload.totalAmount).toBe(70);
  });

  it('falls back to live static PRICING_MATRIX when pricingMatrixSnapshot is undefined', async () => {
    const mockSub = {
      id: 'sub2',
      customerId: 'cust2',
      planTier: 'regular',
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      quantity: 1,
    };

    const mockOrders = [
      { id: 'ord2', subscriptionId: 'sub2', status: 'delivered', date: '2026-07-15', mealType: 'lunch' },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(mockOrders as any);

    const { runTransaction } = await import('firebase/firestore');
    vi.mocked(runTransaction).mockClear();

    const result = await billingService.processDailyBilling('2026-08-01');

    expect(result.processed).toBe(1);
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses live price 85
    expect(setPayload.totalAmount).toBe(85);
  });
});
