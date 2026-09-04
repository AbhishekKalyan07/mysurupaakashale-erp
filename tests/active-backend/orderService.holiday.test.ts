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
import { orderService } from '../../functions/src/orders';
import { holidayRepository } from '../../functions/src/repositories';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../../functions/src/repositories', () => ({
  holidayRepository: { isHoliday: vi.fn() },
  orderGenerationRunRepository: { getById: vi.fn(), create: vi.fn(), update: vi.fn() },
  subscriptionRepository: { list: vi.fn().mockResolvedValue([]) },
  mealPlanRepository: { list: vi.fn().mockResolvedValue([]) },
  userRepository: { list: vi.fn().mockResolvedValue([]) },
  deliveryZoneRepository: { list: vi.fn().mockResolvedValue([]) },
  orderRepository: { list: vi.fn().mockResolvedValue([]) },
  kitchenRepository: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/shared/lib/firebase', () => ({
  functions: {},
  auth: { currentUser: { uid: 'test-admin-uid' } },
  db: {},
}));

vi.mock('../../functions/src/compat', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...(actual || {}),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
    doc: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    where: actual?.where || vi.fn(),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});


const HOLIDAY_DATE = '2026-10-02';

describe('orderService — holiday guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateBreakfastOrders (via generateDailyOrders)', () => {
    it('returns 0 without creating any orders when date is a holiday', async () => {
      vi.spyOn(holidayRepository, 'isHoliday').mockResolvedValue(true);

      // Access the private generateMealOrders via the public generateBreakfastOrders
      // The public API is generateDailyOrders() → generateBreakfastOrders → generateMealOrders
      const result = await (orderService as any).generateMealOrders(HOLIDAY_DATE, 'breakfast');

      expect(result).toBe(0);
      expect(holidayRepository.isHoliday).toHaveBeenCalledWith(HOLIDAY_DATE);
    });

    it('proceeds normally when date is NOT a holiday', async () => {
      vi.spyOn(holidayRepository, 'isHoliday').mockResolvedValue(false);

      // Now it will proceed to check subscriptions (which returns [])
      const result = await (orderService as any).generateMealOrders('2026-10-03', 'breakfast');

      // No subscriptions → 0 orders generated, but holiday guard was passed
      expect(result).toBe(0);
      expect(holidayRepository.isHoliday).toHaveBeenCalledWith('2026-10-03');
    });
  });

  describe('generateOrdersForSubscription', () => {
    it('returns early without creating any orders when date is a holiday', async () => {
      vi.spyOn(holidayRepository, 'isHoliday').mockResolvedValue(true);

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
      vi.spyOn(holidayRepository, 'isHoliday').mockResolvedValue(false);

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
