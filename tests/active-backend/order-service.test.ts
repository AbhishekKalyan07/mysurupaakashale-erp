import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockGetDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
    mockWriteBatch: vi.fn(),
    mockDoc: vi.fn((...segments: unknown[]) => ({ segments })),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockWhere: vi.fn((...args: unknown[]) => args),
    mockOrderRepository: { update: vi.fn(), list: vi.fn().mockResolvedValue([]) },
    mockSubscriptionRepository: { list: vi.fn(), getById: vi.fn() },
    mockOrderGenerationRunRepository: { getById: vi.fn(), create: vi.fn(), update: vi.fn() },
    mockUserRepository: { list: vi.fn().mockResolvedValue([]), getById: vi.fn().mockResolvedValue({ id: 'cust-1' }) },
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

  it('skips active holidays during daily order generation', async () => {
    const { holidayRepository } = await import('../../functions/src/repositories');
    vi.mocked(holidayRepository.isHoliday).mockResolvedValueOnce(true);

    const res = await orderService.generateBreakfastOrders('2026-10-02');
    expect(res).toBe(0);
  });
  it('restoreOrdersForUnskipDay regenerates missing orders for an unskipped day', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    mockWriteBatch.mockReturnValue(batch);
    mockSubscriptionRepository.getById.mockResolvedValue({
      id: 'sub-1', customerId: 'cust-1', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', planTier: 'standard', mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'lunch-opt' }]
    });
    mockUserRepository.list.mockResolvedValue([{ id: 'cust-1', role: 'customer' }]);
    
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).resolves.toBeUndefined();
    
    expect(batch.set).toHaveBeenCalledWith(
      { segments: [{ name: 'test-db' }, 'orders', 'ord_sub-1_2026-08-01_lunch'] },
      expect.objectContaining({ id: 'ord_sub-1_2026-08-01_lunch', mealType: 'lunch' }),
      { merge: true }
    );
    expect(batch.commit).toHaveBeenCalled();
  });
  
  it('restoreOrdersForUnskipDay throws on invalid subscription or date', async () => {
    mockSubscriptionRepository.getById.mockResolvedValue(null);
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).rejects.toThrow('Subscription sub-1 not found');
    
    mockSubscriptionRepository.getById.mockResolvedValue({ id: 'sub-1', customerId: 'other-cust', status: 'active' });
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).rejects.toThrow('Subscription does not belong to this customer');
    
    mockSubscriptionRepository.getById.mockResolvedValue({ id: 'sub-1', customerId: 'cust-1', status: 'paused' });
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).rejects.toThrow('Subscription is paused, not active');
    
    mockSubscriptionRepository.getById.mockResolvedValue({ id: 'sub-1', customerId: 'cust-1', status: 'active', startDate: '2026-08-10' });
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).rejects.toThrow('Requested date is before the subscription start date');
    
    mockSubscriptionRepository.getById.mockResolvedValue({ id: 'sub-1', customerId: 'cust-1', status: 'active', startDate: '2026-01-01', endDate: '2026-07-01' });
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-08-01', ['lunch'], true)).rejects.toThrow('Requested date is after the subscription end date');
  });

  it('cancelOrdersForSkipDay commits cancelled orders and logs audit', async () => {
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined), update: vi.fn() };
    mockWriteBatch.mockReturnValue(batch);
    
    mockOrderRepository.list.mockResolvedValue([
      { id: 'o1', mealType: 'breakfast', kitchenStatus: 'scheduled' }
    ]);
    const auditSpy = vi.fn().mockResolvedValue(undefined);
    const repoMod = await import('../../functions/src/repositories');
    repoMod.auditRepository.logAction = auditSpy;

    await orderService.cancelOrdersForSkipDay('sub-1', 'cust-1', '2026-09-05', ['breakfast']);
    
    expect(batch.update).toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalled();
    // Audit may take a tick
    await new Promise(r => setTimeout(r, 0));
    expect(auditSpy).toHaveBeenCalledWith('meal_cancelled', 'cust-1', 'Customer', 'o1', 'order', { date: '2026-09-05', mealType: 'breakfast' });
  });

  it('appendCancelOrdersToBatch throws if order is kitchen locked', async () => {
    mockOrderRepository.list.mockResolvedValue([
      { id: 'o1', mealType: 'lunch', kitchenStatus: 'packing' }
    ]);
    const batch = { update: vi.fn() };
    await expect(orderService.appendCancelOrdersToBatch(batch, 'sub-1', 'cust-1', '2026-09-05', ['lunch'])).rejects.toThrow('Order is already being prepared by the kitchen and cannot be cancelled.');
  });

  it('restoreOrdersForUnskipDay throws if order is operational locked', async () => {
    mockOrderRepository.list.mockResolvedValue([
      { id: 'o1', mealType: 'lunch', status: 'delivered' }
    ]);
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-09-05', ['lunch'], false)).rejects.toThrow('Order is already in delivery or delivered and cannot be modified.');
  });
  
  it('restoreOrdersForUnskipDay throws if order is kitchen locked', async () => {
    mockOrderRepository.list.mockResolvedValue([
      { id: 'o1', mealType: 'lunch', kitchenStatus: 'packed' }
    ]);
    await expect(orderService.restoreOrdersForUnskipDay('cust-1', 'sub-1', '2026-09-05', ['lunch'], false)).rejects.toThrow('Order is already being prepared by the kitchen and cannot be modified.');
  });
});

export {};
