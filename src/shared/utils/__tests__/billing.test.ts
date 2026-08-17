import { describe, it, expect } from 'vitest';
import { calculateAccruedBill } from '../billing';
import type { Subscription, Order } from '@/shared/types';

describe('calculateAccruedBill', () => {
  const basicPricing = {
    breakfast: 60,
    lunch: 65,
    dinner: 65,
    breakfast_lunch: 115,
    lunch_dinner: 115,
    breakfast_dinner: 115,
    breakfast_lunch_dinner: 159
  };

  const regularPricing = {
    breakfast: 60,
    lunch: 85,
    dinner: 85,
    breakfast_lunch: 140,
    lunch_dinner: 140,
    breakfast_dinner: 140,
    breakfast_lunch_dinner: 210
  };

  const createSub = (pricingMatrixSnapshot?: any, quantity: number = 1): Subscription => ({
    id: 'sub_1',
    pricingMatrixSnapshot,
    quantity,
    // Provide dummy values for other required fields
  } as unknown as Subscription);

  const createOrder = (mealType: string, date: string, status: string, price: number = 50): Order => ({
    id: `ord_${Math.random()}`,
    subscriptionId: 'sub_1',
    mealType,
    date,
    status,
    price,
  } as unknown as Order);

  it('Basic B+L+D -> ₹159', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(159);
  });

  it('Basic B+L -> ₹115', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(115);
  });

  it('Basic B -> ₹60', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(60);
  });

  it('Basic L+D -> ₹115', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(115);
  });

  it('Regular B+L+D -> ₹210', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(210);
  });

  it('Regular B+L -> ₹140', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(140);
  });

  it('Regular B -> ₹60', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(60);
  });

  it('Regular L+D -> ₹140', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(140);
  });

  it('all meals cancelled before cutoff -> ₹0', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'cancelled'),
      createOrder('lunch', '2026-08-17', 'cancelled'),
      createOrder('dinner', '2026-08-17', 'cancelled'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(0);
  });

  it('Cancel D before cutoff -> B + L -> ₹115', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'cancelled'), // Cancelled dinner before cutoff
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(115);
  });

  it('Cancel L + D before cutoff -> B -> ₹60', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'cancelled'),
      createOrder('dinner', '2026-08-17', 'cancelled'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(60);
  });

  it('Cancel L + D before cutoff -> B -> ₹60 (Regular)', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'cancelled'),
      createOrder('dinner', '2026-08-17', 'cancelled'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(60);
  });

  it('Cancel D after cutoff -> B + L + D -> ₹159 (Basic)', () => {
    const sub = createSub(basicPricing);
    // Late cancellation doesn't get marked as 'cancelled' (kitchen lock prevents it).
    // It is a chargeable status (like 'failed_delivery' or left as 'delivered').
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'failed_delivery'), // chargeable
    ];
    // Chargeable for B+L+D
    expect(calculateAccruedBill(orders, sub)).toBe(159);
  });

  it('Cancel D after cutoff -> ₹210 (Regular)', () => {
    const sub = createSub(regularPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'failed_delivery'), // chargeable
    ];
    // Chargeable for B+L+D
    expect(calculateAccruedBill(orders, sub)).toBe(210);
  });

  it('Quantity 2: Basic B + L -> ₹115 × 2 = ₹230', () => {
    const sub = createSub(basicPricing, 2);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(230);
  });

  it('Quantity 2: Regular B -> ₹60 × 2 = ₹120', () => {
    const sub = createSub(regularPricing, 2);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(120);
  });

  it('Legacy Subscription: pricingMatrixSnapshot missing, creditBalance exists -> old fallback works and credit ignored', () => {
    const sub = {
      ...createSub(undefined, 2),
      creditBalance: 1500 // Existing historical value
    } as Subscription;
    const orders = [
      createOrder('lunch', '2026-08-17', 'delivered', 80),
      createOrder('dinner', '2026-08-17', 'delivered', 80),
    ];
    // Fallback: sum of individual prices = 160. Quantity = 2. Total = 320.
    // The creditBalance (1500) is completely ignored in this pure actuals calculation.
    expect(calculateAccruedBill(orders, sub)).toBe(320);
  });

  it('multiple billing dates', () => {
    const sub = createSub(basicPricing);
    const orders = [
      // Day 1: B+L+D = 159
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('lunch', '2026-08-17', 'delivered'),
      createOrder('dinner', '2026-08-17', 'delivered'),
      // Day 2: L+D = 115
      createOrder('lunch', '2026-08-18', 'delivered'),
      createOrder('dinner', '2026-08-18', 'delivered'),
      createOrder('breakfast', '2026-08-18', 'cancelled'), // Cancelled
      // Day 3: scheduled (not chargeable) = 0
      createOrder('lunch', '2026-08-19', 'scheduled'),
    ];
    expect(calculateAccruedBill(orders, sub)).toBe(159 + 115);
  });

  it('no duplicate charging for the same meal/date', () => {
    const sub = createSub(basicPricing);
    const orders = [
      createOrder('breakfast', '2026-08-17', 'delivered'),
      createOrder('breakfast', '2026-08-17', 'delivered'), // duplicate
      createOrder('lunch', '2026-08-17', 'delivered'),
    ];
    // Deduplicated to B+L = 115
    expect(calculateAccruedBill(orders, sub)).toBe(115);
  });
});
