import { useState } from 'react';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { useNotificationHistory } from '@/features/notifications/hooks/useNotifications';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import type { Notification } from '@/shared/types';
import { History, Search, Bell, CreditCard, Truck, User, AlertCircle, Info, ShoppingBag, Settings } from 'lucide-react';
import { format } from 'date-fns';

function ChannelBadge({ channel }: { channel: string }) {
  const tone = channel === 'email' ? 'info' : channel === 'whatsapp' ? 'success' : 'default';
  return <Badge variant={tone} className="text-[9px] uppercase">{channel.replace('_', '-')}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'delivered' || status === 'read' ? 'success' :
    status === 'failed' ? 'danger' :
    status === 'pending' ? 'warning' : 'default';
  return <Badge variant={tone} className="text-[9px] uppercase">{status}</Badge>;
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'shrink-0 text-ink-500';
  if (type.includes('payment')) return <CreditCard size={14} className={cls} />;
  if (type.includes('subscription')) return <ShoppingBag size={14} className={cls} />;
  if (type.includes('delivery') || type.includes('out_for') || type === 'delivered') return <Truck size={14} className={cls} />;
  if (type.includes('staff') || type.includes('role')) return <User size={14} className={cls} />;
  if (type.includes('settings') || type.includes('backup')) return <Settings size={14} className={cls} />;
  if (type.includes('error')) return <AlertCircle size={14} className="shrink-0 text-red-400" />;
  return <Info size={14} className={cls} />;
}

function NotificationRow({ n }: { n: Notification }) {
  const [expanded, setExpanded] = useState(false);
  const parsedDate = parseFirestoreDate(n.createdAt);
  const dateStr = parsedDate ? format(parsedDate, 'MMM dd, yyyy HH:mm') : '—';

  return (
    <>
      <tr
        className="block md:table-row bg-white md:bg-transparent hover:bg-rice-50/60 cursor-pointer border-b border-rice-200 transition-colors p-4 md:p-0 space-y-3 md:space-y-0"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Type</span>
          <div className="flex items-center gap-2">
            <TypeIcon type={n.type} />
            <span className="text-xs font-mono text-ink-500">{n.type}</span>
          </div>
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Title / Recipient</span>
          <div className="text-right md:text-left">
            <div className="font-semibold text-ink-900 text-sm">{n.title}</div>
            <div className="text-ink-500 font-mono text-xs truncate max-w-[180px]">{n.recipientId}</div>
          </div>
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Channel</span>
          <ChannelBadge channel={n.channel} />
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Status</span>
          <StatusBadge status={n.status} />
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-xs text-ink-500 font-sans">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Created</span>
          {dateStr}
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-center text-xs text-ink-500 font-data">
          <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Retries</span>
          {n.retryCount}
        </td>
      </tr>
      {expanded && (
        <tr className="block md:table-row bg-rice-50/50 border-b border-rice-300">
          <td colSpan={6} className="block md:table-cell px-4 md:px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              <div>
                <div className="text-ink-500 uppercase tracking-wider font-semibold mb-1">Message</div>
                <div className="text-ink-800 leading-relaxed">{n.message}</div>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-ink-500 uppercase tracking-wider font-semibold">Related Entity: </span>
                  <span className="font-mono text-ink-700">{n.relatedEntityType ?? '—'} / {n.relatedEntityId ?? '—'}</span>
                </div>
                {n.errorMessage && (
                  <div>
                    <span className="text-red-600 font-semibold">Error: </span>
                    <span className="text-red-700">{n.errorMessage}</span>
                  </div>
                )}
                {n.sentAt && (
                  <div>
                    <span className="text-ink-500">Sent: </span>
                    <span className="text-ink-700 font-mono">
                      {parseFirestoreDate(n.sentAt) ? format(parseFirestoreDate(n.sentAt) as Date, 'MMM dd, HH:mm') : '—'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function NotificationHistoryPage() {
  const [search, setSearch] = useState('');
  const { data: notifications, isLoading, error, refetch } = useNotificationHistory();

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <ErrorState
        title="Could not load notification history"
        description="Please try again."
        onRetry={refetch}
      />
    );
  }

  const filtered = (notifications ?? []).filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q) ||
      n.recipientId.toLowerCase().includes(q) ||
      n.message.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-ink-900 flex items-center gap-2">
          <History className="text-ink-500" size={26} />
          Notification History
        </h1>
        <p className="text-ink-500 font-sans text-sm mt-1">
          Complete audit trail of all notifications across all channels.
        </p>
      </div>

      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by type, title, recipient..."
          className="w-full pl-9 pr-4 py-2.5 border border-rice-300 rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bell size={36} className="text-ink-300" />}
          title="No notification history"
          description="No notifications have been sent yet."
        />
      ) : (
        <Card className="border-rice-300 overflow-hidden">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-sm block md:table">
              <thead className="hidden md:table-header-group bg-rice-50 border-b border-rice-300 text-ink-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Title / Recipient</th>
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-center">Retries</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {filtered.map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-rice-200 bg-rice-50/50 text-xs text-ink-500 font-sans">
            Showing {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          </div>
        </Card>
      )}
    </div>
  );
}
