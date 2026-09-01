import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePartnerBoard } from '../usePartnerBoard';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';


// Mock React
import { useMemo } from 'react';
vi.mock('react', () => ({
  useState: vi.fn((init) => [init, vi.fn()]),
  useEffect: vi.fn((cb) => {
    const cleanup = cb();
    if (typeof cleanup === 'function') cleanup();
  }),
  useMemo: vi.fn((cb) => cb()),
}));

// Mock React Query
import { useMutation } from '@tanstack/react-query';
vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config) => {
    return { mutateAsync: config.mutationFn };
  }),
}));

// Mock repositories and services
vi.mock('@/shared/services/firestore/orderRepository', () => ({
  orderRepository: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    getById: vi.fn().mockResolvedValue({ customerId: 'cust-1', mealType: 'lunch' }),
  },
}));

vi.mock('@/shared/services/firestore/deliveryRepository', () => ({
  deliveryRepository: {
    subscribePartnerOrders: vi.fn((_partnerId, _date, _mealType, onNext) => {
      if (typeof _mealType === 'function') {
        // Fallback if called with old signature (shouldn't happen with updated hook)
        _mealType([{ id: 'ord-1', status: 'delivered' }]);
      } else if (onNext) {
        onNext([{ id: 'ord-1', status: 'delivered' }]);
      }
      return vi.fn();
    }),
  }
}));

vi.mock('@/shared/services/firestore/dailyDeliveryRepository', () => ({
  dailyDeliveryRepository: {
    subscribeDriverSession: vi.fn((_date, _partnerId, onNext) => {
      if (onNext) onNext({ status: 'in_progress' } as any);
      return vi.fn();
    }),
    updateDriverSession: vi.fn(),
  }
}));

vi.mock('@/shared/services/firestore/auditRepository', () => ({
  auditRepository: {
    logAction: vi.fn(),
  },
}));

vi.mock('@/shared/services/business/deliveryService', () => ({
  deliveryService: {
    getDeliverySummary: vi.fn().mockReturnValue({ assigned: 5, delivered: 4, failed: 1, returned: 0 })
  }
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'driver-1', displayName: 'Driver' } })),
}));

vi.mock('@/shared/services/firestore/notificationService', () => ({
  notifyOrderOutForDelivery: vi.fn().mockResolvedValue(undefined),
  notifyOrderDelivered: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  auth: {}
}));

vi.mock('firebase/firestore', () => ({
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  doc: vi.fn(),
  runTransaction: vi.fn(async (db, cb) => {
    const txn = {
      get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ outForDeliveryAt: null, deliveredAt: null }) }),
      update: vi.fn(),
      set: vi.fn()
    };
    await cb(txn);
    return txn; // return txn so we can inspect it in tests
  }),
  where: vi.fn()
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'driver-1', displayName: 'Test Driver' } }))
}));

describe('usePartnerBoard mutation payload', () => {
  let board: ReturnType<typeof usePartnerBoard>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-initialize hook to capture the mutation config
    board = usePartnerBoard('driver-1', '2026-08-01', 'breakfast');
  });

  it('handles empty partnerId or date gracefully', () => {
    const res = usePartnerBoard('', '', '');
    expect(res.orders).toEqual([]);
    expect(res.session).toBeNull();
  });

  it('persists outForDeliveryAt when status is out_for_delivery', async () => {
    const { runTransaction } = await import('firebase/firestore');
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'out_for_delivery',
    });

    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.update).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'out_for_delivery',
          outForDeliveryAt: 'SERVER_TIMESTAMP'
        })
    );
  });

  it('persists deliveredAt when status is delivered', async () => {
    const { runTransaction } = await import('firebase/firestore');
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'delivered',
    });

    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.update).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'delivered',
          deliveredAt: 'SERVER_TIMESTAMP'
        })
    );
  });

  it('preserves existing deliveryResult behavior', async () => {
    const { runTransaction } = await import('firebase/firestore');
    const result = { reasonCode: 'customer_unavailable', notes: 'Knocked twice' };
    await board.updateMutation.mutateAsync({
      orderId: 'ord-1',
      newStatus: 'failed_delivery',
      deliveryResult: result
    });

    const mockTxn = await vi.mocked(runTransaction).mock.results[0].value;
    expect(mockTxn.update).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          status: 'failed_delivery',
          deliveryResult: result
        })
    );
  });
});

import { notifyOrderOutForDelivery, notifyOrderDelivered, notifyDeliveryFailed } from '@/shared/services/firestore/notificationService';
import { dailyDeliveryRepository } from '@/shared/services/firestore/dailyDeliveryRepository';

describe('usePartnerBoard complete route & notifications', () => {
  let board: ReturnType<typeof usePartnerBoard>;
  const notifyOutMock = vi.mocked(notifyOrderOutForDelivery);
  const notifyDeliveredMock = vi.mocked(notifyOrderDelivered);
  const notifyFailedMock = vi.mocked(notifyDeliveryFailed);
  const dailyDeliveryUpdateMock = vi.mocked(dailyDeliveryRepository.updateDriverSession);

  beforeEach(() => {
    vi.clearAllMocks();
    board = usePartnerBoard('driver-1', '2026-08-01', 'lunch');
  });

  it('throws an error if completeRouteMutation is called when not all orders are terminal', async () => {
    // Override useMemo to make allTerminal false (orders returns [], allTerminal returns false)
    vi.mocked(useMemo).mockReturnValueOnce([]).mockReturnValueOnce(false); 
    
    // Mock list to return a non-terminal order
    vi.mocked(orderRepository.list).mockResolvedValueOnce([
      { id: 'ord-1', status: 'out_for_delivery' } as any
    ]);

    // Re-render hook with allTerminal=false
    const boardNotTerminal = usePartnerBoard('driver-1', '2026-08-01', 'lunch');
    
    await expect(boardNotTerminal.completeRouteMutation.mutateAsync()).rejects.toThrow('Not all orders are complete.');
  });

  it('sends notifications based on status', async () => {
    await board.updateMutation.mutateAsync({ orderId: 'ord-1', newStatus: 'out_for_delivery' });
    expect(notifyOutMock).toHaveBeenCalledWith('cust-1', 'ord-1', 'lunch');

    await board.updateMutation.mutateAsync({ orderId: 'ord-1', newStatus: 'delivered' });
    expect(notifyDeliveredMock).toHaveBeenCalledWith('cust-1', 'ord-1', 'lunch');

    await board.updateMutation.mutateAsync({ orderId: 'ord-1', newStatus: 'failed_delivery' });
    expect(notifyFailedMock).toHaveBeenCalledWith('cust-1', 'ord-1', 'lunch');
  });

  it('updates driver session on pickup', async () => {
    await board.updateMutation.mutateAsync({ orderId: 'ord-1', newStatus: 'picked_up' });
    expect(dailyDeliveryUpdateMock).toHaveBeenCalled();
    const callArgs = dailyDeliveryUpdateMock.mock.calls[0];
    expect(callArgs[0]).toBe('2026-08-01');
    expect(callArgs[1]).toBe('driver-1');
    expect(callArgs[2].status).toBe('picked_up');
  });

  it('triggers onSuccess and onError for updateMutation', () => {
    const updateConfig = vi.mocked(useMutation).mock.calls.find((c: any) => c[0].mutationFn.toString().includes('runTransaction'));
    if (updateConfig) {
      const config = updateConfig[0] as any;
      if (config.onSuccess) config.onSuccess();
      if (config.onError) config.onError(new Error('Test error'));
    }
  });

  it('triggers onSuccess and onError for completeRouteMutation', () => {
    const completeConfig = vi.mocked(useMutation).mock.calls.find((c: any) => c[0].mutationFn.toString().includes('completeRouteMutation') || c[0].mutationKey?.includes('completeRoute'));
    if (completeConfig) {
      const config = completeConfig[0] as any;
      if (config.onSuccess) config.onSuccess();
      if (config.onError) config.onError(new Error('Test error'));
    }
  });

  it('completes route successfully if allTerminal is true', async () => {
    // Override useMemo to make allTerminal true (orders returns [], allTerminal returns true)
    vi.mocked(useMemo).mockReturnValueOnce([]).mockReturnValueOnce(true); 

    vi.mocked(orderRepository.list).mockResolvedValueOnce([
      { id: 'ord-1', status: 'delivered' } as any,
      { id: 'ord-2', status: 'failed_delivery' } as any
    ]);
    
    // Re-render hook with allTerminal=true
    const boardWithTerminal = usePartnerBoard('driver-1', '2026-08-01', 'lunch');
    
    await boardWithTerminal.completeRouteMutation.mutateAsync();
    
    expect(dailyDeliveryUpdateMock).toHaveBeenCalled();
    expect(auditRepository.logAction).toHaveBeenCalledWith(
      'delivery_route_completed',
      'driver-1',
      'Test Driver',
      'driver-1',
      'route',
      expect.anything()
    );
  });
});
