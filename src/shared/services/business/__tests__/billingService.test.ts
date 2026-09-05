import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscriptionRepository } from '@/shared/services/firestore/subscriptionRepository';
import { orderRepository } from '@/shared/services/firestore/orderRepository';


vi.mock('@/shared/lib/firebase', () => ({
  functions: {},

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

    await billingService.processSubscriptionEnd(mockSub as any, '2026-08-01');
    
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

    await billingService.processSubscriptionEnd(mockSub as any, '2026-08-01');
    
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

    await billingService.processSubscriptionEnd(mockSub as any, '2026-08-01');
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.set).toHaveBeenCalled();
    const setPayload = mockTxn.set.mock.calls[0][1] as any;
    // Uses live price 85
    expect(setPayload.totalAmount).toBe(85);
  });

  it('auto-renews subscription when autoRenew is true', async () => {
    const mockSub = {
      id: 'sub3',
      customerId: 'cust3',
      planTier: 'regular',
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      quantity: 1,
      autoRenew: true,
      billingCycle: 'monthly',
    };

    const mockOrders = [
      { id: 'ord3', subscriptionId: 'sub3', status: 'delivered', date: '2026-07-15', mealType: 'dinner' },
    ];

    vi.mocked(subscriptionRepository.list).mockResolvedValue([mockSub as any]);
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValue(mockOrders as any);

    const { runTransaction } = await import('firebase/firestore');
    vi.mocked(runTransaction).mockClear();

    await billingService.processSubscriptionEnd(mockSub as any, '2026-08-01');
    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    
    // Should update the subscription
    expect(mockTxn.update).toHaveBeenCalled();
    const updatePayload = mockTxn.update.mock.calls[0][1] as any;
    expect(updatePayload.status).toBe('active');
    expect(updatePayload.startDate).toBeDefined();
    expect(updatePayload.endDate).toBeDefined();
  });
});
