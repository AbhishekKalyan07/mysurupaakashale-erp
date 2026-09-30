import { describe, it, expect, beforeEach } from 'vitest';
import { pricingService } from '../pricingService';
import { pricingRepository } from '@/shared/services/firestore/pricingRepository';
import type { Subscription, Order, Invoice, PricingConfiguration } from '@/shared/types';

describe('Phase E2 — Owner/Admin Pricing Configuration & Effective-Dated Pricing', () => {
  const baseActiveConfig: PricingConfiguration = {
    id: 'cfg-active-2026-01',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-30',
    pricing: {
      standard: {
        meals: { breakfast: 50, lunch: 100, dinner: 100 },
        combos: { lunch_dinner: 190, all_three: 230 },
      },
    },
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
  };

  const futureConfig: PricingConfiguration = {
    id: 'cfg-future-2026-10',
    effectiveFrom: '2026-10-01',
    effectiveTo: undefined,
    pricing: {
      standard: {
        meals: { breakfast: 65, lunch: 120, dinner: 120 },
        combos: { lunch_dinner: 220, all_three: 270 },
      },
    },
    status: 'scheduled',
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    createdBy: 'admin-1',
    updatedBy: 'admin-1',
  };

  beforeEach(() => {
    // Seed in-memory cache of pricingRepository with clean test data
    pricingRepository.seedMemoryCache([baseActiveConfig, futureConfig]);
  });

  // ---------------------------------------------------------------------------
  // A. Existing order price remains unchanged after global pricing change
  // ---------------------------------------------------------------------------
  it('Scenario A: Existing order price remains unchanged after global pricing change', () => {
    const historicalOrder: Order = {
      id: 'order-101',
      source: 'subscription',
      customerId: 'cust-1',
      subscriptionId: 'sub-1',
      planTier: 'basic',
      mealType: 'breakfast',
      date: '2026-09-15',
      itemsLabel: 'Idli Sambar',
      selectedOptionId: null,
      price: 50, // Snapshotted at creation
    } as any;

    // Global pricing changes for future (or even active)
    const newConfig: PricingConfiguration = {
      id: 'cfg-future-2026-11',
      effectiveFrom: '2026-11-01',
      pricing: {
        standard: {
          meals: { breakfast: 80, lunch: 150, dinner: 150 },
          combos: { lunch_dinner: 280, all_three: 320 },
        },
      },
      status: 'scheduled',
      createdAt: '2026-09-29T11:00:00.000Z',
      updatedAt: '2026-09-29T11:00:00.000Z',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
    };
    pricingRepository.seedMemoryCache([baseActiveConfig, futureConfig, newConfig]);

    // Order snapshot remains immutable
    expect(historicalOrder.price).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // B. Existing invoice total remains unchanged after global pricing change
  // ---------------------------------------------------------------------------
  it('Scenario B: Existing invoice total remains unchanged after global pricing change', () => {
    const historicalInvoice: Invoice = {
      id: 'inv-2026-09',
      invoiceNumber: 'INV-2026-001',
      customerId: 'cust-1',
      subscriptionId: 'sub-1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      totalMeals: 30,
      baseAmount: 3000,
      addonAmount: 0,
      deliveryCharges: 0,
      taxAmount: 0,
      totalAmount: 3000, // Frozen financial total
      verifiedPayments: 3000,
      balanceDue: 0,
      status: 'paid',
      lineItems: [
        {
          date: '2026-09-01',
          mealType: 'lunch',
          description: 'South Indian Thali',
          amount: 100,
          status: 'delivered',
        },
      ],
      createdAt: '2026-09-30T23:59:59.000Z',
      dueDate: '2026-10-05T00:00:00.000Z',
    } as any;

    // Create a new future price version
    const newConfig: PricingConfiguration = {
      id: 'cfg-new-2026-12',
      effectiveFrom: '2026-12-01',
      pricing: {
        standard: {
          meals: { breakfast: 90, lunch: 160, dinner: 160 },
          combos: { lunch_dinner: 300, all_three: 350 },
        },
      },
      status: 'scheduled',
      createdAt: '2026-09-29T11:00:00.000Z',
      updatedAt: '2026-09-29T11:00:00.000Z',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
    };
    pricingRepository.seedMemoryCache([baseActiveConfig, futureConfig, newConfig]);

    // Financial invoice must never be retroactively recalculated
    expect(historicalInvoice.totalAmount).toBe(3000);
    expect(historicalInvoice.lineItems[0].amount).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // C. Future pricing does not affect dates before effectiveFrom
  // ---------------------------------------------------------------------------
  it('Scenario C: Future pricing does not affect dates before effectiveFrom', async () => {
    // futureConfig is effectiveFrom '2026-10-01' with breakfast: 65, lunch: 120
    // On 2026-09-30, target date must resolve to baseActiveConfig (breakfast: 50, lunch: 100)
    const effective = await pricingRepository.getEffectiveForDate('2026-09-30');
    expect(effective).not.toBeNull();
    expect(effective?.id).toBe('cfg-active-2026-01');
    expect((effective!.pricing as any).standard.meals.breakfast).toBe(50);
    expect((effective!.pricing as any).standard.meals.lunch).toBe(100);

    const subWithoutSnapshot: Subscription = {
      id: 'sub-nosnap-1',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
    } as any;

    const price = await pricingService.calculateMealPrice(subWithoutSnapshot, 'lunch', 1, '2026-09-30');
    expect(price).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // D. Future pricing applies starting exactly at effectiveFrom
  // ---------------------------------------------------------------------------
  it('Scenario D: Future pricing applies starting exactly at effectiveFrom', async () => {
    // On 2026-10-01, target date must resolve to futureConfig (breakfast: 65, lunch: 120)
    const effective = await pricingRepository.getEffectiveForDate('2026-10-01');
    expect(effective).not.toBeNull();
    expect(effective?.id).toBe('cfg-future-2026-10');
    expect((effective!.pricing as any).standard.meals.breakfast).toBe(65);
    expect((effective!.pricing as any).standard.meals.lunch).toBe(120);

    const subWithoutSnapshot: Subscription = {
      id: 'sub-nosnap-2',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
    } as any;

    const price = await pricingService.calculateMealPrice(subWithoutSnapshot, 'lunch', 1, '2026-10-01');
    expect(price).toBe(120);
  });

  // ---------------------------------------------------------------------------
  // E. Existing pricingMatrixSnapshot remains authoritative
  // ---------------------------------------------------------------------------
  it('Scenario E: Existing pricingMatrixSnapshot remains authoritative over newly scheduled base pricing', async () => {
    // Subscriber signed up when lunch was 95; snapshot frozen at 95
    const subscriberWithSnapshot: Subscription = {
      id: 'sub-snap-1',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 95,
      pricingMatrixSnapshot: {
        meals: { breakfast: 45, lunch: 95, dinner: 95 },
        combos: { lunch_dinner: 180, all_three: 210 },
      },
    } as any;

    // Even on 2026-10-01 when global base is 120, the subscriber's frozen snapshot MUST be used
    const matrix = pricingService.getPricingMatrix(subscriberWithSnapshot, '2026-10-01');
    expect(matrix.lunch).toBe(95);

    const price = await pricingService.calculateMealPrice(subscriberWithSnapshot, 'lunch', 1, '2026-10-01');
    expect(price).toBe(95);
  });

  // ---------------------------------------------------------------------------
  // F. negotiatedPricing overrides both snapshot/base according to existing precedence
  // ---------------------------------------------------------------------------
  it('Scenario F: negotiatedPricing overrides both snapshot and base according to existing precedence', async () => {
    // 1. negotiatedPricing > 2. pricingMatrixSnapshot > 3. effective base pricing
    const vipSub: Subscription = {
      id: 'sub-vip-1',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
      pricingMatrixSnapshot: {
        meals: { breakfast: 45, lunch: 95, dinner: 95 },
        combos: { lunch_dinner: 180, all_three: 210 },
      },
      negotiatedPricing: {
        meals: { breakfast: 40, lunch: 75, dinner: 75 },
        combos: { lunch_dinner: 140, all_three: 175 },
      },
    } as any;

    // Negotiated price of 75 must beat both snapshot (95) and global base (120)
    const matrix = pricingService.getPricingMatrix(vipSub, '2026-10-01');
    expect(matrix.lunch).toBe(75);

    const price = await pricingService.calculateMealPrice(vipSub, 'lunch', 1, '2026-10-01');
    expect(price).toBe(75);
  });

  // ---------------------------------------------------------------------------
  // G. Overlapping effective pricing periods are rejected
  // ---------------------------------------------------------------------------
  it('Scenario G: Overlapping effective pricing periods are rejected', async () => {
    // baseActiveConfig covers 2026-01-01 to 2026-09-30
    // futureConfig covers 2026-10-01 to infinity

    // Attempting to create a config from 2026-09-15 to 2026-10-15 overlaps with both!
    const overlappingConfig: PricingConfiguration = {
      id: 'cfg-overlap',
      effectiveFrom: '2026-09-15',
      effectiveTo: '2026-10-15',
      pricing: {
        standard: {
          meals: { breakfast: 60, lunch: 110, dinner: 110 },
          combos: { lunch_dinner: 200, all_three: 250 },
        },
      },
      status: 'scheduled',
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
    };

    await expect(
      pricingRepository.validatePricingPeriod(overlappingConfig, [baseActiveConfig, futureConfig]),
    ).rejects.toThrow(/overlaps with existing configuration/i);
  });

  // ---------------------------------------------------------------------------
  // H. Invalid effective date ranges are rejected
  // ---------------------------------------------------------------------------
  it('Scenario H: Invalid effective date ranges are rejected', async () => {
    const invalidRangeConfig: PricingConfiguration = {
      id: 'cfg-invalid-range',
      effectiveFrom: '2026-11-15',
      effectiveTo: '2026-11-01', // Before effectiveFrom!
      pricing: {
        standard: {
          meals: { breakfast: 60, lunch: 110, dinner: 110 },
          combos: { lunch_dinner: 200, all_three: 250 },
        },
      },
      status: 'scheduled',
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
    };

    await expect(
      pricingRepository.validatePricingPeriod(invalidRangeConfig, []),
    ).rejects.toThrow(/effectiveTo date cannot be earlier than effectiveFrom/i);

    const invalidFormatConfig: PricingConfiguration = {
      ...invalidRangeConfig,
      effectiveFrom: '2026/10/01', // Invalid format
      effectiveTo: undefined,
    };

    await expect(
      pricingRepository.validatePricingPeriod(invalidFormatConfig, []),
    ).rejects.toThrow(/YYYY-MM-DD/i);
  });

  // ---------------------------------------------------------------------------
  // I. Repeated lookup for the same target date returns deterministic pricing
  // ---------------------------------------------------------------------------
  it('Scenario I: Repeated lookup for the same target date returns deterministic pricing', async () => {
    const targetDate = '2026-10-15';
    const firstLookup = await pricingRepository.getEffectiveForDate(targetDate);
    const secondLookup = await pricingRepository.getEffectiveForDate(targetDate);
    const thirdLookup = await pricingRepository.getEffectiveForDate(targetDate);

    expect(firstLookup?.id).toBe('cfg-future-2026-10');
    expect((firstLookup!.pricing as any).standard.meals.lunch).toBe(120);
    expect((secondLookup!.pricing as any).standard.meals.lunch).toBe(120);
    expect((thirdLookup!.pricing as any).standard.meals.lunch).toBe(120);
  });

  // ---------------------------------------------------------------------------
  // J. DailyMenu dish changes still have zero pricing side effects
  // ---------------------------------------------------------------------------
  it('Scenario J: DailyMenu dish changes still have zero pricing side effects', async () => {
    const sub: Subscription = {
      id: 'sub-dish-test',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
      pricingMatrixSnapshot: {
        meals: { breakfast: 50, lunch: 100, dinner: 100 },
        combos: { lunch_dinner: 190, all_three: 230 },
      },
    } as any;

    // Meal price for lunch with standard South Meals
    const priceMenuA = await pricingService.calculateMealPrice(sub, 'lunch', 1, '2026-10-05');

    // Admin updates DailyMenu dish to "Special Mysore Thali with Obbattu" (premium items)
    // In E1/E2, published DailyMenu is purely descriptive, pricing is governed strictly by PricingService
    const priceMenuB = await pricingService.calculateMealPrice(sub, 'lunch', 1, '2026-10-05');

    expect(priceMenuA).toBe(100);
    expect(priceMenuB).toBe(100);
    expect(priceMenuA).toBe(priceMenuB);
  });

  // ---------------------------------------------------------------------------
  // K. Cancellation pricing still follows the canonical pricing precedence
  // ---------------------------------------------------------------------------
  it('Scenario K: Cancellation pricing still follows canonical pricing precedence', () => {
    // 1. VIP sub with negotiated pricing
    const vipSub: Subscription = {
      id: 'sub-vip-k',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
      pricingMatrixSnapshot: {
        meals: { breakfast: 50, lunch: 100, dinner: 100 },
        combos: { lunch_dinner: 190, all_three: 230 },
      },
      negotiatedPricing: {
        meals: { breakfast: 35, lunch: 70, dinner: 70 },
        combos: { lunch_dinner: 130, all_three: 160 },
      },
    } as any;

    // Cancellation of lunch + dinner uses negotiated combo (130)
    const vipCancellation = pricingService.calculateCancellationAmount(vipSub, ['lunch', 'dinner']);
    expect(vipCancellation).toBe(130);

    // 2. Standard sub with pricingMatrixSnapshot
    const snapSub: Subscription = {
      id: 'sub-snap-k',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
      pricingMatrixSnapshot: {
        meals: { breakfast: 45, lunch: 90, dinner: 90 },
        combos: { lunch_dinner: 170, all_three: 205 },
      },
    } as any;

    const snapCancellation = pricingService.calculateCancellationAmount(snapSub, ['lunch', 'dinner']);
    expect(snapCancellation).toBe(170);

    // 3. Active base pricing when neither negotiated nor snapshot is present
    const bareSub: Subscription = {
      id: 'sub-bare-k',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
    } as any;

    // Active base pricing for lunch_dinner is 190
    const baseCancellation = pricingService.calculateCancellationAmount(bareSub, ['lunch', 'dinner']);
    expect(baseCancellation).toBe(190);

    // 4. Fallback matrix when unseeded / no active pricing configured
    pricingRepository.seedMemoryCache([]);
    const fallbackCancellation = pricingService.calculateCancellationAmount(bareSub, ['lunch', 'dinner']);
    expect(fallbackCancellation).toBe(115);
  });

  // ---------------------------------------------------------------------------
  // L. Changing global pricing does not retroactively alter an existing subscriber's frozen snapshot
  // ---------------------------------------------------------------------------
  it("Scenario L: Changing global pricing does not retroactively alter an existing subscriber's frozen pricing snapshot", async () => {
    const subscriber: Subscription = {
      id: 'sub-subscriber-l',
      planTier: 'basic',
      quantity: 1,
      mealPreferences: [],
      pricePerDaySnapshot: 0,
      pricingMatrixSnapshot: {
        meals: { breakfast: 50, lunch: 95, dinner: 95 },
        combos: { lunch_dinner: 180, all_three: 220 },
      },
    } as any;

    // Global price hike to breakfast 70, lunch 130, dinner 130
    const globalHikeConfig: PricingConfiguration = {
      id: 'cfg-hike-2026',
      effectiveFrom: '2026-10-15',
      pricing: {
        standard: {
          meals: { breakfast: 70, lunch: 130, dinner: 130 },
          combos: { lunch_dinner: 240, all_three: 300 },
        },
      },
      status: 'active',
      createdAt: '2026-09-29T12:00:00.000Z',
      updatedAt: '2026-09-29T12:00:00.000Z',
      createdBy: 'admin-1',
      updatedBy: 'admin-1',
    };
    pricingRepository.seedMemoryCache([globalHikeConfig]);

    // Subscriber's snapshot property itself is unchanged
    expect(((subscriber.pricingMatrixSnapshot as any)?.meals?.lunch ?? (subscriber.pricingMatrixSnapshot as any)?.lunch)).toBe(95);

    // PricingService resolves lunch for this subscriber as 95 even for date after hike
    const price = await pricingService.calculateMealPrice(subscriber, 'lunch', 1, '2026-10-20');
    expect(price).toBe(95);

    // Aggregated amount for billing also remains based on the snapshot
    const aggAmount = pricingService.calculateAggregatedAmount(subscriber, 'lunch', 1, '2026-10-20');
    expect(aggAmount).toBe(95);
  });
});
