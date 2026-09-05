import { describe, it, expect, vi, beforeEach } from 'vitest';
import { failureQueueRepository } from '../failureQueueRepository';
import { doc, setDoc } from 'firebase/firestore';

// Mock Firebase
vi.mock('firebase/firestore', () => {
  return {
    initializeFirestore: vi.fn(() => ({})),
    getFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentSingleTabManager: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(),
    collection: vi.fn(() => ({ withConverter: vi.fn(() => 'failureQueue_collection_ref') })),
    doc: vi.fn(() => ({ id: 'test_failure_id' })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    serverTimestamp: vi.fn(() => 'server_timestamp_mock'),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn()
    }))
  };
});

vi.mock('@/shared/lib/firebase', () => ({
  db: {}
}));

describe('FailureQueueRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logFailure creates a pending record and returns the id', async () => {
    const mockId = 'test_failure_id';

    const result = await failureQueueRepository.logFailure(
      'cust_123',
      'sub_456',
      'lunch',
      '2026-08-01',
      'Unknown error',
      'Error stack trace'
    );

    expect(result).toBe(mockId);
    expect(doc).toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith({ id: mockId }, expect.objectContaining({
      customerId: 'cust_123',
      subscriptionId: 'sub_456',
      mealType: 'lunch',
      date: '2026-08-01',
      reason: 'Unknown error',
      stackTrace: 'Error stack trace',
      attempts: 1,
      retryCount: 0,
      status: 'pending',
      createdAt: 'server_timestamp_mock'
    }));
  });

  it('logFailure creates record without stackTrace when omitted', async () => {
    const mockId = 'test_failure_id';

    const result = await failureQueueRepository.logFailure(
      'cust_789',
      'sub_012',
      'dinner',
      '2026-08-02',
      'Another error'
    );

    expect(result).toBe(mockId);
    expect(setDoc).toHaveBeenCalledWith({ id: mockId }, expect.objectContaining({
      customerId: 'cust_789',
      subscriptionId: 'sub_012',
      mealType: 'dinner',
      date: '2026-08-02',
      reason: 'Another error',
      attempts: 1,
      retryCount: 0,
      status: 'pending',
      createdAt: 'server_timestamp_mock'
    }));
  });
});
