import { describe, it, expect, vi } from 'vitest';
import { dailyDeliveryRepository } from '../dailyDeliveryRepository';
import { getDoc, setDoc, onSnapshot } from 'firebase/firestore';

describe('dailyDeliveryRepository', () => {
  const date = '2026-08-01';
  const driverId = 'driver-1';

  describe('getState', () => {
    it('returns document if exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: date, status: 'dispatch_started' })
      } as any);
      const state = await dailyDeliveryRepository.getState(date);
      expect(state.status).toBe('dispatch_started');
    });

    it('returns default open state if not exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      const state = await dailyDeliveryRepository.getState(date);
      expect(state.status).toBe('open');
    });
  });

  describe('getDriverSession', () => {
    it('returns document if exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: driverId, status: 'in_progress' })
      } as any);
      const state = await dailyDeliveryRepository.getDriverSession(date, driverId);
      expect(state.status).toBe('in_progress');
    });

    it('returns default not_started state if not exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
      const state = await dailyDeliveryRepository.getDriverSession(date, driverId);
      expect(state.status).toBe('not_started');
    });
  });

  describe('subscribeDriverSession', () => {
    it('returns document if exists', () => {
      const onNext = vi.fn();
      dailyDeliveryRepository.subscribeDriverSession(date, driverId, onNext);
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => true, data: () => ({ id: driverId, status: 'in_progress' }) });
      expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    });

    it('returns default if not exists', () => {
      const onNext = vi.fn();
      dailyDeliveryRepository.subscribeDriverSession(date, driverId, onNext);
      const callback = vi.mocked(onSnapshot).mock.calls[0][1] as Function;
      callback({ exists: () => false });
      expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ status: 'not_started' }));
    });
  });

  describe('updateDriverSession', () => {
    it('updates session and creates parent if it does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any); // parent doc check
      await dailyDeliveryRepository.updateDriverSession(date, driverId, { status: 'picked_up' });
      expect(setDoc).toHaveBeenCalledTimes(2); // one for driverSession, one for parent
    });

    it('updates session and does not create parent if it exists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true } as any); // parent doc check
      await dailyDeliveryRepository.updateDriverSession(date, driverId, { status: 'picked_up' });
      expect(setDoc).toHaveBeenCalledTimes(1); // just driverSession
    });
  });
});
