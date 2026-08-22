import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockWhere: vi.fn((...args: unknown[]) => args),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockOrderRepository: { getByDate: vi.fn(), list: vi.fn() },
    mockSubscriptionRepository: { list: vi.fn(), update: vi.fn() },
    mockAnalyticsRepository: { create: vi.fn(), list: vi.fn(), delete: vi.fn() },
    mockOrderGenerationRunRepository: { list: vi.fn(), delete: vi.fn() },
    mockUserRepository: { list: vi.fn() },
    mockNotifySubscriptionExpired: vi.fn(),
    mockNotifySubscriptionRenewalReminder: vi.fn(),
  };
});

const {
  mockWhere,
  mockServerTimestamp,
  mockOrderRepository,
  mockSubscriptionRepository,
  mockAnalyticsRepository,
  mockOrderGenerationRunRepository,
  mockUserRepository,
  mockNotifySubscriptionExpired,
  mockNotifySubscriptionRenewalReminder
} = mocks;

vi.mock('firebase/firestore', () => ({
  where: mocks.mockWhere,
  serverTimestamp: mocks.mockServerTimestamp,
  getDocs: vi.fn(),
  collection: vi.fn(),
  runTransaction: vi.fn(async (_, cb) => cb({
    get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ status: 'active' }) }),
    update: vi.fn()
  }))
}));
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/shared/services/firestore/orderRepository', () => ({ orderRepository: mocks.mockOrderRepository }));
vi.mock('@/shared/services/firestore/subscriptionRepository', () => ({ subscriptionRepository: mocks.mockSubscriptionRepository }));
vi.mock('@/shared/services/firestore/analyticsRepository', () => ({
  analyticsRepository: mocks.mockAnalyticsRepository,
  orderGenerationRunRepository: mocks.mockOrderGenerationRunRepository,
}));
vi.mock('@/shared/services/firestore/userRepository', () => ({ userRepository: mocks.mockUserRepository }));
vi.mock('@/shared/services/firestore/notificationService', () => ({
  notifySubscriptionExpired: mocks.mockNotifySubscriptionExpired,
  notifySubscriptionRenewalReminder: mocks.mockNotifySubscriptionRenewalReminder,
}));

import { automationService } from '@/shared/services/firestore/automationService';

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifySubscriptionExpired.mockResolvedValue(undefined);
  mockNotifySubscriptionRenewalReminder.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
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
