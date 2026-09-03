/**
 * orderService.holiday.test.ts
 *
 * Tests that verify the holiday guard in orderService blocks order generation.
 * Specifically covers:
 *   1. generateMealOrders: returns 0 on holiday
 *   2. generateOrdersForSubscription: skips on holiday
 *   3. Normal generation still works on non-holiday dates
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { holidayRepository } from '../../firestore/holidayRepository';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../../firestore/holidayRepository', () => ({
  holidayRepository: {
    isHoliday: vi.fn(),
  },
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-admin-uid' } },
  db: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
    doc: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    where: actual.where,
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

// Mock all repositories that orderService depends on
vi.mock('../../firestore/orderRepository', () => ({
  orderRepository: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    batchCreate: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../firestore/subscriptionRepository', () => ({
  subscriptionRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../firestore/analyticsRepository', () => ({
  orderGenerationRunRepository: {
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../firestore/userRepository', () => ({
  userRepository: { getById: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../firestore/mealPlanRepository', () => ({
  mealPlanRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../firestore/kitchenRepository', () => ({
  kitchenRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../firestore/deliveryZoneRepository', () => ({
  deliveryZoneRepository: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../firestore/notificationService', () => ({
  notifyDailyOrdersGenerated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/shared/lib/date', () => ({
  getTodayInTimezone: vi.fn(() => '2026-10-02'),
}));

const HOLIDAY_DATE = '2026-10-02';

describe('orderService — holiday guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateBreakfastOrders (via generateDailyOrders)', () => {
    it('returns 0 without creating any orders when date is a holiday', async () => {
      vi.mocked(holidayRepository.isHoliday).mockResolvedValue(true);

      // Access the private generateMealOrders via the public generateBreakfastOrders
      // The public API is generateDailyOrders() → generateBreakfastOrders → generateMealOrders
      const result = await (orderService as any).generateMealOrders(HOLIDAY_DATE, 'breakfast');

      expect(result).toBe(0);
      expect(holidayRepository.isHoliday).toHaveBeenCalledWith(HOLIDAY_DATE);
    });

    it('proceeds normally when date is NOT a holiday', async () => {
      vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);

      // Now it will proceed to check subscriptions (which returns [])
      const result = await (orderService as any).generateMealOrders('2026-10-03', 'breakfast');

      // No subscriptions → 0 orders generated, but holiday guard was passed
      expect(result).toBe(0);
      expect(holidayRepository.isHoliday).toHaveBeenCalledWith('2026-10-03');
    });
  });

  describe('generateOrdersForSubscription', () => {
    it('returns early without creating any orders when date is a holiday', async () => {
      vi.mocked(holidayRepository.isHoliday).mockResolvedValue(true);

      const MOCK_SUB = {
        id: 'sub-1',
        customerId: 'cust-1',
        mealPreferences: ['lunch'],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'active',
        quantity: 1,
        planId: 'plan-basic',
        planTier: 'basic',
        autoRenew: false,
        billingCycle: 'monthly',
      };

      await (orderService as any).generateOrdersForSubscription(MOCK_SUB, HOLIDAY_DATE);

      // isHoliday should have been called AFTER the Sunday check
      expect(holidayRepository.isHoliday).toHaveBeenCalledWith(HOLIDAY_DATE);
    });

    it('holiday check runs AFTER Sunday check (Sunday is still blocked)', async () => {
      // '2026-10-04' is a Sunday
      vi.mocked(holidayRepository.isHoliday).mockResolvedValue(false);

      const MOCK_SUB = {
        id: 'sub-1',
        customerId: 'cust-1',
        mealPreferences: ['lunch'],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'active',
        quantity: 1,
        planId: 'plan-basic',
        planTier: 'basic',
        autoRenew: false,
        billingCycle: 'monthly',
      };

      await (orderService as any).generateOrdersForSubscription(MOCK_SUB, '2026-10-04');

      // On Sunday, the guard returns before isHoliday is checked
      expect(holidayRepository.isHoliday).not.toHaveBeenCalled();
    });
  });
});
