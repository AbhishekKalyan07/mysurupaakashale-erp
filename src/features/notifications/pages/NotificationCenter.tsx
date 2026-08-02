import { useState } from 'react';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useArchiveNotification,
} from '@/features/notifications/hooks/useNotifications';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
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
  Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function NotificationIcon({ type }: { type: string }) {
  const iconClass = 'shrink-0';
  if (type.includes('payment')) return <CreditCard size={20} className={`text-amber-600 ${iconClass}`} />;
  if (type.includes('subscription')) return <ShoppingBag size={20} className={`text-blue-600 ${iconClass}`} />;
  if (type.includes('delivery') || type.includes('out_for') || type === 'delivered') return <Truck size={20} className={`text-emerald-600 ${iconClass}`} />;
  if (type.includes('staff') || type.includes('role')) return <User size={20} className={`text-purple-600 ${iconClass}`} />;
  if (type.includes('settings') || type.includes('backup')) return <Settings size={20} className={`text-primary ${iconClass}`} />;
  if (type.includes('error')) return <AlertCircle size={20} className={`text-danger ${iconClass}`} />;
  return <Info size={20} className={`text-text-muted ${iconClass}`} />;
}

function priorityBadge(priority: string) {
  switch (priority) {
    case 'critical': return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-danger/10 text-danger border border-danger/20">Critical</span>;
    case 'high': return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-gold/10 text-gold border border-gold/30">High</span>;
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
  const parsedDate = parseFirestoreDate(notification.createdAt);
  const timeAgo = parsedDate
    ? formatDistanceToNow(parsedDate, { addSuffix: true })
    : 'recently';

  return (
    <div
      className={`group relative flex gap-4 p-5 rounded-2xl border transition-all duration-300 ${
        isUnread
          ? 'bg-primary/5 border-primary/20 shadow-sm'
          : 'bg-card border-primary/5 hover:border-primary/10 hover:shadow-sm'
      }`}
    >
      {/* Unread indicator line */}
      {isUnread && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-gold rounded-r-full shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
      )}

      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className={`p-2.5 rounded-xl transition-colors ${isUnread ? 'bg-white shadow-sm border border-primary/10' : 'bg-primary/5'}`}>
          <NotificationIcon type={notification.type} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className={`text-base font-display ${isUnread ? 'font-bold text-primary' : 'font-semibold text-text-muted'}`}>
              {notification.title}
            </h4>
            {priorityBadge(notification.priority)}
          </div>
          <span className="text-xs text-primary/40 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <Clock size={12} /> {timeAgo}
          </span>
        </div>
        <p className={`text-sm font-sans leading-relaxed ${isUnread ? 'text-text-muted' : 'text-text-muted/70'}`}>
          {notification.message}
        </p>
      </div>

      {/* Actions (visible on hover for desktop, always visible on mobile if needed, but we'll use group-hover) */}
      <div className="flex flex-col sm:flex-row gap-2 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity items-start pt-1">
        {isUnread && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRead}
            className="h-9 w-9 p-0 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg"
            title="Mark as read"
          >
            <CheckCheck size={18} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onArchive}
          className="h-9 w-9 p-0 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"
          title="Archive"
        >
          <Archive size={18} />
        </Button>
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
    <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-primary flex items-center gap-3">
            <Bell className="text-gold drop-shadow-sm" size={32} />
            Notification Center
          </h1>
          {unreadCount > 0 && (
            <p className="text-text-muted font-sans text-sm md:text-base mt-2">
              You have{' '}
              <span className="font-bold text-primary">{unreadCount}</span> unread notification{unreadCount !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => markAllRead.mutate()}
            isLoading={markAllRead.isPending}
            className="gap-2 font-sans font-bold shadow-sm self-start md:self-auto"
          >
            <CheckCheck size={18} /> Mark All Read
          </Button>
        )}
      </div>

      {/* Search & Tabs */}
      <div className="bg-card rounded-2xl shadow-sm border border-primary/10 p-2 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-2">
          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 md:pb-0">
            {TABS.map((tab) => {
              const count =
                tab.value === 'all'
                  ? (notifications ?? []).length
                  : (notifications ?? []).filter((n) => n.inAppStatus === tab.value).length;
              return (
                <button aria-label="Button action"
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-4 py-2 text-sm font-bold font-sans tracking-wide transition-all flex items-center gap-2 rounded-xl whitespace-nowrap ${
                    activeTab === tab.value
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-transparent text-text-muted hover:bg-primary/5 hover:text-primary'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-primary/10 rounded-xl text-sm font-sans focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors"
            />
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={<BellOff size={48} className="text-primary/20 mb-4" />}
            title="No notifications"
            description={
              activeTab === 'unread'
                ? "You're all caught up! You have no unread notifications."
                : 'No notifications match your current filter.'
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
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
