import { describe, it, expect, vi } from 'vitest';
import { dailyProductionRepository } from '../dailyProductionRepository';
import { getDoc, setDoc, onSnapshot } from 'firebase/firestore';

describe('dailyProductionRepository', () => {
  const date = '2026-08-01';
  const userId = 'user-1';

  describe('subscribeToState', () => {
    it('returns document if exists', () => {
      const onNext = vi.fn();
      dailyProductionRepository.subscribeToState(date, onNext);
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => true, data: () => ({ id: date, status: 'locked' }) });
      expect(onNext).toHaveBeenCalledWith({ id: date, status: 'locked' });
    });

    it('returns default open state if not exists', () => {
      const onNext = vi.fn();
      dailyProductionRepository.subscribeToState(date, onNext);
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => false });
      expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ status: 'open', id: date }));
    });
  });

  describe('getState', () => {
    it('returns document if exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: date, status: 'locked' })
      } as any);
      const state = await dailyProductionRepository.getState(date);
      expect(state.status).toBe('locked');
      expect(getDoc).toHaveBeenCalledTimes(1);
    });

    it('returns default open state if not exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
      } as any);
      const state = await dailyProductionRepository.getState(date);
      expect(state.status).toBe('open');
      expect(getDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('lockProduction', () => {
    it('locks production and saves snapshot', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      const snapshot: any = { version: 1 };
      await dailyProductionRepository.lockProduction(date, userId, snapshot);
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'locked', lockedBy: userId, snapshot }),
        { merge: true }
      );
    });
  });

  describe('unlockProduction', () => {
    it('unlocks production', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      await dailyProductionRepository.unlockProduction(date, userId, 'mistake');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'open', unlockedBy: userId, unlockReason: 'mistake' }),
        { merge: true }
      );
    });
  });

  describe('closeDay', () => {
    it('throws if day is not locked', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any); // default is 'open'
      await expect(dailyProductionRepository.closeDay(date, userId)).rejects.toThrow('Day must be locked');
    });

    it('closes locked day', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'locked' })
      } as any);
      await dailyProductionRepository.closeDay(date, userId);
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'closed', closedBy: userId }),
        { merge: true }
      );
    });
  });

  describe('reopenDay', () => {
    it('throws if day is not closed', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any); // default is 'open'
      await expect(dailyProductionRepository.reopenDay(date, userId, 'reason')).rejects.toThrow('Only closed days');
    });

    it('reopens closed day', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'closed' })
      } as any);
      await dailyProductionRepository.reopenDay(date, userId, 'correction');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'open', reopenedBy: userId, reopenReason: 'correction' }),
        { merge: true }
      );
    });
  });
});
