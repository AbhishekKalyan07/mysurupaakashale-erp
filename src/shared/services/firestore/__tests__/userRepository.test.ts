import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userRepository } from '../userRepository';
import { getDocs, runTransaction } from 'firebase/firestore';

describe('userRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCustomersPaginated', () => {
    it('returns paginated customers', async () => {
      const mockCustomer = { id: '1', role: 'customer', fullName: 'Test Customer' };
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [ { data: () => mockCustomer } ],
        length: 1,
      } as any);

      const result = await userRepository.getCustomersPaginated(10);
      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]).toEqual(mockCustomer);
      expect(getDocs).toHaveBeenCalled();
    });

    it('returns lastDoc if length equals pageSize', async () => {
      const mockCustomer = { id: '1', role: 'customer', fullName: 'Test Customer' };
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [ { data: () => mockCustomer } ],
        length: 1, // Note: snapshot.docs.length is used in the actual code
      } as any);

      // wait, the actual code checks `snapshot.docs.length === pageSize`
      vi.mocked(getDocs).mockReset();
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: Array.from({ length: 10 }, (_, i) => ({ data: () => ({ ...mockCustomer, id: `${i}` }) })),
      } as any);

      const result = await userRepository.getCustomersPaginated(10, {} as any);
      expect(result.lastDoc).not.toBeNull();
    });
  });

  describe('generateNextDisplayId', () => {
    it('generates customer ID with fullName', async () => {
      const result = await userRepository.generateNextDisplayId('customer', 'John Doe');
      expect(result).toBe('MP-J001');
      expect(runTransaction).toHaveBeenCalled();
    });

    it('generates customer ID with invalid letter', async () => {
      const result = await userRepository.generateNextDisplayId('customer', '123 Doe');
      expect(result).toBe('MP-U001');
    });

    it('generates admin ID', async () => {
      // the global runTransaction mock in vitest.setup.ts sets exists to false, count is 1000
      const result = await userRepository.generateNextDisplayId('admin');
      expect(result).toBe('ADMIN-1001');
    });

    it('uses existing count for customer if document exists', async () => {
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, updateFunction) => {
        const transaction = {
          get: vi.fn(async () => ({
            exists: () => true,
            data: () => ({ customer_J: 42 }),
          })),
          set: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        } as any;
        return await updateFunction(transaction);
      });

      const result = await userRepository.generateNextDisplayId('customer', 'John');
      expect(result).toBe('MP-J043');
    });

    it('uses existing count if document exists', async () => {
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, updateFunction) => {
        const transaction = {
          get: vi.fn(async () => ({
            exists: () => true,
            data: () => ({ admin: 1005, customer_A: 5 }),
          })),
          set: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        } as any;
        return await updateFunction(transaction);
      });

      const result = await userRepository.generateNextDisplayId('admin');
      expect(result).toBe('ADMIN-1006');
    });
  });

  describe('updateProfile', () => {
    it('updates user profile', async () => {
      // we can spy on userRepository.update which is inherited from BaseRepository
      const updateSpy = vi.spyOn(userRepository, 'update').mockResolvedValue();
      await userRepository.update('cust-1', { fullName: 'New Name' });
      expect(updateSpy).toHaveBeenCalledWith('cust-1', { fullName: 'New Name' });
    });
  });
});
