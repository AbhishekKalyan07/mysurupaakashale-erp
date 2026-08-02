import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsRepository } from '../settingsRepository';
import { getDoc } from 'firebase/firestore';

describe('settingsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBusinessSettings', () => {
    it('returns settings when document exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ currency: 'INR', taxRate: 18 }),
      } as any);

      const res = await settingsRepository.getBusinessSettings();
      expect(getDoc).toHaveBeenCalled();
      expect(res).toEqual({ currency: 'INR', taxRate: 18 });
    });

    it('returns null when document does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
      } as any);

      const res = await settingsRepository.getBusinessSettings();
      expect(getDoc).toHaveBeenCalled();
      expect(res).toBeNull();
    });
  });
});
