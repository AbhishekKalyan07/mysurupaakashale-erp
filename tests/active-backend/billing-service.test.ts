import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Subscription } from '@/shared/types';

const mocks = vi.hoisted(() => {
  return {
    mockWriteBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn(),
    })),
    mockRunTransaction: vi.fn(async (_db, callback) => {
      const txnMock = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
      };
      return callback(txnMock);
    }),
    mockGetDocs: vi.fn(),
    mockQuery: vi.fn(),
    mockWhere: vi.fn(),
    mockCollection: vi.fn(),
    mockDoc: vi.fn(),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    
    mockOrderRepository: { getCustomerOrdersInRange: vi.fn() },
    mockSubscriptionRepository: { list: vi.fn() },
    mockPaymentRepository: { getByCustomerId: vi.fn() },
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    runTransaction: mocks.mockRunTransaction,
    writeBatch: mocks.mockWriteBatch,
    getDocs: mocks.mockGetDocs,
    query: mocks.mockQuery,
    where: mocks.mockWhere,
    collection: mocks.mockCollection,
    doc: mocks.mockDoc,
    serverTimestamp: mocks.mockServerTimestamp,
  };
});
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mocks.mockOrderRepository }));
vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mocks.mockSubscriptionRepository }));
vi.mock('@/shared/services/firestore/paymentRepository', () => ({ paymentRepository: mocks.mockPaymentRepository }));

import { billingService } from '@/shared/services/business/billingService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Billing Settlement', () => {
  const dummySub: Subscription = {
    id: 'sub-1',
    customerId: 'cust-1',
    planId: 'plan-1',
    planTier: 'basic',
    quantity: 1,
    status: 'active',
    startDate: '2026-08-01',
    endDate: '2026-08-07',
    billingCycle: 'weekly',
    mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt-1' }],
    pricePerDaySnapshot: 65,
    pricingMatrixSnapshot: { lunch: 65 } as any,
    zoneId: 'z1',
    deliveryAddressId: 'addr1',
    latestPaymentId: null,
    depositAmount: 1000,
    autoRenew: false,
    createdAt: { toMillis: () => 0 } as any,
    updatedAt: { toMillis: () => 0 } as any
  };

  it('Scenario A: Normal subscription (Usage and Deposit remain separate)', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    // 2 days * 65 = 130 Usage
    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([
      { id: 'o1', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-01', mealType: 'lunch', mealQuantity: 1 },
      { id: 'o2', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-02', mealType: 'lunch', mealQuantity: 1 },
    ]);

    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([
      { id: 'p1', subscriptionId: 'sub-1', status: 'verified', amount: 50, purpose: 'usage' }, // usage payment
      { id: 'p2', subscriptionId: 'sub-1', status: 'verified', amount: 1000, purpose: 'security_deposit' }, // deposit
      { id: 'p3', subscriptionId: 'sub-1', status: 'verified', amount: 20 }, // legacy payment without purpose (treated as usage)
    ]);

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');

    expect(txnMock.set).toHaveBeenCalledTimes(1);
    const invoicePayload = txnMock.set.mock.calls[0][1];
    
    expect(invoicePayload.subtotal).toBe(130);
    expect(invoicePayload.lineItems[1].amount).toBe(-70); // 50 usage + 20 legacy
    expect(invoicePayload.totalAmount).toBe(60); // 130 - 70 = 60
    expect(invoicePayload.depositHeld).toBe(1000); // Excluded from usage!
  });

  it('Scenario B: Deposit only (Usage balance full, deposit held)', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([
      { id: 'o1', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-01', mealType: 'lunch', mealQuantity: 1 } // 65 Usage
    ]);

    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([
      { id: 'p1', subscriptionId: 'sub-1', status: 'verified', amount: 1000, purpose: 'security_deposit' },
    ]);

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');
    const invoicePayload = txnMock.set.mock.calls[0][1];
    
    expect(invoicePayload.subtotal).toBe(65);
    expect(invoicePayload.totalAmount).toBe(65);
    expect(invoicePayload.depositHeld).toBe(1000); 
  });

  it('Scenario C: Early cancellation (effectiveEndDate overrides original)', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    const cancelledSub = { ...dummySub, cancellationDate: '2026-08-04' };

    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([]);
    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([]);

    await billingService.processSubscriptionEnd(cancelledSub, '2026-08-05', 'cancelled');
    
    // Check what was queried
    expect(mocks.mockOrderRepository.getCustomerOrdersInRange).toHaveBeenCalledWith(
      'cust-1', '2026-08-01', '2026-08-04' // Uses cancellationDate as boundary!
    );

    const invoicePayload = txnMock.set.mock.calls[0][1];
    expect(invoicePayload.billingPeriodEnd).toBe('2026-08-04');
    expect(invoicePayload.id).toBe('inv_sub-1_2026-08-04');
  });

  it('Scenario D: Natural expiry', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });
    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([]);
    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([]);

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');
    
    const invoicePayload = txnMock.set.mock.calls[0][1];
    expect(invoicePayload.billingPeriodEnd).toBe('2026-08-07');
    expect(invoicePayload.id).toBe('inv_sub-1_2026-08-07');
  });

  it('Scenario E/F: Concurrent settlement is blocked (idempotency)', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      // Mock that an invoice already exists for this cycle inside the txn
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => true }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');

    expect(txnMock.set).not.toHaveBeenCalled();
    expect(txnMock.update).not.toHaveBeenCalled();
  });

  it('Scenario H: Overpayment results in negative balance', async () => {
    let txnMock: any;
    mocks.mockRunTransaction.mockImplementationOnce(async (db, callback) => {
      txnMock = { get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([
      { id: 'o1', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-01', mealType: 'lunch', mealQuantity: 1 } // 65
    ]);
    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([
      { id: 'p1', subscriptionId: 'sub-1', status: 'verified', amount: 100, purpose: 'usage' },
    ]);

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');
    
    const invoicePayload = txnMock.set.mock.calls[0][1];
    expect(invoicePayload.totalAmount).toBe(-35); // 65 - 100
    expect(invoicePayload.status).toBe('paid'); // Due to overpayment
  });
});
