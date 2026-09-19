import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  useNotifications,
  useMarkNotificationRead,
  useUnreadNotificationCount,
  useMarkAllNotificationsRead,
} from "@/features/notifications/hooks/useNotifications";
import type { Notification } from "@/features/notifications/types/notification.types";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";
import {
  Bell,
  CheckCheck,
  X,
  CreditCard,
  Truck,
  ShoppingBag,
  Info,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { useAuth } from "@/features/auth/hooks/useAuth";

function NotificationTypeBadge({ type }: { type: string }) {
  if (type.includes("payment")) {
    return (
      <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
        <CreditCard size={16} />
      </div>
    );
  }
  if (type.includes("subscription")) {
    return (
      <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
        <ShoppingBag size={16} />
      </div>
    );
  }
  if (type.includes("delivery") || type === "delivered") {
    return (
      <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
        <Truck size={16} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <Info size={16} />
    </div>
  );
}

function DropdownItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = notification.inAppStatus === "unread";
  const parsedDate = parseFirestoreDate(notification.createdAt);
  const timeAgo = parsedDate
    ? formatDistanceToNow(parsedDate, { addSuffix: true })
    : "";

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 hover:bg-primary/5 cursor-pointer transition-colors border-b border-primary/5 last:border-0 ${
        isUnread ? "bg-primary/[0.04]" : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <NotificationTypeBadge type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div
            className={`text-sm leading-snug truncate ${
              isUnread ? "font-bold text-primary" : "font-semibold text-text"
            }`}
          >
            {notification.title}
          </div>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-gold shrink-0 shadow-xs" />
          )}
        </div>
        <div className="text-text-muted text-xs leading-relaxed line-clamp-2">
          {notification.message}
        </div>
        <div className="text-primary/50 font-semibold text-[11px] mt-1 tracking-wide">
          {timeAgo}
        </div>
      </div>
    </div>
  );
}

interface NotificationBellProps {
  /** Route to the full notification center for the current role. */
  centerRoute: string;
}

export function NotificationBell({ centerRoute }: NotificationBellProps) {
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: notifications } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    const isUnread = notification.inAppStatus === "unread";
    if (isUnread) {
      markRead.mutate(notification.id);
    }
    setIsOpen(false);

    // Smart contextual navigation based on notification category & current role
    if (notification.type.includes("payment")) {
      navigate(role === "admin" ? "/admin/payments" : "/customer/payments");
    } else if (notification.type.includes("subscription")) {
      navigate(
        role === "admin" ? "/admin/subscriptions" : "/customer/subscription",
      );
    } else if (
      notification.type.includes("delivery") ||
      notification.type === "delivered"
    ) {
      navigate(
        role === "delivery_partner"
          ? "/delivery"
          : role === "admin"
            ? "/admin/delivery"
            : "/customer/orders",
      );
    } else {
      navigate(centerRoute);
    }
  };

  const recentNotifications = (notifications ?? []).slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={() => setIsOpen((p) => !p)}
        className="relative min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-text-muted hover:text-primary transition-colors rounded-full hover:bg-background"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-danger rounded-full ring-2 ring-card shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 md:w-[420px] bg-card rounded-2xl shadow-2xl border border-primary/15 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10 bg-primary/5">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-primary" />
              <h3 className="font-bold text-primary text-sm font-sans">
                Notifications
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-text-muted hover:text-primary transition-colors p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-primary/10"
              aria-label="Close notifications"
            >
              <X size={18} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-[min(70vh,460px)] overflow-y-auto divide-y divide-primary/5">
            {recentNotifications.length === 0 ? (
              <div className="py-10 text-center text-text-muted text-xs font-sans">
                No notifications yet.
              </div>
            ) : (
              recentNotifications.map((n) => (
                <DropdownItem
                  key={n.id}
                  notification={n}
                  onClick={() => handleNotificationClick(n)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-primary/10 px-4 py-3 flex justify-between items-center bg-card">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-sans font-semibold min-h-[36px]"
              onClick={() => {
                navigate(centerRoute);
                setIsOpen(false);
              }}
            >
              View all notifications
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-sans font-semibold min-h-[36px] gap-1 text-text-muted hover:text-primary"
                onClick={() => {
                  markAllRead.mutate();
                  setIsOpen(false);
                }}
              >
                <CheckCheck size={14} /> Mark all read
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
