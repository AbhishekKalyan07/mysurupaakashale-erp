import { Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Notification, NotificationInAppStatus, CreateNotificationPayload } from '@/shared/types';
import { BaseRepository, createConverter } from '@/shared/services/firestore/BaseRepository';
import {
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  query,
  collection,
  serverTimestamp,
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

  /**
   * Creates a new notification document.
   * Called by notificationService.ts — never call this directly from UI code;
   * use the typed helpers in notificationService instead.
   */
  async createNotification(data: CreateNotificationPayload): Promise<string> {
    const id = crypto.randomUUID();
    const notification = {
      ...data,
      id,
      // Required fields with server-set defaults
      inAppStatus: 'unread' as const,
      status: 'pending' as const,
      channel: data.channel ?? 'in_app',
      priority: data.priority ?? 'normal',
      retryCount: 0,
      maxRetries: 3,
      lastRetryAt: null,
      errorMessage: null,
      // Timestamps — use serverTimestamp so Firestore records the authoritative time
      createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      sentAt: null,
      readAt: null,
      deliveredAt: null,
      expiresAt: data.expiresAt ?? null,
      relatedEntityType: data.relatedEntityType ?? null,
      relatedEntityId: data.relatedEntityId ?? null,
      metadata: data.metadata ?? {},
      createdBy: data.createdBy ?? 'system',
    };
    return this.create(notification as unknown as Notification, id);
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

  /** Get ALL unread notifications for a user (no limit, used for mark all read) */
  async getAllUnread(recipientId: string): Promise<Notification[]> {
    return this.list(
      where('recipientId', '==', recipientId),
      where('channel', '==', 'in_app'),
      where('inAppStatus', '==', 'unread'),
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

  /** Real-time subscription for all in-app notifications */
  subscribeToByRecipientId(recipientId: string, onNext: (data: Notification[]) => void, onError?: (error: Error) => void) {
    return this.subscribeToList(
      onNext,
      onError,
      where('recipientId', '==', recipientId),
      where('channel', '==', 'in_app'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
  }

  /** Real-time subscription for unread count */
  subscribeToUnreadCount(recipientId: string, onNext: (count: number) => void, onError?: (error: Error) => void) {
    return this.subscribeToList(
      (data) => onNext(data.length),
      onError,
      where('recipientId', '==', recipientId),
      where('channel', '==', 'in_app'),
      where('inAppStatus', '==', 'unread'),
    );
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

    // Use getDocs directly (same fix as paymentRepository) so we can
    // return the raw QueryDocumentSnapshot needed for the pagination cursor.
    const converter = createConverter<Notification>();
    const colRef = collection(db, 'notifications').withConverter(converter);
    const snapshot = await getDocs(query(colRef, ...constraints));

    const notifications = snapshot.docs.map(d => d.data());
    const lastDoc = snapshot.docs.length === pageSize
      ? (snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<Notification>)
      : null;

    return { notifications, lastDoc };
  }
}

export const notificationRepository = new NotificationRepository();
