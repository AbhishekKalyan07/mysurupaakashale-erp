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
    mockTransactionRepository: { runTransaction: vi.fn() },
    mockCustomerRepository: { getById: vi.fn() },
    mockInvoiceRepository: { create: vi.fn() },
  };
});

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn().mockReturnValue(['app']),
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
      })),
      where: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] })
      })),
      get: vi.fn().mockResolvedValue({ docs: [] })
    })),
    runTransaction: mocks.mockRunTransaction
  })),
  FieldValue: {
    serverTimestamp: mocks.mockServerTimestamp
  }
}));

vi.mock('../../functions/src/repositories', () => ({
  subscriptionRepository: mocks.mockSubscriptionRepository,
  transactionRepository: mocks.mockTransactionRepository,
  customerRepository: mocks.mockCustomerRepository,
  invoiceRepository: mocks.mockInvoiceRepository,
  orderRepository: mocks.mockOrderRepository,
  paymentRepository: mocks.mockPaymentRepository,
}));

import { billingService } from '../../functions/src/billing';

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
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
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
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
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
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
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
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
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
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      // Mock that an invoice already exists for this cycle inside the txn
      txnMock = { get: vi.fn().mockResolvedValue({ id: 'some-id' }), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    await billingService.processSubscriptionEnd(dummySub, '2026-08-08', 'expired');

    expect(txnMock.set).not.toHaveBeenCalled();
    expect(txnMock.update).not.toHaveBeenCalled();
  });

  it('Scenario H: Overpayment results in negative balance', async () => {
    let txnMock: any;
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
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

  it('Scenario I: Billing for various meal combinations', async () => {
    let txnMock: any;
    mocks.mockTransactionRepository.runTransaction.mockImplementationOnce(async (callback: any) => {
      txnMock = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), update: vi.fn() };
      return callback(txnMock);
    });

    mocks.mockOrderRepository.getCustomerOrdersInRange.mockResolvedValue([
      { id: 'o1', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-01', mealType: 'breakfast', mealQuantity: 1 }, // 60
      { id: 'o2', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-02', mealType: 'dinner', mealQuantity: 1 }, // 65
      { id: 'o3', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-03', mealType: 'breakfast', mealQuantity: 1 },
      { id: 'o4', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-03', mealType: 'dinner', mealQuantity: 1 }, // 115
      { id: 'o5', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-04', mealType: 'breakfast', mealQuantity: 1 },
      { id: 'o6', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-04', mealType: 'lunch', mealQuantity: 1 }, // 115
      { id: 'o7', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-05', mealType: 'lunch', mealQuantity: 1 },
      { id: 'o8', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-05', mealType: 'dinner', mealQuantity: 1 }, // 115
      { id: 'o9', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-06', mealType: 'breakfast', mealQuantity: 1 },
      { id: 'o10', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-06', mealType: 'lunch', mealQuantity: 1 },
      { id: 'o11', subscriptionId: 'sub-1', status: 'delivered', date: '2026-08-06', mealType: 'dinner', mealQuantity: 1 }, // 159
    ]);
    mocks.mockPaymentRepository.getByCustomerId.mockResolvedValue([]);
    
    // Total should be: 60 + 65 + 115 + 115 + 115 + 159 = 629
    const customSub = { ...dummySub, pricingMatrixSnapshot: undefined };
    await billingService.processSubscriptionEnd(customSub, '2026-08-08', 'expired');
    
    const invoicePayload = txnMock.set.mock.calls[0][1];
    expect(invoicePayload.subtotal).toBe(629);
  });
});
