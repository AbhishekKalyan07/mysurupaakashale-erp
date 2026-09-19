import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  notificationRepository,
  type NotificationFilter,
} from "@/shared/services/firestore/notificationRepository";
import { Timestamp, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Notification } from "@/shared/types";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "react-hot-toast";

// ── Current user's notifications (notification bell) ──────────────────────────
export function useNotifications() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  // Set up real-time subscription
  useEffect(() => {
    if (!firebaseUser) return;
    const unsubscribe = notificationRepository.subscribeToByRecipientId(
      firebaseUser.uid,
      (data) => {
        queryClient.setQueryData(
          queryKeys.notifications.byRecipient(firebaseUser.uid),
          data,
        );
      },
    );
    return () => unsubscribe();
  }, [firebaseUser, queryClient]);

  return useQuery({
    queryKey: queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
    queryFn: () => notificationRepository.getByRecipientId(firebaseUser!.uid),
    enabled: !!firebaseUser,
    staleTime: Infinity,
  });
}

// ── Unread count for badge ─────────────────────────────────────────────────────
export function useUnreadNotificationCount() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubscribe = notificationRepository.subscribeToUnreadCount(
      firebaseUser.uid,
      (count) => {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(firebaseUser.uid),
          count,
        );
      },
    );
    return () => unsubscribe();
  }, [firebaseUser, queryClient]);

  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
    queryFn: () => notificationRepository.getUnreadCount(firebaseUser!.uid),
    enabled: !!firebaseUser,
    staleTime: Infinity,
  });
}

// ── Mark a notification as read ────────────────────────────────────────────────
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      // Phase 7: Client-side update
      await notificationRepository.update(notificationId, {
        inAppStatus: "read",
        status: "read",
        readAt: Timestamp.now() as unknown as Timestamp,
      });
      return { success: true };
    },
    // Optimistic update — feel instant, reconcile on settle
    onMutate: async (notificationId: string) => {
      const key = queryKeys.notifications.byRecipient(firebaseUser?.uid ?? "");
      const countKey = queryKeys.notifications.unreadCount(
        firebaseUser?.uid ?? "",
      );
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: countKey });

      const previous = queryClient.getQueryData<Notification[]>(key);
      const previousCount = queryClient.getQueryData<number>(countKey);

      queryClient.setQueryData<Notification[]>(
        key,
        (old) =>
          old?.map((n) =>
            n.id === notificationId
              ? { ...n, inAppStatus: "read" as const, status: "read" as const }
              : n,
          ) ?? [],
      );

      queryClient.setQueryData<number>(countKey, (old) =>
        Math.max(0, (old ?? 1) - 1),
      );

      return { previous, previousCount };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
          context.previous,
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
          context.previousCount,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
      });
    },
  });
}

// ── Mark all as read ───────────────────────────────────────────────────────────
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async () => {
      // Phase 7: Fetch all unread and update them
      const unread = await notificationRepository.getAllUnread(
        firebaseUser!.uid,
      );
      const toUpdate = unread;

      await Promise.all(
        toUpdate.map((n) =>
          notificationRepository.update(n.id, {
            inAppStatus: "read",
            status: "read",
            readAt: Timestamp.now() as unknown as Timestamp,
          }),
        ),
      );

      return { success: true, count: toUpdate.length };
    },
    onMutate: async () => {
      const key = queryKeys.notifications.byRecipient(firebaseUser?.uid ?? "");
      const countKey = queryKeys.notifications.unreadCount(
        firebaseUser?.uid ?? "",
      );
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: countKey });

      const previous = queryClient.getQueryData<Notification[]>(key);
      const previousCount = queryClient.getQueryData<number>(countKey);

      queryClient.setQueryData<Notification[]>(
        key,
        (old) =>
          old?.map((n) =>
            n.inAppStatus === "unread"
              ? { ...n, inAppStatus: "read" as const, status: "read" as const }
              : n,
          ) ?? [],
      );
      queryClient.setQueryData<number>(countKey, 0);

      return { previous, previousCount };
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
      });
    },
    onSuccess: async (data) => {
      toast.success(`Marked ${data.count} notifications as read.`);
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
          context.previous,
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
          context.previousCount,
        );
      }
      toast.error((err as Error).message || "Failed to mark all as read.");
    },
  });
}

// ── Archive a notification ─────────────────────────────────────────────────────
export function useArchiveNotification() {
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      // Phase 7: Client-side archive update
      await notificationRepository.update(notificationId, {
        inAppStatus: "archived",
        status: "archived",
      });
      return { success: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.byRecipient(firebaseUser?.uid ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.unreadCount(firebaseUser?.uid ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to archive notification.");
    },
  });
}

// ── Admin: all notification history paginated ──────────────────────────────────
export function useNotificationHistory(
  filter: NotificationFilter = {},
  lastDocSnap?: QueryDocumentSnapshot<Notification>,
  pageSize: number = 20,
) {
  const filterKey = JSON.stringify(filter);
  const cursorId = lastDocSnap?.id ?? "page-0";

  return useQuery({
    queryKey: queryKeys.notifications.adminHistory(cursorId, filterKey, pageSize),
    queryFn: async (): Promise<{
      notifications: Notification[];
      lastDoc: QueryDocumentSnapshot<Notification> | null;
    }> => {
      return notificationRepository.getNotificationsPaginated(
        filter,
        pageSize,
        lastDocSnap,
      );
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
