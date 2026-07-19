import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead, useUnreadNotificationCount } from '@/features/notifications/hooks/useNotifications';
import type { Notification } from '@/features/notifications/types/notification.types';
import { Bell, CheckCheck, X, CreditCard, Truck, ShoppingBag, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/shared/components/ui/Button';

function NotificationTypeIcon({ type }: { type: string }) {
  const cls = 'shrink-0';
  if (type.includes('payment')) return <CreditCard size={13} className={`text-amber-600 ${cls}`} />;
  if (type.includes('subscription')) return <ShoppingBag size={13} className={`text-blue-600 ${cls}`} />;
  if (type.includes('delivery') || type === 'delivered') return <Truck size={13} className={`text-emerald-600 ${cls}`} />;
  return <Info size={13} className={`text-stone-400 ${cls}`} />;
}

function DropdownItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const isUnread = notification.inAppStatus === 'unread';
  const ts = notification.createdAt as any;
  const timeAgo = ts?.toDate ? formatDistanceToNow(ts.toDate(), { addSuffix: true }) : '';

  return (
    <div
      className={`flex gap-2.5 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors border-b border-stone-100 last:border-0 ${
        isUnread ? 'bg-blue-50/30' : ''
      }`}
      onClick={isUnread ? onRead : undefined}
    >
      {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
      <NotificationTypeIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-tight ${isUnread ? 'font-bold text-stone-900' : 'font-medium text-stone-700'}`}>
          {notification.title}
        </div>
        <div className="text-stone-500 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">
          {notification.message}
        </div>
        <div className="text-stone-400 text-[10px] mt-1">{timeAgo}</div>
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
        className="relative p-2 rounded-lg hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-stone-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
            <h3 className="font-bold text-stone-900 text-sm font-sans">Notifications</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-stone-400 hover:text-stone-700 p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-stone-400 text-xs font-sans">
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
          <div className="border-t border-stone-200 px-4 py-2.5 flex justify-between items-center">
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
                className="text-xs font-sans gap-1 text-stone-500"
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
