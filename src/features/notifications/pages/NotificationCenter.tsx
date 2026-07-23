import { useState } from 'react';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useArchiveNotification,
} from '@/features/notifications/hooks/useNotifications';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import type { Notification, NotificationInAppStatus } from '@/shared/types';
import {
  Bell,
  BellOff,
  Archive,
  CheckCheck,
  Clock,
  CreditCard,
  ShoppingBag,
  Truck,
  AlertCircle,
  Info,
  Settings,
  User,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function NotificationIcon({ type }: { type: string }) {
  const iconClass = 'shrink-0';
  if (type.includes('payment')) return <CreditCard size={16} className={`text-amber-600 ${iconClass}`} />;
  if (type.includes('subscription')) return <ShoppingBag size={16} className={`text-blue-600 ${iconClass}`} />;
  if (type.includes('delivery') || type.includes('out_for') || type === 'delivered') return <Truck size={16} className={`text-emerald-600 ${iconClass}`} />;
  if (type.includes('staff') || type.includes('role')) return <User size={16} className={`text-purple-600 ${iconClass}`} />;
  if (type.includes('settings') || type.includes('backup')) return <Settings size={16} className={`text-ink-600 ${iconClass}`} />;
  if (type.includes('error')) return <AlertCircle size={16} className={`text-red-600 ${iconClass}`} />;
  return <Info size={16} className={`text-ink-500 ${iconClass}`} />;
}

function priorityBadge(priority: string) {
  switch (priority) {
    case 'critical': return <Badge tone="danger" className="text-[9px] uppercase">Critical</Badge>;
    case 'high': return <Badge tone="warning" className="text-[9px] uppercase">High</Badge>;
    default: return null;
  }
}

function NotificationCard({
  notification,
  onRead,
  onArchive,
}: {
  notification: Notification;
  onRead: () => void;
  onArchive: () => void;
}) {
  const isUnread = notification.inAppStatus === 'unread';
  const ts = notification.createdAt as any;
  const timeAgo = ts?.toDate
    ? formatDistanceToNow(ts.toDate(), { addSuffix: true })
    : 'recently';

  return (
    <div
      className={`flex gap-3 p-4 rounded-xl border transition-all ${
        isUnread
          ? 'bg-blue-50/40 border-blue-200/70'
          : 'bg-white border-rice-200'
      }`}
    >
      {/* Unread dot */}
      <div className="flex flex-col items-center pt-1">
        {isUnread && <div className="w-2 h-2 rounded-full bg-info shrink-0 mb-2" />}
        <NotificationIcon type={notification.type} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`text-sm font-sans ${isUnread ? 'font-bold text-ink-900' : 'font-semibold text-ink-700'}`}>
              {notification.title}
            </h4>
            {priorityBadge(notification.priority)}
          </div>
          <span className="text-[10px] text-ink-400 font-sans shrink-0 flex items-center gap-1">
            <Clock size={9} /> {timeAgo}
          </span>
        </div>
        <p className="text-ink-600 text-xs font-sans mt-1 leading-relaxed">{notification.message}</p>
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        {isUnread && (
          <button
            onClick={onRead}
            className="p-1.5 rounded-md hover:bg-rice-100 text-ink-400 hover:text-ink-700 transition-colors"
            title="Mark as read"
          >
            <CheckCheck size={14} />
          </button>
        )}
        <button
          onClick={onArchive}
          className="p-1.5 rounded-md hover:bg-rice-100 text-ink-400 hover:text-ink-600 transition-colors"
          title="Archive"
        >
          <Archive size={14} />
        </button>
      </div>
    </div>
  );
}

type FilterTab = NotificationInAppStatus | 'all';

const TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
  { label: 'Archived', value: 'archived' },
];

export function NotificationCenter() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const { data: notifications, isLoading, error, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const archiveNotif = useArchiveNotification();

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <ErrorState
        title="Could not load notifications"
        description="Please try again."
        onRetry={refetch}
      />
    );
  }

  const filtered = (notifications ?? []).filter((n) => {
    const tabMatch = activeTab === 'all' || n.inAppStatus === activeTab;
    const searchMatch =
      !search.trim() ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.message.toLowerCase().includes(search.toLowerCase());
    return tabMatch && searchMatch;
  });

  const unreadCount = (notifications ?? []).filter((n) => n.inAppStatus === 'unread').length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-ink-900 flex items-center gap-2">
            <Bell className="text-amber-600" size={28} />
            Notification Center
          </h1>
          {unreadCount > 0 && (
            <p className="text-ink-500 font-sans text-sm mt-1">
              You have{' '}
              <span className="font-bold text-ink-900">{unreadCount}</span> unread notification
              {unreadCount !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllRead.mutate()}
            isLoading={markAllRead.isPending}
            className="gap-2 font-sans font-semibold"
          >
            <CheckCheck size={14} /> Mark All Read
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notifications..."
          className="w-full pl-4 pr-4 py-2.5 border border-rice-300 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-rice-300">
        {TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? (notifications ?? []).length
              : (notifications ?? []).filter((n) => n.inAppStatus === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-2 text-xs font-semibold font-sans rounded-t transition-all flex items-center gap-1 ${
                activeTab === tab.value
                  ? 'border-b-2 border-emerald-600 text-emerald-700'
                  : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="bg-rice-200 text-ink-600 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BellOff size={36} className="text-ink-300" />}
          title="No notifications"
          description={
            activeTab === 'unread'
              ? "You're all caught up!"
              : 'No notifications match your current filter.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onRead={() => markRead.mutate(notification.id)}
              onArchive={() => archiveNotif.mutate(notification.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
