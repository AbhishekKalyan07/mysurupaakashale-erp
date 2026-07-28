const mockGetDoc = jest.fn();
const mockWriteBatch = jest.fn();
const mockDoc = jest.fn((...segments: unknown[]) => ({ segments }));
const mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
const mockWhere = jest.fn((...args: unknown[]) => args);

const mockOrderRepository = { update: jest.fn() };
const mockSubscriptionRepository = { list: jest.fn() };
const mockOrderGenerationRunRepository = { getById: jest.fn(), create: jest.fn() };
const mockUserRepository = { list: jest.fn() };
const mockNotifyDailyOrdersGenerated = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  writeBatch: mockWriteBatch,
  serverTimestamp: mockServerTimestamp,
  where: mockWhere,
}));
jest.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
jest.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mockOrderRepository }));
jest.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mockSubscriptionRepository }));
jest.mock('@/shared/services/firestore/analyticsRepository', () => ({ orderGenerationRunRepository: mockOrderGenerationRunRepository }));
jest.mock('@/shared/services/firestore/userRepository', () => ({ userRepository: mockUserRepository }));
jest.mock('@/shared/services/firestore/notificationService', () => ({ notifyDailyOrdersGenerated: mockNotifyDailyOrdersGenerated }));

const { orderService } = require('@/shared/services/business/orderService') as typeof import('@/shared/services/business/orderService');

beforeEach(() => {
  jest.clearAllMocks();
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
    const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
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
    const batch = { set: jest.fn(), commit: jest.fn().mockRejectedValue(new Error('Firestore unavailable')) };
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
