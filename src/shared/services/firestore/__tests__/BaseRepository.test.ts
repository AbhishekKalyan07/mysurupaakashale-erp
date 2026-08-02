import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseRepository, createConverter } from '../BaseRepository';
import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getCountFromServer,
  Firestore,
} from 'firebase/firestore';

interface TestModel {
  id: string;
  name: string;
}

describe('BaseRepository', () => {
  let repo: BaseRepository<TestModel>;
  let mockDb: Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {} as Firestore;
    repo = new BaseRepository<TestModel>(mockDb, 'test_collection', createConverter<TestModel>());
  });

  describe('getById', () => {
    it('returns data when document exists', async () => {
      const mockData = { id: '1', name: 'Test' };
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      } as any);

      const result = await repo.getById('1');
      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockData);
    });

    it('returns null when document does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      const result = await repo.getById('missing');
      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('propagates Firestore errors', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Permission denied'));
      await expect(repo.getById('1')).rejects.toThrow('Permission denied');
      expect(getDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('returns array of data', async () => {
      const mockData = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: mockData.map(d => ({ data: () => d })),
      } as any);

      const result = await repo.list();
      expect(getDocs).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockData);
    });

    it('propagates Firestore errors', async () => {
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('Permission denied'));
      await expect(repo.list()).rejects.toThrow('Permission denied');
    });
  });

  describe('count', () => {
    it('returns count from server', async () => {
      vi.mocked(getCountFromServer).mockResolvedValueOnce({
        data: () => ({ count: 42 }),
      } as any);

      const result = await repo.count();
      expect(getCountFromServer).toHaveBeenCalledTimes(1);
      expect(result).toBe(42);
    });
  });

  describe('create', () => {
    it('creates document with provided ID', async () => {
      await repo.create({ name: 'New' }, 'custom-id');
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('creates document with generated ID', async () => {
      await repo.create({ name: 'Auto' });
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('propagates errors on create', async () => {
      vi.mocked(setDoc).mockRejectedValueOnce(new Error('Failed to write'));
      await expect(repo.create({ name: 'Fail' })).rejects.toThrow('Failed to write');
    });
  });

  describe('update', () => {
    it('calls updateDoc with partial data', async () => {
      await repo.update('1', { name: 'Updated' });
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('propagates errors on update', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Failed to update'));
      await expect(repo.update('1', { name: 'Fail' })).rejects.toThrow('Failed to update');
    });
  });

  describe('delete', () => {
    it('calls deleteDoc', async () => {
      await repo.delete('1');
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });

    it('propagates errors on delete', async () => {
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('Failed to delete'));
      await expect(repo.delete('1')).rejects.toThrow('Failed to delete');
    });
  });

  describe('subscribeToDoc', () => {
    it('calls onSnapshot and handles existing document', () => {
      const onNext = vi.fn();
      repo.subscribeToDoc('1', onNext, vi.fn());
      expect(onSnapshot).toHaveBeenCalledTimes(1);
      
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => true, data: () => ({ id: '1', name: 'Snap' }) } as any);
      expect(onNext).toHaveBeenCalledWith({ id: '1', name: 'Snap' });
    });

    it('calls onSnapshot and handles missing document', () => {
      const onNext = vi.fn();
      repo.subscribeToDoc('1', onNext, vi.fn());
      
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => false, data: () => null } as any);
      expect(onNext).toHaveBeenCalledWith(null);
    });

    it('passes error to onError callback', () => {
      const onError = vi.fn();
      repo.subscribeToDoc('1', vi.fn(), onError);
      
      const errorCallback = vi.mocked(onSnapshot).mock.calls[0][2] as Function;
      const err = new Error('Test Error');
      errorCallback(err);
      expect(onError).toHaveBeenCalledWith(err);
    });
  });

  describe('subscribeToList', () => {
    it('calls onSnapshot with query and handles docs', () => {
      const onNext = vi.fn();
      repo.subscribeToList(onNext, vi.fn());
      expect(onSnapshot).toHaveBeenCalledTimes(1);
      
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ docs: [{ data: () => ({ id: '1', name: 'A' }) }] } as any);
      expect(onNext).toHaveBeenCalledWith([{ id: '1', name: 'A' }]);
    });
  });

  describe('createConverter', () => {
    it('toFirestore returns the object', () => {
      const converter = createConverter<TestModel>();
      expect(converter.toFirestore({ id: '1', name: 'A' })).toEqual({ id: '1', name: 'A' });
    });

    it('fromFirestore merges id from snapshot', () => {
      const converter = createConverter<TestModel>();
      const mockSnapshot = { id: 'snap-1', data: () => ({ name: 'A', id: 'wrong' }) } as any;
      expect(converter.fromFirestore(mockSnapshot, {})).toEqual({ id: 'snap-1', name: 'A' });
    });
  });
});
