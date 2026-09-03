/**
 * holidayRepository.test.ts
 *
 * Unit tests for holidayRepository.ts
 * All Firestore SDK calls are mocked via the project's existing vi.mock setup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { holidayRepository } from '../holidayRepository';

// The project uses vi.mock('@/shared/lib/firebase') globally via setup files.
// Firestore functions are mocked via 'firebase/firestore' mock.
import { getDoc, runTransaction } from 'firebase/firestore';

describe('holidayRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isHoliday', () => {
    it('returns false when no holiday document exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      const result = await holidayRepository.isHoliday('2026-10-02');
      expect(result).toBe(false);
    });

    it('returns true when holiday document exists with status=active', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'active', date: '2026-10-02' }),
      } as any);
      const result = await holidayRepository.isHoliday('2026-10-02');
      expect(result).toBe(true);
    });

    it('returns false when holiday document exists with status=cancelled', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'cancelled', date: '2026-10-02' }),
      } as any);
      const result = await holidayRepository.isHoliday('2026-10-02');
      expect(result).toBe(false);
    });
  });

  describe('createOrGetHoliday', () => {
    it('creates a new holiday when document does not exist', async () => {
      vi.mocked(runTransaction).mockImplementationOnce(async (_db, fn) => {
        let created = false;
        const txn = {
          get: vi.fn().mockResolvedValueOnce({ exists: () => false }),
          set: vi.fn().mockImplementation(() => { created = true; }),
        };
        await fn(txn as any);
        return { created };
      });

      const result = await holidayRepository.createOrGetHoliday({
        date: '2026-10-02',
        name: 'Gandhi Jayanti',
        createdBy: 'admin-uid',
      });

      expect(result.created).toBe(true);
    });

    it('returns existing holiday when document already exists (idempotent)', async () => {
      const existingHoliday = {
        id: 'holiday_2026-10-02',
        date: '2026-10-02',
        name: 'Gandhi Jayanti',
        status: 'active',
        createdBy: 'admin-uid',
      };

      vi.mocked(runTransaction).mockImplementationOnce(async (_db, fn) => {
        const txn = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => existingHoliday,
          }),
          set: vi.fn(),
        };
        await fn(txn as any);
      });

      const result = await holidayRepository.createOrGetHoliday({
        date: '2026-10-02',
        name: 'Gandhi Jayanti',
        createdBy: 'admin-uid',
      });

      expect(result.created).toBe(false);
      expect(result.holiday.status).toBe('active');
    });
  });

  describe('getHoliday', () => {
    it('returns null when holiday does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      const result = await holidayRepository.getHoliday('2026-10-02');
      expect(result).toBeNull();
    });

    it('returns holiday when it exists', async () => {
      const holiday = { id: 'holiday_2026-10-02', date: '2026-10-02', status: 'active' };
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => holiday,
      } as any);
      const result = await holidayRepository.getHoliday('2026-10-02');
      expect(result?.id).toBe('holiday_2026-10-02');
    });
  });

  describe('cancelHoliday', () => {
    it('throws when holiday does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      await expect(
        holidayRepository.cancelHoliday('2026-10-02', 'admin-uid'),
      ).rejects.toThrow('Holiday for 2026-10-02 not found');
    });

    it('is a no-op when holiday is already cancelled', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'cancelled', date: '2026-10-02' }),
      } as any);
      // Should not throw and should not call updateDoc
      const { updateDoc } = await import('firebase/firestore');
      await holidayRepository.cancelHoliday('2026-10-02', 'admin-uid');
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });
});
