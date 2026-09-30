/**
 * PricingService — calculateCancellationAmount unit tests (Phase C2)
 *
 * Each test proves that a set of cancelled meals resolves to the correct
 * monetary amount through the canonical PricingService resolution chain:
 *
 *   pricingMatrixSnapshot  ->  FALLBACK_MATRIX  ->  pricePerDaySnapshot
 *
 * No test merely asserts the method was called — every test asserts the
 * actual numeric result.
 */
import { describe, it, expect } from 'vitest';
import { pricingService } from '../pricingService';
import type { Subscription } from '@/shared/types';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSub(overrides: Partial<any> = {}): Subscription {
  return {
    id: 'test-sub',
    planTier: 'basic',
    quantity: 1,
    mealPreferences: [],
    pricePerDaySnapshot: 0,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Empty / guard
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – guard cases', () => {
  it('returns 0 when cancelledMeals is empty', () => {
    const sub = makeSub({ planTier: 'basic' });
    expect(pricingService.calculateCancellationAmount(sub, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FALLBACK_MATRIX — basic tier
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – fallback matrix (basic tier)', () => {
  const sub = makeSub({ planTier: 'basic', quantity: 1 });

  it('breakfast only → 60', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast'])).toBe(60);
  });

  it('lunch only → 65', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['lunch'])).toBe(65);
  });

  it('dinner only → 65', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['dinner'])).toBe(65);
  });

  it('breakfast + lunch → 115', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'lunch'])).toBe(115);
  });

  it('lunch + dinner → 115', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['lunch', 'dinner'])).toBe(115);
  });

  it('breakfast + dinner → 115', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'dinner'])).toBe(115);
  });

  it('breakfast + lunch + dinner → 159', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'lunch', 'dinner'])).toBe(159);
  });

  it('meal order in input does not matter (dinner first)', () => {
    // Input order should be normalised to canonical order internally.
    expect(pricingService.calculateCancellationAmount(sub, ['dinner', 'breakfast'])).toBe(115);
  });
});

// ---------------------------------------------------------------------------
// FALLBACK_MATRIX — regular tier
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – fallback matrix (regular tier)', () => {
  const sub = makeSub({ planTier: 'regular', quantity: 1 });

  it('lunch only → 85', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['lunch'])).toBe(85);
  });

  it('breakfast + lunch + dinner → 210', () => {
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'lunch', 'dinner'])).toBe(210);
  });
});

// ---------------------------------------------------------------------------
// Quantity scaling
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – quantity > 1', () => {
  it('basic breakfast, quantity 2 → 60 * 2 = 120', () => {
    const sub = makeSub({ planTier: 'basic', quantity: 2 });
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast'])).toBe(120);
  });

  it('basic lunch+dinner, quantity 3 → 115 * 3 = 345', () => {
    const sub = makeSub({ planTier: 'basic', quantity: 3 });
    expect(pricingService.calculateCancellationAmount(sub, ['lunch', 'dinner'])).toBe(345);
  });
});

// ---------------------------------------------------------------------------
// pricingMatrixSnapshot — subscriber-specific pricing
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – pricingMatrixSnapshot (authoritative)', () => {
  it('uses snapshot value for breakfast, ignores fallback', () => {
    const sub = makeSub({
      planTier: 'basic',
      quantity: 1,
      pricingMatrixSnapshot: { breakfast: 75, lunch: 90, breakfast_lunch: 160 },
    });
    // Snapshot breakfast = 75, fallback = 60 → must use 75.
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast'])).toBe(75);
  });

  it('uses snapshot composite key for breakfast+lunch', () => {
    const sub = makeSub({
      planTier: 'basic',
      quantity: 1,
      pricingMatrixSnapshot: { breakfast: 75, lunch: 90, breakfast_lunch: 160 },
    });
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'lunch'])).toBe(160);
  });

  it('snapshot with quantity 2', () => {
    const sub = makeSub({
      planTier: 'basic',
      quantity: 2,
      pricingMatrixSnapshot: { dinner: 80 },
    });
    expect(pricingService.calculateCancellationAmount(sub, ['dinner'])).toBe(160);
  });


});

// ---------------------------------------------------------------------------
// pricePerDaySnapshot legacy fallback
// ---------------------------------------------------------------------------
describe('calculateCancellationAmount – pricePerDaySnapshot fallback', () => {
  it('full bundle cancellation uses pricePerDaySnapshot when no matrix snapshot', () => {
    const sub = makeSub({
      planTier: 'basic',
      quantity: 1,
      pricePerDaySnapshot: 150,
      mealPreferences: [
        { mealType: 'breakfast' },
        { mealType: 'lunch' },
        { mealType: 'dinner' },
      ],
    });
    // Cancelling ALL preferred meals — key === fullKey — so pricePerDaySnapshot is used.
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast', 'lunch', 'dinner'])).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Distinct concepts: cancellationAmount ≠ remainingPrice
// ---------------------------------------------------------------------------
describe('C2 concept distinction: cancellationAmount vs remainingPrice', () => {
  /**
   * Scenario: subscription has breakfast + lunch.
   * Customer cancels breakfast.
   * remainingPrice (via calculateAggregatedAmount for "lunch") must NOT equal
   * cancellationAmount (via calculateCancellationAmount for "breakfast").
   */
  it('cancellationAmount (breakfast only) differs from remainingPrice (lunch only)', () => {
    const sub = makeSub({ planTier: 'basic', quantity: 1 });
    const cancellationAmount = pricingService.calculateCancellationAmount(sub, ['breakfast']);
    const remainingPrice = pricingService.calculateAggregatedAmount(sub, 'lunch', 1);
    // breakfast=60, lunch=65 — they are different.
    expect(cancellationAmount).toBe(60);
    expect(remainingPrice).toBe(65);
    expect(cancellationAmount).not.toBe(remainingPrice);
  });

  it('cancellationAmount (lunch+dinner) differs from remainingPrice (breakfast)', () => {
    const sub = makeSub({ planTier: 'regular', quantity: 1 });
    const cancellationAmount = pricingService.calculateCancellationAmount(sub, ['lunch', 'dinner']);
    const remainingPrice = pricingService.calculateAggregatedAmount(sub, 'breakfast', 1);
    // lunch_dinner=140, breakfast=60.
    expect(cancellationAmount).toBe(140);
    expect(remainingPrice).toBe(60);
    expect(cancellationAmount).not.toBe(remainingPrice);
  });
});

// ---------------------------------------------------------------------------
// Canonical Precedence: negotiatedPricing -> pricingMatrixSnapshot -> FALLBACK_MATRIX
// ---------------------------------------------------------------------------
describe('PricingService — Canonical Precedence', () => {
  it('precedence: negotiatedPricing overrides pricingMatrixSnapshot and fallback', () => {
    const sub = makeSub({
      planTier: 'regular',
      quantity: 1,
      pricingMatrixSnapshot: { lunch: 90 },
      negotiatedPricing: { lunch: 100 },
    });
    // Fallback regular lunch is 85, snapshot is 90, negotiated is 100 -> must resolve to 100
    expect(pricingService.calculateCancellationAmount(sub, ['lunch'])).toBe(100);
  });

  it('precedence: pricingMatrixSnapshot overrides fallback when negotiated is absent', () => {
    const sub = makeSub({
      planTier: 'regular',
      quantity: 1,
      pricingMatrixSnapshot: { lunch: 95 },
    });
    // Fallback regular lunch is 85, snapshot is 95 -> must resolve to 95
    expect(pricingService.calculateCancellationAmount(sub, ['lunch'])).toBe(95);
  });

  it('precedence: fallback matrix is used when neither negotiated nor snapshot specifies the meal', () => {
    const sub = makeSub({
      planTier: 'regular',
      quantity: 1,
      pricingMatrixSnapshot: { breakfast: 50 }, // only breakfast in snapshot
      negotiatedPricing: {},
    });
    // breakfast uses snapshot (50), lunch falls back to regular fallback (85)
    expect(pricingService.calculateCancellationAmount(sub, ['breakfast'])).toBe(50);
    expect(pricingService.calculateCancellationAmount(sub, ['lunch'])).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// Add-on Catalog & Pricing
// ---------------------------------------------------------------------------
describe('PricingService — Add-on Catalog & Authoritative Pricing', () => {
  it('retrieves available add-ons with optional meal slot filter', () => {
    const all = pricingService.getAvailableAddons();
    expect(all.length).toBeGreaterThanOrEqual(6);

    const lunchAddons = pricingService.getAvailableAddons('lunch');
    expect(lunchAddons.some((a) => a.id === 'addon_paneer')).toBe(true);
    expect(lunchAddons.every((a) => a.validMealSlots.includes('lunch'))).toBe(true);

    const breakfastAddons = pricingService.getAvailableAddons('breakfast');
    expect(breakfastAddons.some((a) => a.id === 'addon_vada')).toBe(true);
    expect(breakfastAddons.every((a) => a.validMealSlots.includes('breakfast'))).toBe(true);
  });

  it('finds active add-on by id', () => {
    const paneer = pricingService.getAddonById('addon_paneer');
    expect(paneer).toBeDefined();
    expect(paneer?.name).toBe('Paneer Add-on');
    expect(paneer?.unitPrice).toBe(40);
  });

  it('calculates authoritative add-on price: total = unit price * quantity', () => {
    // addon_paneer is 40
    const res1 = pricingService.calculateAddonPrice('addon_paneer', 1);
    expect(res1.unitPrice).toBe(40);
    expect(res1.total).toBe(40);

    const res2 = pricingService.calculateAddonPrice('addon_paneer', 2);
    expect(res2.unitPrice).toBe(40);
    expect(res2.total).toBe(80);

    const res5 = pricingService.calculateAddonPrice('addon_paneer', 5);
    expect(res5.unitPrice).toBe(40);
    expect(res5.total).toBe(200);

    // addon_vada is 25
    const resVada = pricingService.calculateAddonPrice('addon_vada', 2);
    expect(resVada.unitPrice).toBe(25);
    expect(resVada.total).toBe(50);
  });

  it('throws for invalid add-on or quantity <= 0', () => {
    expect(() => pricingService.calculateAddonPrice('addon_paneer', 0)).toThrow(/positive integer/);
    expect(() => pricingService.calculateAddonPrice('addon_paneer', -1)).toThrow(/positive integer/);
    expect(() => pricingService.calculateAddonPrice('non_existent', 1)).toThrow(/not found/);
  });
});

