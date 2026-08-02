import type { Order, CustomerProfile, Subscription } from '@/shared/types';

export const createMockOrder = (overrides?: Partial<Order>): Order => ({
  id: 'mock-order-id',
  customerId: 'mock-customer-id',
  date: '2026-08-01',
  mealType: 'lunch',
  status: 'scheduled',
  source: 'subscription',
  itemsLabel: 'South Indian Meals',
  items: [{ id: 'item1', name: 'South Indian Meals', quantity: 1, price: 100 }],
  subtotal: 100,
  tax: 5,
  deliveryFee: 10,
  total: 115,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  paymentStatus: 'pending',
  ...overrides,
} as any);

export const createMockCustomer = (overrides?: Partial<CustomerProfile>): CustomerProfile => ({
  id: 'mock-customer-id',
  displayId: 'MP-C001',
  fullName: 'Test Customer',
  phoneNumber: '9876543210',
  role: 'customer',
  isActive: true,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  ...overrides,
} as any);

export const createMockSubscription = (overrides?: Partial<Subscription>): Subscription => ({
  id: 'mock-sub-id',
  customerId: 'mock-customer-id',
  planId: 'plan-1',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  status: 'active',
  mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'opt1' }],
  pricePerDaySnapshot: 100,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  ...overrides,
} as any);
