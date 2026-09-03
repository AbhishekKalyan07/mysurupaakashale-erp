import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../orderService';
import { orderRepository } from '../../firestore/orderRepository';
import { subscriptionRepository } from '../../firestore/subscriptionRepository';
import { orderGenerationRunRepository } from '../../firestore/analyticsRepository';
import { userRepository } from '../../firestore/userRepository';
import { deliveryZoneRepository } from '../../firestore/deliveryZoneRepository';
import { mealPlanRepository } from '../../firestore/mealPlanRepository';
import * as notificationService from '../../firestore/notificationService';
import { auditRepository } from '../../firestore/auditRepository';
import { kitchenRepository } from '../../firestore/kitchenRepository';
import { getDoc, writeBatch } from 'firebase/firestore';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(),
    serverTimestamp: vi.fn(() => 'server-timestamp'),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    doc: vi.fn((db, collection, id, sub, subId) => ({ db, collection, id, sub, subId })),
    collection: vi.fn(() => ({ withConverter: vi.fn(() => 'collectionRef') })),
    updateDoc: vi.fn(),
  };
});

vi.mock('@/shared/lib/firebase', () => ({
  functions: {},

  db: {},
  auth: { currentUser: { uid: 'system' } }
}));

describe('Automated Delivery Partner Assignment', () => {
  let mockBatchSet: any;
  let mockBatchUpdate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(orderGenerationRunRepository, 'getById').mockResolvedValue(null);
    vi.spyOn(orderGenerationRunRepository, 'create').mockResolvedValue('run-id');
    vi.spyOn(orderGenerationRunRepository, 'update').mockResolvedValue();
    vi.spyOn(notificationService, 'notifyDailyOrdersGenerated').mockResolvedValue();
    vi.spyOn(notificationService, 'notifyAdminAlert').mockResolvedValue();
    vi.spyOn(auditRepository, 'logAction').mockResolvedValue();
    vi.spyOn(kitchenRepository, 'list').mockResolvedValue([{ id: 'k1' } as any]);
    
    // Mock getDoc for skips
    (getDoc as any).mockResolvedValue({ exists: () => false, data: () => ({}) });

    // Mock writeBatch
    mockBatchSet = vi.fn();
    mockBatchUpdate = vi.fn();
    (writeBatch as any).mockReturnValue({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn()
    });
  });

  const setupMocks = (
    customers: any[],
    partners: any[],
    todaysOrders: any[] = [],
    subscriptions: any[] = [],
    zones: any[] = [{ id: 'z1', pincodes: ['100'] }, { id: 'z2', pincodes: ['200'] }]
  ) => {
    vi.spyOn(userRepository, 'list').mockImplementation(async (q: any) => {
      if (q?.value === 'customer') return customers;
      if (q?.value === 'delivery_partner') return partners;
      if (q?.value === 'admin') return [{ id: 'admin1' }] as any;
      return [];
    });
    vi.spyOn(userRepository, 'getById').mockImplementation(async (id: string) => customers.find(c => c.id === id) || null);
    vi.spyOn(orderRepository, 'list').mockResolvedValue(todaysOrders);
    vi.spyOn(subscriptionRepository, 'list').mockResolvedValue(subscriptions);
    vi.spyOn(deliveryZoneRepository, 'list').mockResolvedValue(zones);
    vi.spyOn(mealPlanRepository, 'list').mockResolvedValue([{ id: 'plan1', mealSlots: [] }] as any);
  };

  it('TEST 1: Zone 1 + Breakfast -> Morning Partner A', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [{ id: 'pA', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast'] }],
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'breakfast' }] }]
    );
    await orderService.generateBreakfastOrders('2026-08-01');
    expect(mockBatchSet.mock.calls.length).toBe(1);
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pA');
  });

  it('TEST 2: Zone 1 + Lunch -> Afternoon Partner B', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [
        { id: 'pA', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast'] },
        { id: 'pB', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] }
      ],
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] }]
    );
    await orderService.generateLunchOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pB');
  });

  it('TEST 3: Zone 1 + Dinner -> Evening Partner A', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [
        { id: 'pA', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast', 'dinner'] },
      ],
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'dinner' }] }]
    );
    await orderService.generateDinnerOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pA');
  });

  it('TEST 4: Zone 2 + Breakfast -> correct Zone 2 partner', async () => {
    setupMocks(
      [{ id: 'c2', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '200' }] }],
      [
        { id: 'pA', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast'] },
        { id: 'pC', isActive: true, isAvailable: true, zoneIds: ['z2'], shifts: ['breakfast'] },
      ],
      [],
      [{ id: 'sub1', customerId: 'c2', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'breakfast' }] }]
    );
    await orderService.generateBreakfastOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pC');
  });

  it('TEST 5 & 6: Multiple eligible partners -> workload balancing with deterministic tie-breaker', async () => {
    setupMocks(
      [
        { id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] },
        { id: 'c2', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] },
        { id: 'c3', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] },
      ],
      [
        { id: 'p1', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] },
        { id: 'p2', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] }
      ],
      [],
      [
        { id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] },
        { id: 'sub2', customerId: 'c2', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] },
        { id: 'sub3', customerId: 'c3', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] },
      ]
    );
    await orderService.generateLunchOrders('2026-08-01');
    
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('p1');
    expect(mockBatchSet.mock.calls[1][1].deliveryPartnerId).toBe('p2');
    expect(mockBatchSet.mock.calls[2][1].deliveryPartnerId).toBe('p1');
  });

  it('TEST 7: Partner unavailable -> next eligible partner', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [
        { id: 'p1', isActive: true, isAvailable: false, zoneIds: ['z1'], shifts: ['lunch'] },
        { id: 'p2', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] }
      ],
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] }]
    );
    await orderService.generateLunchOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('p2'); 
  });

  it('TEST 8: Partner with undefined shifts -> all meals eligible', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [{ id: 'pLegacy', isActive: true, isAvailable: true, zoneIds: ['z1'] }], 
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'dinner' }] }]
    );
    await orderService.generateDinnerOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pLegacy');
  });

  it('TEST 9: No eligible partner -> null assignment + alert + audit', async () => {
    setupMocks(
      [{ id: 'c1', defaultAddressId: 'a1', addresses: [{ id: 'a1', pincode: '100' }] }],
      [], 
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] }]
    );
    await orderService.generateLunchOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBeNull();
    
    await new Promise(resolve => setTimeout(resolve, 50)); // wait for dynamic imports
    
    expect(auditRepository.logAction).toHaveBeenCalledWith('delivery_assignment_failed', expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
    expect(notificationService.notifyAdminAlert).toHaveBeenCalled();
  });

  it('TEST 12: Picked-up order -> cannot be reassigned during zone change sync', async () => {
    setupMocks(
      [{ id: 'c1', zoneId: 'z2' }],
      [{ id: 'p2', isActive: true, isAvailable: true, zoneIds: ['z2'], shifts: ['lunch'] }],
      [{ id: 'ord1', customerId: 'c1', date: '2026-08-01', status: 'picked_up', deliveryPartnerId: 'p1' }]
    );
    
    await orderService.syncCustomerActiveOrders('c1');
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it('TEST 13: Zone change before pickup -> assignment updated', async () => {
    setupMocks(
      [{ id: 'c1', zoneId: 'z2' }],
      [{ id: 'p2', isActive: true, isAvailable: true, zoneIds: ['z2'], shifts: ['lunch'] }],
      [{ id: 'ord1', customerId: 'c1', date: '2026-08-01', mealType: 'lunch', status: 'scheduled', deliveryPartnerId: 'p1', zoneId: 'z1' }]
    );
    
    await orderService.syncCustomerActiveOrders('c1');
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      deliveryPartnerId: 'p2',
      zoneId: 'z2'
    }));
  });

  it('TEST 16: Same customer Breakfast/Lunch/Dinner -> potentially different partners according to shift', async () => {
    setupMocks(
      [{ id: 'c1', zoneId: 'z1' }],
      [
        { id: 'pMorn', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast'] },
        { id: 'pAft', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] },
        { id: 'pEve', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['dinner'] },
      ],
      [],
      [{ 
        id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', 
        mealPreferences: [{ mealType: 'breakfast' }, { mealType: 'lunch' }, { mealType: 'dinner' }] 
      }]
    );
    
    await orderService.generateBreakfastOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pMorn');
    
    mockBatchSet.mockClear();
    await orderService.generateLunchOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pAft');

    mockBatchSet.mockClear();
    await orderService.generateDinnerOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pEve');
  });

  it('TEST 18 & 19: Customer deliveryPartnerId does not incorrectly override new Zone+Meal assignment', async () => {
    setupMocks(
      [{ id: 'c1', deliveryPartnerId: 'pOld', zoneId: 'z1' }], 
      [
        { id: 'pOld', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['breakfast'] },
        { id: 'pNew', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] } 
      ],
      [],
      [{ id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] }]
    );
    await orderService.generateLunchOrders('2026-08-01');
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('pNew');
  });

  it('TEST 20: One failed assignment does not stop other orders', async () => {
    setupMocks(
      [
        { id: 'c1', zoneId: 'z1' },
        { id: 'c2', zoneId: 'z2' } 
      ],
      [
        { id: 'p1', isActive: true, isAvailable: true, zoneIds: ['z1'], shifts: ['lunch'] }
      ],
      [],
      [
        { id: 'sub1', customerId: 'c1', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] },
        { id: 'sub2', customerId: 'c2', status: 'active', startDate: '2020-01-01', mealPreferences: [{ mealType: 'lunch' }] }
      ]
    );
    await orderService.generateLunchOrders('2026-08-01');
    
    expect(mockBatchSet.mock.calls.length).toBe(2);
    expect(mockBatchSet.mock.calls[0][1].deliveryPartnerId).toBe('p1');
    expect(mockBatchSet.mock.calls[1][1].deliveryPartnerId).toBeNull();
  });
});
