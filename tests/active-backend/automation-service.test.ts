const mockWhere = jest.fn((...args: unknown[]) => args);
const mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
const mockOrderRepository = { getByDate: jest.fn(), list: jest.fn() };
const mockSubscriptionRepository = { list: jest.fn(), update: jest.fn() };
const mockAnalyticsRepository = { create: jest.fn(), list: jest.fn(), delete: jest.fn() };
const mockOrderGenerationRunRepository = { list: jest.fn(), delete: jest.fn() };
const mockUserRepository = { list: jest.fn() };
const mockNotifySubscriptionExpired = jest.fn();
const mockNotifySubscriptionRenewalReminder = jest.fn();

jest.mock('firebase/firestore', () => ({
  where: mockWhere,
  serverTimestamp: mockServerTimestamp,
  getDocs: jest.fn(),
  collection: jest.fn(),
}));
jest.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
jest.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mockOrderRepository }));
jest.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mockSubscriptionRepository }));
jest.mock('@/shared/services/firestore/analyticsRepository', () => ({
  analyticsRepository: mockAnalyticsRepository,
  orderGenerationRunRepository: mockOrderGenerationRunRepository,
}));
jest.mock('@/shared/services/firestore/userRepository', () => ({ userRepository: mockUserRepository }));
jest.mock('@/shared/services/firestore/notificationService', () => ({
  notifySubscriptionExpired: mockNotifySubscriptionExpired,
  notifySubscriptionRenewalReminder: mockNotifySubscriptionRenewalReminder,
}));

const { automationService } = require('@/shared/services/firestore/automationService') as typeof import('@/shared/services/firestore/automationService');

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifySubscriptionExpired.mockResolvedValue(undefined);
  mockNotifySubscriptionRenewalReminder.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('active automation service', () => {
  it('creates an accurate daily operational summary', async () => {
    mockOrderRepository.getByDate.mockResolvedValue([
      { status: 'scheduled', mealType: 'breakfast' },
      { status: 'delivered', mealType: 'lunch' },
      { status: 'failed_delivery', mealType: 'dinner' },
      { status: 'cancelled', mealType: 'lunch' },
    ]);
    mockSubscriptionRepository.list.mockResolvedValue([
      { customerId: 'customer-1' }, { customerId: 'customer-1' }, { customerId: 'customer-2' },
    ]);

    await expect(automationService.generateDailySummary('2026-07-29')).resolves.toMatchObject({
      id: 'summary_2026-07-29', activeCustomers: 2, activeSubscriptions: 3,
      breakfastCount: 1, lunchCount: 1, dinnerCount: 1,
      totalDeliveries: 4, completedDeliveries: 1, failedDeliveries: 1,
    });
    expect(mockAnalyticsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'summary_2026-07-29' }), 'summary_2026-07-29');
  });

  it('sends the appropriate expiry and renewal notifications', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
    mockSubscriptionRepository.list.mockResolvedValue([
      { id: 'expired', customerId: 'customer-1', endDate: '2026-07-28' },
      { id: 'tomorrow', customerId: 'customer-2', endDate: '2026-07-30' },
      { id: 'in-three-days', customerId: 'customer-3', endDate: '2026-08-01' },
      { id: 'in-seven-days', customerId: 'customer-4', endDate: '2026-08-05' },
      { id: 'not-due', customerId: 'customer-5', endDate: '2026-08-06' },
    ]);

    await automationService.checkSubscriptionExpiry();
    await Promise.resolve();

    expect(mockNotifySubscriptionExpired).toHaveBeenCalledWith('customer-1', 'expired');
    expect(mockNotifySubscriptionRenewalReminder).toHaveBeenCalledWith('customer-2', 'tomorrow', 1, '2026-07-30');
    expect(mockNotifySubscriptionRenewalReminder).toHaveBeenCalledWith('customer-3', 'in-three-days', 3, '2026-08-01');
    expect(mockNotifySubscriptionRenewalReminder).toHaveBeenCalledWith('customer-4', 'in-seven-days', 7, '2026-08-05');
  });

  it('pauses, resumes, and clears expired pause schedules', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
    mockSubscriptionRepository.list
      .mockResolvedValueOnce([
        { id: 'pause-now', status: 'active', pauseStartDate: '2026-07-29', pauseEndDate: '2026-08-02' },
        { id: 'clear-stale-schedule', status: 'active', pauseStartDate: '2026-07-20', pauseEndDate: '2026-07-28' },
      ])
      .mockResolvedValueOnce([{ id: 'resume-now', status: 'paused', pauseEndDate: '2026-07-28' }]);

    await automationService.processScheduledPauses();

    expect(mockSubscriptionRepository.update).toHaveBeenCalledWith('pause-now', { status: 'paused' });
    expect(mockSubscriptionRepository.update).toHaveBeenCalledWith('clear-stale-schedule', { pauseStartDate: null, pauseEndDate: null });
    expect(mockSubscriptionRepository.update).toHaveBeenCalledWith('resume-now', {
      status: 'active', pauseStartDate: null, pauseEndDate: null,
    });
  });
});

export {};
