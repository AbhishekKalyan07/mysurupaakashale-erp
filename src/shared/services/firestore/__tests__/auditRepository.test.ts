import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditRepository } from '../auditRepository';
import { addDoc, getDocs } from 'firebase/firestore';

describe('auditRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logAction', () => {
    it('logs an action with details', async () => {
      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'doc-1' } as any);
      await auditRepository.logAction('CREATE', 'user-1', 'John Doe', 'entity-1', 'Order', { amount: 100 });
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'CREATE',
          actorId: 'user-1',
          actorName: 'John Doe',
          entityId: 'entity-1',
          entityType: 'Order',
          details: { amount: 100 },
          ipAddress: null,
        })
      );
    });

    it('logs an action without details', async () => {
      vi.mocked(addDoc).mockResolvedValueOnce({ id: 'doc-2' } as any);
      await auditRepository.logAction('DELETE', 'user-2', 'Jane Doe', 'entity-2', 'User');
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'DELETE',
          details: null,
        })
      );
    });
  });

  describe('getAuditLogs', () => {
    it('fetches logs without filters', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => ({ action: 'CREATE' }) }
        ],
        length: 1, // does not match pageSize (50), so lastDoc is null
      } as any);

      const res = await auditRepository.getAuditLogs({});
      expect(getDocs).toHaveBeenCalled();
      expect(res.logs).toHaveLength(1);
      expect(res.lastDoc).toBeNull();
    });

    it('fetches logs with action filter', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      await auditRepository.getAuditLogs({ action: 'UPDATE' });
      expect(getDocs).toHaveBeenCalled();
    });

    it('fetches logs with userId filter', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      await auditRepository.getAuditLogs({ userId: 'user-1' });
      expect(getDocs).toHaveBeenCalled();
    });

    it('fetches logs with startDate and endDate filters', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      await auditRepository.getAuditLogs({ startDate: '2026-08-01', endDate: '2026-08-02' });
      expect(getDocs).toHaveBeenCalled();
    });

    it('returns lastDoc when pageSize is met', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: Array.from({ length: 50 }, (_, i) => ({ data: () => ({ id: i }) })),
        length: 50,
      } as any);

      const res = await auditRepository.getAuditLogs({}, 50);
      expect(res.logs).toHaveLength(50);
      expect(res.lastDoc).not.toBeNull();
    });

    it('uses lastDocSnap when provided', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      const fakeSnap = { id: 'snap-1' } as any;
      await auditRepository.getAuditLogs({}, 50, fakeSnap);
      expect(getDocs).toHaveBeenCalled();
    });
  });
});
