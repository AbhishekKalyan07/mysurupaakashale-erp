import { useQuery } from "@tanstack/react-query";
import type { Notification } from "@/shared/types";
import { resolveNotificationRecipients } from "../utils/notificationReferenceResolver";

export function useNotificationRecipientReferences(
  notifications: Notification[] | undefined,
) {
  return useQuery<Map<string, string>>({
    queryKey: [
      "admin",
      "notificationRecipients",
      notifications?.map((n) => n.recipientId).join(",") || "empty",
    ],
    queryFn: () => resolveNotificationRecipients(notifications || []),
    enabled: !!notifications && notifications.length > 0,
    staleTime: 5 * 60_000,
  });
}
