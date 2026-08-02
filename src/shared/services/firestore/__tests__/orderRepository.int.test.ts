import { describe, it, expect } from 'vitest';
import { orderRepository } from '../orderRepository';
import { createMockOrder } from '@/shared/utils/__tests__/factories';


describe('orderRepository (Integration)', () => {
  const testDate = '2026-08-01';

  it('creates and retrieves an order', async () => {
    const mockOrder = createMockOrder({ id: undefined, date: testDate });
    const orderId = await orderRepository.create(mockOrder);
    
    expect(orderId).toBeTruthy();

    const fetched = await orderRepository.getById(orderId);
    expect(fetched).not.toBeNull();
    expect(fetched?.date).toBe(testDate);
    expect(fetched?.id).toBe(orderId);
  });

  it('returns null for missing document', async () => {
    const fetched = await orderRepository.getById('non-existent-id');
    expect(fetched).toBeNull();
  });

  it('updates an order', async () => {
    const mockOrder = createMockOrder({ id: undefined, date: testDate, status: 'scheduled' });
    const orderId = await orderRepository.create(mockOrder);
    
    await orderRepository.update(orderId, { status: 'preparing' });
    const fetched = await orderRepository.getById(orderId);
    expect(fetched?.status).toBe('preparing');
  });

  it('deletes an order', async () => {
    const mockOrder = createMockOrder({ id: undefined });
    const orderId = await orderRepository.create(mockOrder);
    
    await orderRepository.delete(orderId);
    const fetched = await orderRepository.getById(orderId);
    expect(fetched).toBeNull();
  });

  it('supports queries with filtering and sorting', async () => {
    await orderRepository.batchCreate([
      createMockOrder({ date: testDate, mealType: 'lunch', routeSequence: 2 }),
      createMockOrder({ date: testDate, mealType: 'lunch', routeSequence: 1 }),
      createMockOrder({ date: testDate, mealType: 'dinner', routeSequence: 1 }),
    ]);

    const lunchOrders = await orderRepository.getByDateAndMealType(testDate, 'lunch');
    expect(lunchOrders.length).toBeGreaterThanOrEqual(2);
    // Sequence sorting verification
    const seq1 = lunchOrders.findIndex(o => o.routeSequence === 1);
    const seq2 = lunchOrders.findIndex(o => o.routeSequence === 2);
    expect(seq1).toBeLessThan(seq2);
  });

  it('handles transactions (optimistic concurrency) via updateWorkflow', async () => {
    const mockOrder = createMockOrder({ id: 'wf-test-id', status: 'scheduled' });
    await orderRepository.create(mockOrder, 'wf-test-id');

    await orderRepository.updateWorkflow('wf-test-id', 'preparing', 'Started early');
    
    const fetched = await orderRepository.getById('wf-test-id');
    expect(fetched?.status).toBe('preparing');
    
    // Check workflow history
    const history = await orderRepository.getWorkflowHistory('wf-test-id');
    expect(history.length).toBe(1);
    expect(history[0].previousStatus).toBe('scheduled');
    expect(history[0].newStatus).toBe('preparing');
    expect(history[0].notes).toBe('Started early');
    expect(history[0].changedBy).toBeTruthy();
  });
});
