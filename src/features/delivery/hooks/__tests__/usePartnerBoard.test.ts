import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePartnerBoard } from '../usePartnerBoard';
import { orderRepository } from '@/shared/services/firestore/orderRepository';


// Mock React
vi.mock('react', () => ({
  useState: vi.fn((init) => [init, vi.fn()]),
  useEffect: vi.fn(),
  useMemo: vi.fn((cb) => cb()),
}));

// Mock React Query
vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config) => {
    return { mutateAsync: config.mutationFn };
  }),
}));

// Mock repositories and services
vi.mock('@/shared/services/firestore/orderRepository', () => ({
  orderRepository: {
    update: vi.fn(),
    getById: vi.fn().mockResolvedValue({ customerId: 'cust-1', mealType: 'lunch' }),
  },
}));

vi.mock('@/shared/services/firestore/deliveryRepository', () => ({
  deliveryRepository: {
    subscribePartnerOrders: vi.fn(),
  }
}));

vi.mock('@/shared/services/firestore/dailyDeliveryRepository', () => ({
  dailyDeliveryRepository: {
    subscribeDriverSession: vi.fn(),
    updateDriverSession: vi.fn(),
  }
}));

vi.mock('@/shared/services/firestore/auditRepository', () => ({
  auditRepository: {
    logAction: vi.fn(),
  },
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'driver-1', displayName: 'Driver' } })),
}));

vi.mock('@/shared/services/firestore/notificationService', () => ({
  notifyOrderOutForDelivery: vi.fn().mockResolvedValue(undefined),
  notifyOrderDelivered: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryFailed: vi.fn().mockResolvedValue(undefined),
}));

describe('usePartnerBoard mutation payload', () => {
  let board: ReturnType<typeof usePartnerBoard>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-initialize hook to capture the mutation config
    board = usePartnerBoard('driver-1', '2026-08-01');
  });

  it('persists outForDeliveryAt when status is out_for_delivery', async () => {
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'out_for_delivery',
    });

    const updateCall = vi.mocked(orderRepository.update).mock.calls[0];
    expect(updateCall[0]).toBe('ord-1');
    const payload = updateCall[1] as any;
    
    expect(payload.status).toBe('out_for_delivery');
    expect(payload.outForDeliveryAt).toBeDefined();
    expect(payload.updatedAt).toBeDefined();
    expect(payload.deliveredAt).toBeUndefined();
  });

  it('persists deliveredAt when status is delivered', async () => {
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'delivered',
    });

    const updateCall = vi.mocked(orderRepository.update).mock.calls[0];
    const payload = updateCall[1] as any;
    
    expect(payload.status).toBe('delivered');
    expect(payload.deliveredAt).toBeDefined();
    expect(payload.outForDeliveryAt).toBeUndefined(); 
  });

  it('preserves existing deliveryResult behavior', async () => {
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'failed_delivery',
      deliveryResult: { reasonCode: 'customer_unavailable', notes: 'Knocked twice' }
    });

    const updateCall = vi.mocked(orderRepository.update).mock.calls[0];
    const payload = updateCall[1] as any;
    
    expect(payload.status).toBe('failed_delivery');
    expect(payload.deliveryResult).toEqual({ reasonCode: 'customer_unavailable', notes: 'Knocked twice' });
    expect(payload.deliveredAt).toBeUndefined();
    expect(payload.outForDeliveryAt).toBeUndefined();
  });
});
