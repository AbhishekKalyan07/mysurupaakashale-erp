import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockGetDoc: vi.fn(),
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

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: mocks.mockDoc,
    getDoc: mocks.mockGetDoc,
    writeBatch: mocks.mockWriteBatch,
    serverTimestamp: mocks.mockServerTimestamp,
    where: mocks.mockWhere,
    collection: vi.fn(() => ({ withConverter: vi.fn() })),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    query: vi.fn(),
    addDoc: vi.fn(),
  };
});
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mocks.mockOrderRepository }));
vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mocks.mockSubscriptionRepository }));
vi.mock('@/shared/services/firestore/analyticsRepository', () => ({ orderGenerationRunRepository: mocks.mockOrderGenerationRunRepository }));
vi.mock('@/shared/services/firestore/userRepository', () => ({ userRepository: mocks.mockUserRepository }));
vi.mock('@/shared/services/firestore/deliveryZoneRepository', () => ({ deliveryZoneRepository: mocks.mockDeliveryZoneRepository }));
vi.mock('@/shared/services/firestore/mealPlanRepository', () => ({ mealPlanRepository: mocks.mockMealPlanRepository }));
vi.mock('@/shared/services/firestore/notificationService', () => ({ 
  notifyDailyOrdersGenerated: mocks.mockNotifyDailyOrdersGenerated,
  notifyAdminAlert: mocks.mockNotifyAdminAlert,
  notifyOrderGeneratedCustomer: mocks.mockNotifyOrderGeneratedCustomer,
  notifyOrderGeneratedDriver: mocks.mockNotifyOrderGeneratedDriver
}));

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
