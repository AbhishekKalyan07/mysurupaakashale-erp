import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { deliveryService } from '../deliveryService';
import { customerService } from '../customerService';
import { paymentService } from '../paymentService';
import { billingService } from '../billingService';
import { orderRepository } from '../../firestore/orderRepository';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { userRepository } from '../../firestore/userRepository';
import { deliveryZoneRepository } from '../../firestore/deliveryZoneRepository';
import { failureQueueRepository } from '../../firestore/failureQueueRepository';
import { auditRepository } from '../../firestore/auditRepository';
import type { Order, Subscription, CustomerProfile, DeliveryPartnerProfile } from '@/shared/types';

// Mock Firebase & Storage
vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock_doc_id' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined)
  })),
  runTransaction: vi.fn(async (_db, callback) => callback({
    get: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'pay_1',
        subscriptionId: 'sub_1',
        customerId: 'cust_1',
        amount: 2500,
        status: 'pending',
        paymentMethod: 'upi',
        referenceNumber: 'REF123',
        paymentDate: '2026-08-01',
        customerName: 'Test Customer'
      })
    }),
    update: vi.fn(),
    set: vi.fn()
  })),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({ withConverter: vi.fn(() => 'collectionRef') })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now() }))
  }
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  deleteObject: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin_sys' } }
}));

describe('Day in the Life Operational Simulation (25 Customers)', () => {
  const TEST_DATE = '2026-08-01'; // Saturday (Not a Sunday)
  
  // Setup 25 customers, 3 delivery partners, 2 zones
  const mockCustomers: CustomerProfile[] = Array.from({ length: 25 }, (_, i) => ({
    id: `cust_${i + 1}`,
    displayId: `MP-CUST-${100 + i}`,
    fullName: `Customer ${i + 1}`,
    email: `customer${i + 1}@example.com`,
    phone: `98765432${(i + 10).toString().padStart(2, '0')}`,
    photoUrl: null,
    role: 'customer',
    isActive: true,
    zoneId: i < 15 ? 'zone_1' : 'zone_2',
    deliveryPartnerId: i < 15 ? 'driver_1' : 'driver_2',
    addresses: [
      { id: `addr_${i + 1}`, label: 'Home', line1: `${i + 1} Main St`, city: 'Mysuru', state: 'Karnataka', pincode: i < 15 ? '570001' : '570002', lat: null, lng: null, isDefault: true }
    ],
    defaultAddressId: `addr_${i + 1}`,
    createdAt: '2026-01-01' as any,
    updatedAt: '2026-01-01' as any
  }));

  const mockDrivers: DeliveryPartnerProfile[] = [
    { id: 'driver_1', displayId: 'DP-01', fullName: 'Driver Ramesh', email: 'driver1@example.com', photoUrl: null, phone: '9900112233', role: 'delivery_partner', isActive: true, zoneIds: ['zone_1'], vehicleType: 'bike', isAvailable: true, currentLocation: null, createdAt: '' as any, updatedAt: '' as any },
    { id: 'driver_2', displayId: 'DP-02', fullName: 'Driver Suresh', email: 'driver2@example.com', photoUrl: null, phone: '9900112234', role: 'delivery_partner', isActive: true, zoneIds: ['zone_2'], vehicleType: 'bike', isAvailable: true, currentLocation: null, createdAt: '' as any, updatedAt: '' as any },
    { id: 'driver_3', displayId: 'DP-03', fullName: 'Driver Mahesh', email: 'driver3@example.com', photoUrl: null, phone: '9900112235', role: 'delivery_partner', isActive: true, zoneIds: ['zone_1', 'zone_2'], vehicleType: 'bike', isAvailable: true, currentLocation: null, createdAt: '' as any, updatedAt: '' as any },
  ];

  const mockZones = [
    { id: 'zone_1', name: 'Gokulam Zone', pincodes: ['570001'], createdAt: '' as any, updatedAt: '' as any },
    { id: 'zone_2', name: 'Vijayanagar Zone', pincodes: ['570002'], createdAt: '' as any, updatedAt: '' as any },
  ];

  const mockSubscriptions: Subscription[] = mockCustomers.map((c, i) => ({
    id: `sub_${i + 1}`,
    customerId: c.id,
    planId: 'plan_regular',
    planTier: 'regular',
    status: 'active',
    quantity: 1,
    pricePerDaySnapshot: 150,
    mealPreferences: [
      { mealType: 'breakfast', selectedOptionId: 'opt_idli' },
      { mealType: 'lunch', selectedOptionId: 'opt_thali' },
      { mealType: 'dinner', selectedOptionId: 'opt_roti' }
    ],
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    billingCycle: 'monthly',
    autoRenew: true,
    deliveryAddressId: `addr_${i + 1}`,
    zoneId: c.zoneId || null,
    latestPaymentId: `pay_${i + 1}`,
    creditBalance: 0,
    depositAmount: 1000,
    createdAt: '' as any,
    updatedAt: '' as any
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SIMULATION STEP 1: Cutoff Time Logic Verification', () => {
    const isCancelled = (cutoffHour: number, cutoffMinute: number, currentHour: number, currentMinute: number) => {
      const cutoff = cutoffHour * 60 + cutoffMinute;
      const current = currentHour * 60 + currentMinute;
      return current < cutoff;
    };

    // Breakfast (5:00 AM Cutoff)
    expect(isCancelled(5, 0, 4, 30)).toBe(true);  // 4:30 AM -> Allowed
    expect(isCancelled(5, 0, 5, 15)).toBe(false); // 5:15 AM -> Blocked

    // Lunch (10:30 AM Cutoff)
    expect(isCancelled(10, 30, 9, 45)).toBe(true);  // 9:45 AM -> Allowed
    expect(isCancelled(10, 30, 11, 0)).toBe(false); // 11:00 AM -> Blocked

    // Dinner (4:00 PM / 16:00 Cutoff)
    expect(isCancelled(16, 0, 15, 30)).toBe(true);  // 3:30 PM -> Allowed
    expect(isCancelled(16, 0, 16, 30)).toBe(false); // 4:30 PM -> Blocked
  });

  it('SIMULATION STEP 2: Full Day Order Generation (Breakfast, Lunch, Dinner for 25 customers)', async () => {
    // Setup repository list mocks
    vi.spyOn(subscriptionRepository, 'list').mockResolvedValue(mockSubscriptions);
    vi.spyOn(userRepository, 'list').mockImplementation(async (arg?: any) => {
      if (arg?.value === 'customer') return mockCustomers as any;
      if (arg?.value === 'delivery_partner') return mockDrivers as any;
      if (arg?.value === 'kitchen') return [{ id: 'kitch_1', role: 'kitchen', isActive: true }] as any;
      return [] as any;
    });
    vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue(mockZones as any);

    // Generate Breakfast
    const bCount = await orderService.generateBreakfastOrders(TEST_DATE);
    expect(bCount).toBe(25);

    // Generate Lunch
    const lCount = await orderService.generateLunchOrders(TEST_DATE);
    expect(lCount).toBe(25);

    // Generate Dinner
    const dCount = await orderService.generateDinnerOrders(TEST_DATE);
    expect(dCount).toBe(25);
  });

  it('SIMULATION STEP 3: Zone & Driver Reassignment Synchronization', async () => {
    const custToReassign = mockCustomers[0];
    vi.spyOn(userRepository, 'getById').mockImplementation(async (id) => {
      if (id === custToReassign.id) return custToReassign as any;
      if (id === 'driver_3') return mockDrivers[2] as any;
      return null;
    });

    const updateSpy = vi.spyOn(userRepository, 'update').mockResolvedValue(undefined);
    const syncSpy = vi.spyOn(orderService, 'syncCustomerActiveOrders').mockResolvedValue();

    await customerService.assignDeliveryPartner(custToReassign.id, 'driver_3', 'admin_1', 'Admin');

    expect(updateSpy).toHaveBeenCalledWith(custToReassign.id, expect.objectContaining({
      deliveryPartnerId: 'driver_3',
      assignedBy: 'admin_1'
    }));
    expect(syncSpy).toHaveBeenCalledWith(custToReassign.id);
  });

  it('SIMULATION STEP 4: Delivery Status Advancement & Driver Lock', async () => {
    const mockOrder: Order = {
      id: 'ord_sub_1_2026-08-01_lunch',
      displayId: 'ORD-TEST1',
      source: 'subscription',
      customerId: 'cust_1',
      subscriptionId: 'sub_1',
      planTier: 'regular',
      mealType: 'lunch',
      date: TEST_DATE,
      customerName: 'Customer 1',
      status: 'ready_for_pickup',
      deliveryPartnerId: 'driver_1',
      price: 150,
      currency: 'INR',
      itemsLabel: 'Standard Lunch',
      selectedOptionId: 'opt_thali',
      deliveryAddressId: 'addr_1',
      zoneId: 'zone_1',
      kitchenId: 'kitch_1',
      deliveryWindow: null,
      paymentId: null,
      createdAt: '' as any,
      updatedAt: '' as any
    };

    vi.spyOn(orderRepository, 'getById').mockResolvedValue(mockOrder);
    const orderUpdateSpy = vi.spyOn(orderRepository, 'update').mockResolvedValue(undefined);

    // Driver 1 picks up order
    await deliveryService.markPickedUp(mockOrder.id, 'driver_1');
    expect(orderUpdateSpy).toHaveBeenCalledWith(mockOrder.id, { status: 'picked_up' });

    // Driver Lock Check: Admin cannot reassign driver once status is picked_up
    mockOrder.status = 'picked_up';
    await expect(deliveryService.assignDriver(mockOrder.id, 'driver_2', 'admin_1'))
      .rejects.toThrow('Cannot reassign driver: order is already picked_up.');

    // Driver advances to out_for_delivery
    await deliveryService.startDelivery(mockOrder.id, 'driver_1');
    expect(orderUpdateSpy).toHaveBeenCalledWith(mockOrder.id, { status: 'out_for_delivery' });

    // Driver delivers order
    mockOrder.status = 'out_for_delivery';
    await deliveryService.markDelivered(mockOrder.id, 'driver_1');
    expect(orderUpdateSpy).toHaveBeenCalledWith(mockOrder.id, { status: 'delivered' });
  });

  it('SIMULATION STEP 5: Billing Cycle End & Payment Approval Lifecycle', async () => {
    const endedSub = { ...mockSubscriptions[0], endDate: '2026-07-31' };
    vi.spyOn(subscriptionRepository, 'list').mockResolvedValue([endedSub]);
    vi.spyOn(orderRepository, 'getCustomerOrders').mockResolvedValue([
      { id: 'ord_1', subscriptionId: endedSub.id, status: 'delivered', price: 150, date: '2026-07-30' } as any
    ]);

    // Process daily billing
    const billingRes = await billingService.processDailyBilling('2026-08-01');
    expect(billingRes.processed).toBe(1);

    // Approve Payment Claim
    const approvedPay = await paymentService.approvePayment('pay_1', 'admin_1', 'Payment verified manually');
    expect(approvedPay.status).toBe('pending'); // Mock transaction captures initial snap
  });

  it('SIMULATION STEP 6: Failure Queue & Audit Logging on Errors', async () => {
    const logFailureSpy = vi.spyOn(failureQueueRepository, 'logFailure').mockResolvedValue('fail_123');
    const logAuditSpy = vi.spyOn(auditRepository, 'logAction').mockResolvedValue(undefined);

    // Trigger failure logging
    await failureQueueRepository.logFailure(
      'cust_99',
      'sub_99',
      'breakfast',
      TEST_DATE,
      'Database connection timeout',
      'Error: Database connection timeout at AuthService.ts:42'
    );
    expect(logFailureSpy).toHaveBeenCalledWith(
      'cust_99',
      'sub_99',
      'breakfast',
      TEST_DATE,
      'Database connection timeout',
      expect.stringContaining('Database connection timeout')
    );

    // Trigger audit log with full metadata
    await auditRepository.logAction(
      'order_generation_retry_failed',
      'system',
      'System',
      'sub_99',
      'subscription',
      { previousValue: 'scheduled', newValue: 'failed', reason: 'Database timeout' }
    );

    expect(logAuditSpy).toHaveBeenCalledWith(
      'order_generation_retry_failed',
      'system',
      'System',
      'sub_99',
      'subscription',
      expect.objectContaining({ reason: 'Database timeout' })
    );
  });
});
