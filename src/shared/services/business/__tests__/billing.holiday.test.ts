/**
 * billing.holiday.test.ts
 *
 * Verifies that holiday-cancelled orders do not contribute to billing.
 * 
 * Key accounting assertion:
 *   - Orders with status === 'cancelled' are already excluded from
 *     billableOrders in billingService.processSubscriptionEnd() via:
 *       const terminalStatuses = ['scheduled', 'skipped', 'cancelled', ...]
 *     This test verifies that assertion holds for holiday-cancelled orders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { billingService } from '../billingService';

// ── Firebase/Firestore mocks ─────────────────────────────────────────────
vi.mock('@/shared/lib/firebase', () => ({
  functions: {},
 db: {}, auth: { currentUser: null } }));

const mockSet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    runTransaction: vi.fn(async (_db: any, fn: any) => {
      const txn = {
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: mockSet,
        update: mockUpdate,
      };
      await fn(txn);
    }),
    doc: vi.fn(() => ({ id: 'mock-ref' })),
    serverTimestamp: vi.fn(() => ({ _isServerTimestamp: true })),
    Timestamp: actual.Timestamp,
  };
});

// ── Repositories ─────────────────────────────────────────────────────────
vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({
  subscriptionRepository: { list: vi.fn(), getById: vi.fn() },
}));
vi.mock('@/shared/services/firestore/orderRepository', () => ({
  orderRepository: { getCustomerOrdersInRange: vi.fn() },
}));
vi.mock('@/shared/services/firestore/paymentRepository', () => ({
  paymentRepository: { getByCustomerId: vi.fn() },
}));

import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { paymentRepository } from '@/shared/services/firestore/paymentRepository';

const MOCK_SUBSCRIPTION = {
  id: 'sub-1',
  customerId: 'cust-1',
  planTier: 'basic',
  billingCycle: 'monthly',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  status: 'expired',
  autoRenew: false,
  quantity: 1,
  pricingMatrixSnapshot: {
    breakfast: 60,
    lunch: 65,
    dinner: 65,
    breakfast_lunch: 115,
    lunch_dinner: 115,
    breakfast_dinner: 115,
    breakfast_lunch_dinner: 159,
  },
};

describe('billing — holiday cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockReset();
    mockUpdate.mockReset();
  });

  it('excludes holiday-cancelled orders from billable total', async () => {
    // 2 regular delivered orders + 1 holiday-cancelled order
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValueOnce([
      {
        id: 'ord-1',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        date: '2026-09-15',
        mealType: 'lunch',
        status: 'delivered',
        price: 65,
      },
      {
        id: 'ord-2',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        date: '2026-09-20',
        mealType: 'lunch',
        status: 'delivered',
        price: 65,
      },
      {
        id: 'ord-3',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        date: '2026-09-25',
        mealType: 'lunch',
        status: 'cancelled',
        cancellationReason: 'holiday',
        price: 65,
      },
    ] as any);

    // No payments yet
    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValueOnce([]);

    await billingService.processSubscriptionEnd(MOCK_SUBSCRIPTION as any, '2026-09-30');

    // Invoice should be set with totalAmount = 65 + 65 = 130 (not 195)
    expect(mockSet).toHaveBeenCalledOnce();
    const invoiceData = mockSet.mock.calls[0][1];
    expect(invoiceData.subtotal).toBe(130);
    expect(invoiceData.lineItems[0].amount).toBe(130);
  });

  it('produces zero bill when ALL orders are holiday-cancelled', async () => {
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValueOnce([
      {
        id: 'ord-1',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        date: '2026-09-25',
        mealType: 'lunch',
        status: 'cancelled',
        cancellationReason: 'holiday',
        price: 65,
      },
    ] as any);

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValueOnce([]);

    await billingService.processSubscriptionEnd(MOCK_SUBSCRIPTION as any, '2026-09-30');

    expect(mockSet).toHaveBeenCalledOnce();
    const invoiceData = mockSet.mock.calls[0][1];
    expect(invoiceData.subtotal).toBe(0);
    expect(invoiceData.totalAmount).toBe(0);
    expect(invoiceData.status).toBe('paid'); // balanceDue <= 0
  });

  it('security deposit is isolated from usage calculation', async () => {
    vi.mocked(orderRepository.getCustomerOrdersInRange).mockResolvedValueOnce([
      {
        id: 'ord-1',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        date: '2026-09-15',
        mealType: 'lunch',
        status: 'delivered',
        price: 65,
      },
    ] as any);

    vi.mocked(paymentRepository.getByCustomerId).mockResolvedValueOnce([
      {
        id: 'pay-1',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        amount: 1000,
        status: 'verified',
        purpose: 'security_deposit',
      },
      {
        id: 'pay-2',
        subscriptionId: 'sub-1',
        customerId: 'cust-1',
        amount: 65,
        status: 'verified',
        purpose: 'usage', // or missing purpose (backward compat)
      },
    ] as any);

    await billingService.processSubscriptionEnd(MOCK_SUBSCRIPTION as any, '2026-09-30');

    expect(mockSet).toHaveBeenCalledOnce();
    const invoiceData = mockSet.mock.calls[0][1];
    // Usage: 65 (1 delivered order)
    expect(invoiceData.subtotal).toBe(65);
    // Payment applied: only pay-2 (65) — NOT the security deposit
    expect(invoiceData.totalAmount).toBe(0); // balanceDue = 65 - 65 = 0
    // Deposit held separately
    expect(invoiceData.depositHeld).toBe(1000);
  });
});
