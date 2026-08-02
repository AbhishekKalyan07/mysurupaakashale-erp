import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationRepository } from '../notificationRepository';
import { getDocs } from 'firebase/firestore';

describe('notificationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotification', () => {
    it('creates a notification with default fields', async () => {
      const createSpy = vi.spyOn(notificationRepository, 'create').mockResolvedValueOnce('notif-1');
      const res = await notificationRepository.createNotification({
        recipientId: 'user-1',
        recipientRole: 'customer',
        type: 'subscription_created',
        title: 'Title',
        message: 'Message',
        channel: 'in_app',
      });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user-1',
          inAppStatus: 'unread',
          status: 'pending',
          channel: 'in_app',
          priority: 'normal',
        }),
        expect.any(String)
      );
      expect(res).toBe('notif-1');
    });

    it('creates a notification overriding default fields', async () => {
      const createSpy = vi.spyOn(notificationRepository, 'create').mockResolvedValueOnce('notif-2');
      await notificationRepository.createNotification({
        recipientId: 'user-2',
        recipientRole: 'admin',
        type: 'payment_verified',
        title: 'T',
        message: 'M',
        channel: 'email',
        priority: 'high',
        expiresAt: null,
        relatedEntityType: 'payment',
        relatedEntityId: 'pay-1',
        metadata: { test: 'true' },
        createdBy: 'admin-1',
      });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          priority: 'high',
          expiresAt: null,
          relatedEntityType: 'payment',
          relatedEntityId: 'pay-1',
          metadata: { test: 'true' },
          createdBy: 'admin-1',
        }),
        expect.any(String)
      );
    });
  });

  describe('getByRecipientId', () => {
    it('fetches notifications for recipient', async () => {
      const listSpy = vi.spyOn(notificationRepository, 'list').mockResolvedValueOnce([{ id: 'notif-1' } as any]);
      const res = await notificationRepository.getByRecipientId('user-1');
      expect(listSpy).toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });
  });

  describe('getUnreadCount', () => {
    it('fetches unread count', async () => {
      const listSpy = vi.spyOn(notificationRepository, 'list').mockResolvedValueOnce([{}, {}, {}] as any);
      const res = await notificationRepository.getUnreadCount('user-1');
      expect(listSpy).toHaveBeenCalled();
      expect(res).toBe(3);
    });
  });

  describe('getNotificationsPaginated', () => {
    it('fetches without filters', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'n1' }) }
        ],
        length: 1,
      } as any);

      const res = await notificationRepository.getNotificationsPaginated({}, 20);
      expect(getDocs).toHaveBeenCalled();
      expect(res.notifications).toHaveLength(1);
      expect(res.lastDoc).toBeNull();
    });

    it('fetches with recipientId, inAppStatus, and type filters', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      await notificationRepository.getNotificationsPaginated({
        recipientId: 'user-1',
        inAppStatus: 'read',
        type: 'alert'
      }, 20);
      expect(getDocs).toHaveBeenCalled();
    });

    it('returns lastDoc when pageSize is met', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: Array.from({ length: 20 }, (_, i) => ({ data: () => ({ id: i }) })),
        length: 20,
      } as any);

      const res = await notificationRepository.getNotificationsPaginated({}, 20);
      expect(res.notifications).toHaveLength(20);
      expect(res.lastDoc).not.toBeNull();
    });

    it('uses lastDocSnap when provided', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any);
      await notificationRepository.getNotificationsPaginated({}, 20, { id: 'snap-1' } as any);
      expect(getDocs).toHaveBeenCalled();
    });
  });
});
