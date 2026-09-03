import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockGetDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
    mockWriteBatch: vi.fn(),
    mockDoc: vi.fn((...segments: unknown[]) => ({ segments })),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockWhere: vi.fn((...args: unknown[]) => args),
    mockOrderRepository: { update: vi.fn(), list: vi.fn().mockResolvedValue([]) },
    mockSubscriptionRepository: { list: vi.fn() },
    mockOrderGenerationRunRepository: { getById: vi.fn(), create: vi.fn(), update: vi.fn() },
    mockUserRepository: { list: vi.fn().mockResolvedValue([]) },
    mockDeliveryZoneRepository: { list: vi.fn().mockResolvedValue([{ id: 'north', name: 'North Zone' }]) },
    mockMealPlanRepository: { list: vi.fn().mockResolvedValue([{ id: 'standard', name: 'Standard Plan' }]) },
    mockNotifyDailyOrdersGenerated: vi.fn(),
    mockNotifyAdminAlert: vi.fn(),
    mockNotifyOrderGeneratedCustomer: vi.fn().mockResolvedValue(undefined),
    mockNotifyOrderGeneratedDriver: vi.fn().mockResolvedValue(undefined)
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
  mockDeliveryZoneRepository,
  mockMealPlanRepository,
  mockNotifyDailyOrdersGenerated,
  mockNotifyAdminAlert,
  mockNotifyOrderGeneratedCustomer,
  mockNotifyOrderGeneratedDriver
} = mocks;

vi.mock('../../functions/src/compat', () => ({
  doc: mocks.mockDoc,
  getDoc: mocks.mockGetDoc,
  writeBatch: mocks.mockWriteBatch,
  serverTimestamp: mocks.mockServerTimestamp,
  where: mocks.mockWhere,
  collection: vi.fn(() => ({ withConverter: vi.fn() })),
  db: { name: 'test-db' }
}));

vi.mock('../../functions/src/repositories', () => ({
  orderRepository: mocks.mockOrderRepository,
  subscriptionRepository: mocks.mockSubscriptionRepository,
  orderGenerationRunRepository: mocks.mockOrderGenerationRunRepository,
  userRepository: {
    ...mocks.mockUserRepository,
    listAdmins: vi.fn().mockResolvedValue([{ id: 'admin1', email: 'admin@example.com' }])
  },
  holidayRepository: { isHoliday: vi.fn().mockResolvedValue(false) },
  deliveryZoneRepository: mocks.mockDeliveryZoneRepository,
  mealPlanRepository: mocks.mockMealPlanRepository,
  kitchenRepository: { 
    getById: vi.fn().mockResolvedValue({ id: 'kitchen-1', name: 'Main Kitchen', isDefault: true }),
    list: vi.fn().mockResolvedValue([{ id: 'kitchen-1', name: 'Main Kitchen', isDefault: true }])
  },
  failureQueueRepository: {
    logFailure: vi.fn().mockResolvedValue(undefined)
  },
  auditRepository: {
    logAction: vi.fn().mockResolvedValue(undefined)
  },
  notificationService: { 
    notifyDailyOrdersGenerated: mocks.mockNotifyDailyOrdersGenerated,
    notifyAdminAlert: mocks.mockNotifyAdminAlert,
    notifyOrderGeneratedCustomer: mocks.mockNotifyOrderGeneratedCustomer,
    notifyOrderGeneratedDriver: mocks.mockNotifyOrderGeneratedDriver
  }
}));

import { orderService } from '../../functions/src/orders';

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
      message: '0 new orders generated. (Orders may have already been generated for today)',
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
          { mealType: 'breakfast', selectedOptionId: 'breakfast-a' }
        ],
      },
      { id: 'expired-subscription', customerId: 'customer-2', startDate: '2026-07-01', endDate: '2026-07-28', mealPreferences: [] },
      { id: 'future-subscription', customerId: 'customer-3', startDate: '2026-07-30', mealPreferences: [] },
    ]);
    mockUserRepository.list.mockImplementation(async (...args: any[]) => {
      const condition = args[0];
      if (condition && condition[2] === 'customer') {
        return [{ id: 'customer-1', role: 'customer', zoneId: 'north' }];
      } else if (condition && condition[2] === 'delivery_partner') {
        return [{ id: 'delivery-1', role: 'delivery_partner', isAvailable: true, isActive: true, zoneIds: ['north'] }];
      }
      return [];
    });
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
    expect(mockOrderGenerationRunRepository.update).toHaveBeenCalledWith(
      '2026-07-29_breakfast',
      expect.objectContaining({ status: 'success', ordersGenerated: 1 }),
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

    expect(mockOrderGenerationRunRepository.update).toHaveBeenCalledWith(
      '2026-07-29_lunch',
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('Firestore unavailable') }),
    );
  });
});

export {};
