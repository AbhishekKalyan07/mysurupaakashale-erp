import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockGetDoc: vi.fn(),
    mockWriteBatch: vi.fn(),
    mockDoc: vi.fn((...segments: unknown[]) => ({ segments })),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockWhere: vi.fn((...args: unknown[]) => args),
    mockOrderRepository: { update: vi.fn() },
    mockSubscriptionRepository: { list: vi.fn() },
    mockOrderGenerationRunRepository: { getById: vi.fn(), create: vi.fn() },
    mockUserRepository: { list: vi.fn() },
    mockNotifyDailyOrdersGenerated: vi.fn()
  };
});

const {
  mockGetDoc,
  mockWriteBatch,
  mockDoc,
  mockServerTimestamp,
  mockWhere,
  mockOrderRepository,
  mockSubscriptionRepository,
  mockOrderGenerationRunRepository,
  mockUserRepository,
  mockNotifyDailyOrdersGenerated
} = mocks;

vi.mock('firebase/firestore', () => ({
  doc: mocks.mockDoc,
  getDoc: mocks.mockGetDoc,
  writeBatch: mocks.mockWriteBatch,
  serverTimestamp: mocks.mockServerTimestamp,
  where: mocks.mockWhere,
}));
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mocks.mockOrderRepository }));
vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mocks.mockSubscriptionRepository }));
vi.mock('@/shared/services/firestore/analyticsRepository', () => ({ orderGenerationRunRepository: mocks.mockOrderGenerationRunRepository }));
vi.mock('@/shared/services/firestore/userRepository', () => ({ userRepository: mocks.mockUserRepository }));
vi.mock('@/shared/services/firestore/notificationService', () => ({ notifyDailyOrdersGenerated: mocks.mockNotifyDailyOrdersGenerated }));

import { orderService } from '@/shared/services/business/orderService';

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifyDailyOrdersGenerated.mockResolvedValue(undefined);
  mockOrderGenerationRunRepository.getById.mockResolvedValue(null);
});

describe('active daily-order automation', () => {
  it('does not generate a duplicate run that has already succeeded', async () => {
    mockOrderGenerationRunRepository.getById.mockResolvedValue({ status: 'success' });

    await expect(orderService.generateDailyOrders('2026-07-29')).resolves.toEqual({
      success: true,
      message: 'Orders already generated for today.',
      ordersGenerated: 0,
    });

    expect(mockSubscriptionRepository.list).not.toHaveBeenCalled();
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('skips Sundays without querying Firestore collections', async () => {
    await expect(orderService.generateDailyOrders('2026-08-02')).resolves.toEqual({
      success: true,
      message: 'Today is Sunday (Holiday). No orders generated.',
      ordersGenerated: 0,
    });

    expect(mockSubscriptionRepository.list).not.toHaveBeenCalled();
  });

  it('creates deterministic orders, respects skips and assigns a zone-matched delivery partner', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    mockWriteBatch.mockReturnValue(batch);
    mockSubscriptionRepository.list.mockResolvedValue([
      {
        id: 'active-subscription', customerId: 'customer-1', planTier: 'standard', zoneId: 'north',
        startDate: '2026-07-01', pricePerDaySnapshot: 120, deliveryAddressId: 'address-1', latestPaymentId: 'payment-1',
        mealPreferences: [
          { mealType: 'breakfast', selectedOptionId: 'breakfast-a' },
          { mealType: 'lunch', selectedOptionId: 'lunch-a' },
        ],
      },
      { id: 'expired-subscription', customerId: 'customer-2', startDate: '2026-07-01', endDate: '2026-07-28', mealPreferences: [] },
      { id: 'future-subscription', customerId: 'customer-3', startDate: '2026-07-30', mealPreferences: [] },
    ]);
    mockUserRepository.list
      .mockResolvedValueOnce([{ id: 'delivery-1', role: 'delivery_partner', isActive: true, zoneIds: ['north'] }])
      .mockResolvedValueOnce([{ id: 'kitchen-1', role: 'kitchen', isActive: true }]);
    mockGetDoc.mockImplementation(async (reference: { segments: unknown[] }) => ({
      exists: () => reference.segments.includes('active-subscription'),
      data: () => ({ mealTypes: ['lunch'] }),
    }));

    await expect(orderService.generateDailyOrders('2026-07-29')).resolves.toMatchObject({ success: true, ordersGenerated: 1 });

    expect(batch.set).toHaveBeenCalledWith(
      { segments: [{ name: 'test-db' }, 'orders', 'ord_active-subscription_2026-07-29_breakfast'] },
      expect.objectContaining({ id: 'ord_active-subscription_2026-07-29_breakfast', deliveryPartnerId: 'delivery-1', status: 'scheduled' }),
      { merge: true },
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(mockOrderGenerationRunRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-07-29', status: 'success', ordersGenerated: 1 }),
      '2026-07-29',
    );
  });

  it('records a failed run and rethrows a batch-write failure', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockRejectedValue(new Error('Firestore unavailable')) };
    mockWriteBatch.mockReturnValue(batch);
    mockSubscriptionRepository.list.mockResolvedValue([
      { id: 'active-subscription', customerId: 'customer-1', startDate: '2026-07-01', mealPreferences: [{ mealType: 'lunch' }] },
    ]);
    mockUserRepository.list.mockResolvedValue([]);
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(orderService.generateDailyOrders('2026-07-29')).rejects.toThrow('Firestore unavailable');

    expect(mockOrderGenerationRunRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-07-29', status: 'failed', ordersGenerated: 0, error: 'Firestore unavailable' }),
      '2026-07-29',
    );
  });
});

export {};
