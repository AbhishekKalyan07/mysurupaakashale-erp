import { useState } from 'react';
import { format } from 'date-fns';
import {
  Search,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  AlertTriangle,
  Compass,
  ChevronDown,
} from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import type { SubscriptionStatus } from '@/shared/types';
import {
  useAdminSubscriptions,
  useApproveSubscription,
  useRejectSubscription,
  usePauseSubscription,
  useResumeSubscription,
  type AdminStatusFilter,
  type SubscriptionRow,
} from '../hooks/useAdminSubscriptions';

// ── Status → badge tone ──────────────────────────────────────────────────────
const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  draft: 'neutral',
  pending_payment: 'warning',
  active: 'success',
  paused: 'info',
  cancelled: 'danger',
  expired: 'neutral',
};

const TABS: { label: string; value: AdminStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_payment' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'MMM dd, yyyy');
  } catch {
    return value;
  }
}

// ── Detail Dialog ────────────────────────────────────────────────────────────
function SubscriptionDetailDialog({ subscription, onClose }: { subscription: SubscriptionRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [pauseStartDate, setPauseStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [pauseEndDate, setPauseEndDate] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | 'pause' | 'resume' | null>(null);

  const approve = useApproveSubscription();
  const reject = useRejectSubscription();
  const pause = usePauseSubscription();
  const resume = useResumeSubscription();

  const isLoading = approve.isPending || reject.isPending || pause.isPending || resume.isPending;

  const canApproveReject = subscription.status === 'pending_payment' || subscription.status === 'draft';
  const canPause = subscription.status === 'active';
  const canResume = subscription.status === 'paused';

  const handleConfirm = async () => {
    if (confirmAction === 'approve') await approve.mutateAsync(subscription);
    else if (confirmAction === 'reject') await reject.mutateAsync({ subscription, reason: reason || undefined });
    else if (confirmAction === 'pause') {
      const today = new Date().toISOString().split('T')[0];
      const shouldPauseNow = !pauseStartDate || pauseStartDate <= today;
      await pause.mutateAsync({ 
        subscription, 
        shouldPauseNow,
        pauseStartDate: pauseStartDate || null, 
        pauseEndDate: pauseEndDate || null 
      });
    }
    else if (confirmAction === 'resume') await resume.mutateAsync(subscription);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-rice-300">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-ink-900 font-sans">Subscription Details</h2>
              <p className="text-ink-500 text-xs font-mono mt-1">{subscription.id}</p>
            </div>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 p-1">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm font-sans">
            <div className="bg-rice-50 rounded-lg p-3 col-span-2">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Customer</div>
              <div className="font-semibold text-ink-900">{subscription.customerName}</div>
              <div className="text-ink-500 text-xs">{subscription.customerPhone}</div>
              {subscription.customerAddress && (
                <div className="text-ink-600 text-xs mt-1 italic">{subscription.customerAddress}</div>
              )}
              <div className="text-ink-400 text-xs font-mono mt-1">{subscription.customerId}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Plan</div>
              <div className="font-semibold text-ink-900">{subscription.planName}</div>
              <div className="text-ink-500 text-xs capitalize">{subscription.planTier} · Qty {subscription.quantity}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Price / day</div>
              <div className="font-bold text-ink-900 text-lg font-data">₹{subscription.pricePerDaySnapshot.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Start Date</div>
              <div className="font-semibold text-ink-900">{formatDate(subscription.startDate)}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">End Date</div>
              <div className="font-semibold text-ink-900">{formatDate(subscription.endDate)}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Credit Balance</div>
              <div className="font-semibold text-ink-900 font-data">₹{subscription.creditBalance.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Security Deposit</div>
              <div className="font-semibold text-ink-900 font-data">₹{subscription.depositAmount.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3 col-span-2">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-3">
                <Badge tone={STATUS_TONE[subscription.status]} className="capitalize">{subscription.status.replace('_', ' ')}</Badge>
                {subscription.pauseStartDate && (
                  <div className="text-xs text-ink-600 font-sans">
                    Pause Scheduled: <strong>{formatDate(subscription.pauseStartDate)}</strong>
                    {subscription.pauseEndDate && <span> to <strong>{formatDate(subscription.pauseEndDate)}</strong></span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(canApproveReject || canPause || canResume) && (
            <div className="border-t border-rice-300 pt-4">
              {!confirmAction ? (
                <>
                  {canApproveReject && (
                    <>
                      <label className="block text-xs font-semibold text-ink-700 mb-2 font-sans uppercase tracking-wider">
                        Rejection reason (optional)
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Add a note the customer will see if you reject this subscription..."
                        rows={2}
                        className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400 resize-none mb-4"
                      />
                      <div className="flex gap-3">
                        <Button variant="danger" className="flex-1 gap-2 font-sans font-semibold" onClick={() => setConfirmAction('reject')}>
                          <XCircle size={16} /> Reject
                        </Button>
                        <Button className="flex-1 gap-2 font-sans font-semibold" onClick={() => setConfirmAction('approve')}>
                          <CheckCircle size={16} /> Approve
                        </Button>
                      </div>
                    </>
                  )}
                  {canPause && (
                    <Button variant="secondary" className="w-full gap-2 font-sans font-semibold" onClick={() => setConfirmAction('pause')}>
                      <Pause size={16} /> Pause Subscription
                    </Button>
                  )}
                  {canResume && (
                    <Button className="w-full gap-2 font-sans font-semibold" onClick={() => setConfirmAction('resume')}>
                      <Play size={16} /> Resume Subscription
                    </Button>
                  )}
                </>
              ) : (
                <div className={`rounded-lg p-4 ${confirmAction === 'approve' || confirmAction === 'resume' ? 'bg-emerald-50 border border-emerald-200' : confirmAction === 'reject' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} />
                    <span className="font-bold font-sans text-sm capitalize">Confirm {confirmAction}</span>
                  </div>
                  <p className="text-ink-600 text-xs font-sans mb-4">
                    {confirmAction === 'approve' && 'This activates the subscription immediately without a linked payment record. Use this for confirmed off-platform payments — otherwise verify their payment from the Payments page instead.'}
                    {confirmAction === 'reject' && "This cancels the subscription request and notifies the customer."}
                    {confirmAction === 'pause' && 'Deliveries will stop during the selected period.'}
                    {confirmAction === 'resume' && 'Deliveries will continue as scheduled and any scheduled pauses will be cancelled.'}
                  </p>
                  
                  {confirmAction === 'pause' && (
                    <div className="flex gap-3 mb-4 text-left">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-ink-700 mb-1 font-sans uppercase tracking-wider">Start Date</label>
                        <input
                          type="date"
                          value={pauseStartDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setPauseStartDate(e.target.value)}
                          className="w-full border border-ink-400 rounded px-2 py-1.5 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-ink-700 mb-1 font-sans uppercase tracking-wider">End Date (Optional)</label>
                        <input
                          type="date"
                          value={pauseEndDate}
                          min={pauseStartDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => setPauseEndDate(e.target.value)}
                          className="w-full border border-ink-400 rounded px-2 py-1.5 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="flex-1 font-sans" onClick={() => setConfirmAction(null)}>
                      Back
                    </Button>
                    <Button
                      variant={confirmAction === 'reject' ? 'danger' : 'primary'}
                      size="sm"
                      className="flex-1 font-sans capitalize"
                      onClick={handleConfirm}
                      isLoading={isLoading}
                    >
                      Confirm {confirmAction}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function SubscriptionRowView({ subscription, onSelect }: { subscription: SubscriptionRow; onSelect: () => void }) {
  return (
    <tr
      className="block md:table-row bg-white md:bg-transparent hover:bg-rice-50/70 cursor-pointer transition-colors border-b border-rice-200 last:border-0 p-4 md:p-0 space-y-3 md:space-y-0"
      onClick={onSelect}
    >
      <td className="block md:table-cell md:px-4 md:py-4 text-sm font-sans">
        <div className="font-semibold text-ink-900">{subscription.customerName}</div>
        <div className="text-ink-400 text-xs font-mono truncate max-w-[140px]">{subscription.customerId}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-4 md:py-4 text-sm font-sans text-ink-600">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Phone</span>
        {subscription.customerPhone}
      </td>
      <td className="flex justify-between items-start md:items-center md:table-cell md:px-4 md:py-4 text-sm font-sans text-ink-600 max-w-full md:max-w-[200px]" title={subscription.customerAddress || 'No address'}>
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider mt-0.5">Address</span>
        <div className="truncate text-right md:text-left max-w-[200px] md:max-w-[160px]">{subscription.customerAddress || <span className="italic text-ink-400">No address</span>}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-4 md:py-4 text-sm font-sans md:max-w-[140px]">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Plan</span>
        <div className="text-right md:text-left truncate">
          <div className="text-ink-900 font-medium truncate" title={subscription.planName}>{subscription.planName}</div>
          <div className="text-ink-400 text-xs capitalize">{subscription.planTier}</div>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-4 md:py-4 text-ink-600 font-sans text-xs">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Start Date</span>
        {formatDate(subscription.startDate)}
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-4 md:py-4 text-ink-600 font-sans text-xs">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">End Date</span>
        {formatDate(subscription.endDate)}
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-4 md:py-4">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Status</span>
        <Badge tone={STATUS_TONE[subscription.status]} className="text-[10px] uppercase">{subscription.status.replace('_', ' ')}</Badge>
      </td>
      <td className="hidden md:table-cell px-4 py-4 text-right">
        <Button variant="ghost" size="sm" onClick={onSelect} className="font-sans text-xs">
          View
        </Button>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function AdminSubscriptionsPage() {
  const [activeTab, setActiveTab] = useState<AdminStatusFilter>('pending_payment');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubscriptionRow | null>(null);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAdminSubscriptions(activeTab);

  const rows = (data?.pages.flatMap((p) => p.rows) ?? []).filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.customerName.toLowerCase().includes(q) ||
      row.customerPhone.toLowerCase().includes(q) ||
      row.customerId.toLowerCase().includes(q) ||
      row.planName.toLowerCase().includes(q)
    );
  });

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subscriptions" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Subscriptions' }]} />
        <ErrorState title="Could not load subscriptions" description="We had trouble loading subscription records." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Subscriptions' }]} />

      <div className="flex gap-2 mb-2 border-b border-rice-300 pb-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`shrink-0 px-4 py-2 text-sm font-semibold font-sans rounded-t-lg transition-all ${
              activeTab === tab.value
                ? 'bg-white border border-b-white border-rice-300 text-ink-900 -mb-px'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, or ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-ink-400 rounded-lg text-sm font-sans text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Compass size={40} className="text-ink-300" />}
          title="No subscriptions found"
          description={search ? 'No subscriptions match your search.' : `No ${activeTab === 'all' ? '' : activeTab.replace('_', ' ') + ' '}subscriptions at this time.`}
        />
      ) : (
        <Card className="border-rice-300 overflow-hidden p-0">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left text-sm block md:table">
              <thead className="hidden md:table-header-group bg-rice-50 border-b border-rice-300 text-ink-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 min-w-[160px]">Customer</th>
                  <th className="px-4 py-3 min-w-[120px]">Phone</th>
                  <th className="px-4 py-3 min-w-[180px]">Address</th>
                  <th className="px-4 py-3 min-w-[150px]">Plan</th>
                  <th className="px-4 py-3 min-w-[110px] whitespace-nowrap">Start Date</th>
                  <th className="px-4 py-3 min-w-[110px] whitespace-nowrap">End Date</th>
                  <th className="px-4 py-3 min-w-[100px]">Status</th>
                  <th className="px-4 py-3 text-right min-w-[80px]">Action</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {rows.map((row) => (
                  <SubscriptionRowView key={row.id} subscription={row} onSelect={() => setSelected(row)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-rice-200 bg-rice-50/50 text-xs text-ink-500 font-sans flex items-center justify-between">
            <span>Showing {rows.length} subscription{rows.length !== 1 ? 's' : ''}</span>
            {hasNextPage && (
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage} className="gap-1 font-sans text-xs">
                Load more <ChevronDown size={14} />
              </Button>
            )}
          </div>
        </Card>
      )}

      {selected && <SubscriptionDetailDialog subscription={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
