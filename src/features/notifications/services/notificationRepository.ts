import { db } from '@/shared/lib/firebase';
import type { Notification, NotificationInAppStatus } from '@/shared/types';
import { BaseRepository, createConverter } from '@/shared/services/firestore/BaseRepository';
import {
  where,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export interface NotificationFilter {
  inAppStatus?: NotificationInAppStatus;
  recipientId?: string;
  type?: string;
}

class NotificationRepository extends BaseRepository<Notification> {
  constructor() {
    super(db, 'notifications', createConverter<Notification>());
  }

  /** All in-app notifications for a user, newest first. */
  async getByRecipientId(recipientId: string): Promise<Notification[]> {
    return this.list(
      where('recipientId', '==', recipientId),
      where('channel', '==', 'in_app'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
  }

  /** Unread count for the notification bell badge. */
  async getUnreadCount(recipientId: string): Promise<number> {
    const results = await this.list(
      where('recipientId', '==', recipientId),
      where('channel', '==', 'in_app'),
      where('inAppStatus', '==', 'unread'),
    );
    return results.length;
  }

  /**
   * Cursor-paginated list for Notification History page.
   * Admin version fetches all; customer version filters by recipientId.
   */
  async getNotificationsPaginated(
    filter: NotificationFilter,
    pageSize: number = 20,
    lastDocSnap?: QueryDocumentSnapshot<Notification>,
  ): Promise<{ notifications: Notification[]; lastDoc: QueryDocumentSnapshot<Notification> | null }> {
    const constraints: QueryConstraint[] = [];

    if (filter.recipientId) {
      constraints.push(where('recipientId', '==', filter.recipientId));
    }
    if (filter.inAppStatus) {
      constraints.push(where('inAppStatus', '==', filter.inAppStatus));
    }
    if (filter.type) {
      constraints.push(where('type', '==', filter.type));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(pageSize));

    if (lastDocSnap) {
      constraints.push(startAfter(lastDocSnap));
    }

    const notifications = await this.list(...constraints);

    return {
      notifications,
      lastDoc: null,
    };
  }
}

export const notificationRepository = new NotificationRepository();
