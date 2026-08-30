import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kitchenRepository } from '../kitchenRepository';
import * as firestore from 'firebase/firestore';

describe('kitchenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('getById', () => {
    it('returns null if doc does not exist', async () => {
      vi.spyOn(firestore, 'getDoc').mockResolvedValue({ exists: () => false } as any);
      const res = await kitchenRepository.getById('non_existent_kitchen_123');
      expect(res).toBeNull();
    });

    it('returns data if doc exists', async () => {
      vi.spyOn(firestore, 'getDoc').mockResolvedValue({ 
        exists: () => true, 
        id: 'k1_mock', 
        data: () => ({ name: 'Kitchen 1' }) 
      } as any);
      const res = await kitchenRepository.getById('k1_mock');
      expect(res).toMatchObject({ id: 'k1_mock', name: 'Kitchen 1' });
    });
  });

  describe('list', () => {
    it('returns list of kitchens', async () => {
      vi.spyOn(firestore, 'getDocs').mockResolvedValue({
        docs: [
          { id: 'k2_mock', data: () => ({ name: 'Kitchen 2' }) }
        ]
      } as any);
      const res = await kitchenRepository.list();
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('k2_mock');
    });
  });
});
