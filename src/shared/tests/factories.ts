import type {
  CustomerProfile,
  DeliveryPartnerProfile,
  Subscription,
  Order,
  DeliveryZone,
  Timestamp,
} from '../types';

export const TimestampFactory = {
  create: (date: Date = new Date()): Timestamp => ({
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime(),
    toJSON: () => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0, type: 'Timestamp' }),
    isEqual: (other: Timestamp) => other.seconds === Math.floor(date.getTime() / 1000),
    valueOf: () => date.getTime().toString()
  }),
};

export const CustomerFactory = {
  create: (overrides?: Partial<CustomerProfile>): CustomerProfile => ({
    id: `cust-${Math.random().toString(36).substring(7)}`,
    role: 'customer',
    fullName: 'Test Customer',
    email: 'test@customer.com',
    phone: '+919999999999',
    photoUrl: null,
    isActive: true,
    createdAt: TimestampFactory.create(),
    updatedAt: TimestampFactory.create(),
    addresses: [
      {
        id: 'addr-1',
        label: 'Home',
        line1: '123 Main St',
        city: 'Mysuru',
        state: 'Karnataka',
        pincode: '570001',
        lat: 12.2958,
        lng: 76.6394,
        isDefault: true,
      }
    ],
    defaultAddressId: 'addr-1',
    ...overrides,
  }),
};

export const SubscriptionFactory = {
  create: (overrides?: Partial<Subscription>): Subscription => ({
    id: `sub-${Math.random().toString(36).substring(7)}`,
    customerId: 'cust-1',
    planId: 'plan-basic',
    planTier: 'basic',
    quantity: 1,
    pricePerDaySnapshot: 150,
    deliveryAddressId: 'addr-1',
    zoneId: null,
    mealPreferences: [{ mealType: 'lunch', selectedOptionId: 'veg-thali' }],
    status: 'active',
    startDate: new Date().toISOString().split('T')[0],
    endDate: null,
    billingCycle: 'monthly',
    autoRenew: true,
    latestPaymentId: 'pay-1',
    creditBalance: 0,
    depositAmount: 500,
    createdAt: TimestampFactory.create(),
    updatedAt: TimestampFactory.create(),
    ...overrides,
  }),
};

export const OrderFactory = {
  create: (overrides?: Partial<Order>): Order => ({
    id: `ord-${Math.random().toString(36).substring(7)}`,
    source: 'subscription',
    customerId: 'cust-1',
    subscriptionId: 'sub-1',
    planTier: 'basic',
    mealType: 'lunch',
    date: new Date().toISOString().split('T')[0],
    itemsLabel: 'Standard Veg Lunch',
    selectedOptionId: 'veg-thali',
    price: 150,
    currency: 'INR',
    status: 'scheduled',
    deliveryAddressId: 'addr-1',
    zoneId: null,
    kitchenId: 'k1',
    deliveryPartnerId: null,
    deliveryWindow: { start: '12:00', end: '13:00' },
    paymentId: null,
    createdAt: TimestampFactory.create(),
    updatedAt: TimestampFactory.create(),
    ...overrides,
  }),
};

export const DriverFactory = {
  create: (overrides?: Partial<DeliveryPartnerProfile>): DeliveryPartnerProfile => ({
    id: `drv-${Math.random().toString(36).substring(7)}`,
    role: 'delivery_partner',
    fullName: 'Test Driver',
    email: 'driver@test.com',
    phone: '+918888888888',
    photoUrl: null,
    isActive: true,
    zoneIds: [],
    vehicleType: 'bike',
    isAvailable: true,
    currentLocation: null,
    createdAt: TimestampFactory.create(),
    updatedAt: TimestampFactory.create(),
    ...overrides,
  }),
};

export const ZoneFactory = {
  create: (overrides?: Partial<DeliveryZone>): DeliveryZone => ({
    id: `zone-${Math.random().toString(36).substring(7)}`,
    name: 'North Mysuru',
    city: 'Mysuru',
    pincodes: ['570001'],
    boundary: null,
    kitchenId: 'kitchen-1',
    isActive: true,
    createdAt: TimestampFactory.create(),

    ...overrides,
  }),
};
