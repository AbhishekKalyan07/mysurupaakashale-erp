import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead, useUnreadNotificationCount } from '@/features/notifications/hooks/useNotifications';
import type { Notification } from '@/features/notifications/types/notification.types';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { Bell, CheckCheck, X, CreditCard, Truck, ShoppingBag, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';

function NotificationTypeIcon({ type }: { type: string }) {
  const cls = 'shrink-0';
  if (type.includes('payment')) return <CreditCard size={13} className={`text-amber-600 ${cls}`} />;
  if (type.includes('subscription')) return <ShoppingBag size={13} className={`text-blue-600 ${cls}`} />;
  if (type.includes('delivery') || type === 'delivered') return <Truck size={13} className={`text-emerald-600 ${cls}`} />;
  return <Info size={13} className={`text-ink-400 ${cls}`} />;
}

function DropdownItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const isUnread = notification.inAppStatus === 'unread';
  const parsedDate = parseFirestoreDate(notification.createdAt);
  const timeAgo = parsedDate ? formatDistanceToNow(parsedDate, { addSuffix: true }) : '';

  return (
    <div
      className={`flex gap-2.5 px-4 py-3 hover:bg-primary/5 cursor-pointer transition-colors border-b border-primary/5 last:border-0 ${
        isUnread ? 'bg-primary/5' : ''
      }`}
      onClick={isUnread ? onRead : undefined}
    >
      {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-info mt-1.5 shrink-0" />}
      <NotificationTypeIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-tight ${isUnread ? 'font-bold text-primary' : 'font-medium text-text-muted'}`}>
          {notification.title}
        </div>
        <div className="text-text-muted text-[11px] mt-0.5 line-clamp-2 leading-relaxed">
          {notification.message}
        </div>
        <div className="text-primary/40 font-bold text-[10px] mt-1 tracking-wider uppercase">{timeAgo}</div>
      </div>
    </div>
  );
}

interface NotificationBellProps {
  /** Route to the full notification center for the current role. */
  centerRoute: string;
}

export function NotificationBell({ centerRoute }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: notifications } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const recentNotifications = (notifications ?? []).slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={() => setIsOpen((p) => !p)}
        className="relative p-2 text-text-muted hover:text-primary transition-colors rounded-full hover:bg-background"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger"></span>
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl shadow-xl border border-primary/10 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10 bg-primary/5">
            <h3 className="font-bold text-primary text-sm font-sans">Notifications</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-text-muted hover:text-primary transition-colors p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs font-sans">
                No notifications yet.
              </div>
            ) : (
              recentNotifications.map((n) => (
                <DropdownItem
                  key={n.id}
                  notification={n}
                  onRead={() => markRead.mutate(n.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-primary/10 px-4 py-2.5 flex justify-between items-center bg-card">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-sans gap-1"
              onClick={() => {
                navigate(centerRoute);
                setIsOpen(false);
              }}
            >
              View all
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-sans gap-1 text-text-muted hover:text-primary"
                onClick={() => setIsOpen(false)}
              >
                <CheckCheck size={12} /> Mark all read
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
