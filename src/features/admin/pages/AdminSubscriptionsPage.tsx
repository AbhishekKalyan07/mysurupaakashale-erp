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
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumBadge as Badge, type PremiumBadgeProps } from '@/shared/components/ui/PremiumBadge';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
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
const STATUS_TONE: Record<SubscriptionStatus, PremiumBadgeProps['variant']> = {
  draft: 'default',
  pending_payment: 'warning',
  active: 'success',
  paused: 'info',
  cancelled: 'danger',
  expired: 'default',
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
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-primary/10">
        <div className="p-6 border-b border-primary/10 bg-primary/5">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-primary font-display">Subscription Details</h2>
              <p className="text-text-muted text-xs font-mono mt-1 bg-background px-2 py-1 rounded inline-block border border-primary/10">{subscription.id}</p>
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-red-500 transition-colors p-1 bg-background rounded-full border border-primary/10">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm font-sans">
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 col-span-2 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Customer</div>
              <div className="font-bold text-primary text-lg">{subscription.customerName}</div>
              <div className="text-text-muted text-xs font-medium">{subscription.customerPhone}</div>
              {subscription.customerAddress && (
                <div className="text-primary text-xs mt-2 p-2 bg-background rounded border border-primary/10">{subscription.customerAddress}</div>
              )}
              <div className="text-text-muted text-[10px] font-mono mt-2">{subscription.customerId}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Plan</div>
              <div className="font-bold text-primary">{subscription.planName}</div>
              <div className="text-text-muted text-xs font-medium capitalize">{subscription.planTier} · Qty {subscription.quantity}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Price / day</div>
              <div className="font-bold text-gold-dark text-xl font-display">₹{subscription.pricePerDaySnapshot.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Start Date</div>
              <div className="font-bold text-primary">{formatDate(subscription.startDate)}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">End Date</div>
              <div className="font-bold text-primary">{formatDate(subscription.endDate)}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Credit Balance</div>
              <div className="font-bold text-gold-dark text-lg font-display">₹{subscription.creditBalance.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Security Deposit</div>
              <div className="font-bold text-primary text-lg font-display">₹{subscription.depositAmount.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 col-span-2 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-2">Status</div>
              <div className="flex flex-col gap-3">
                <div><Badge variant={STATUS_TONE[subscription.status]} className="capitalize px-3 py-1 text-xs">{subscription.status.replace('_', ' ')}</Badge></div>
                {subscription.pauseStartDate && (
                  <div className="text-xs text-text-muted font-medium bg-amber-50 border border-amber-200 p-2 rounded-lg text-amber-900">
                    Pause Scheduled: <strong>{formatDate(subscription.pauseStartDate)}</strong>
                    {subscription.pauseEndDate && <span> to <strong>{formatDate(subscription.pauseEndDate)}</strong></span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(canApproveReject || canPause || canResume) && (
            <div className="border-t border-primary/10 pt-5 mt-2">
              {!confirmAction ? (
                <>
                  {canApproveReject && (
                    <>
                      <label className="block text-[10px] font-bold text-text-muted mb-2 font-sans uppercase tracking-wider">
                        Rejection reason (optional)
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Add a note the customer will see if you reject this subscription..."
                        rows={2}
                        className="w-full border border-primary/20 bg-background rounded-xl px-4 py-3 text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent resize-none mb-4 shadow-inner"
                      />
                      <div className="flex gap-3">
                        <Button variant="secondary" className="flex-1 gap-2 font-sans font-bold text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" onClick={() => setConfirmAction('reject')}>
                          <XCircle size={18} /> Reject
                        </Button>
                        <Button variant="primary" className="flex-1 gap-2 font-sans font-bold" onClick={() => setConfirmAction('approve')}>
                          <CheckCircle size={18} /> Approve
                        </Button>
                      </div>
                    </>
                  )}
                  {canPause && (
                    <Button variant="secondary" className="w-full gap-2 font-sans font-bold text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300" onClick={() => setConfirmAction('pause')}>
                      <Pause size={18} /> Pause Subscription
                    </Button>
                  )}
                  {canResume && (
                    <Button variant="primary" className="w-full gap-2 font-sans font-bold" onClick={() => setConfirmAction('resume')}>
                      <Play size={18} /> Resume Subscription
                    </Button>
                  )}
                </>
              ) : (
                <div className={`rounded-xl p-5 ${confirmAction === 'approve' || confirmAction === 'resume' ? 'bg-emerald-50 border border-emerald-200' : confirmAction === 'reject' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'} shadow-sm`}>
                  <div className={`flex items-center gap-2 mb-3 ${confirmAction === 'approve' || confirmAction === 'resume' ? 'text-emerald-700' : confirmAction === 'reject' ? 'text-red-700' : 'text-amber-700'}`}>
                    <AlertTriangle size={20} />
                    <span className="font-display font-bold text-base capitalize">Confirm {confirmAction}</span>
                  </div>
                  <p className={`text-sm font-sans mb-5 font-medium ${confirmAction === 'approve' || confirmAction === 'resume' ? 'text-emerald-800' : confirmAction === 'reject' ? 'text-red-800' : 'text-amber-800'}`}>
                    {confirmAction === 'approve' && 'This activates the subscription immediately without a linked payment record. Use this for confirmed off-platform payments — otherwise verify their payment from the Payments page instead.'}
                    {confirmAction === 'reject' && "This cancels the subscription request and notifies the customer."}
                    {confirmAction === 'pause' && 'Deliveries will stop during the selected period.'}
                    {confirmAction === 'resume' && 'Deliveries will continue as scheduled and any scheduled pauses will be cancelled.'}
                  </p>
                  
                  {confirmAction === 'pause' && (
                    <div className="flex gap-4 mb-5 text-left bg-white/50 p-4 rounded-lg border border-amber-200/50">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-amber-800 mb-1.5 font-sans uppercase tracking-wider">Start Date</label>
                        <input
                          type="date"
                          value={pauseStartDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setPauseStartDate(e.target.value)}
                          className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-amber-900"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-amber-800 mb-1.5 font-sans uppercase tracking-wider">End Date (Optional)</label>
                        <input
                          type="date"
                          value={pauseEndDate}
                          min={pauseStartDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => setPauseEndDate(e.target.value)}
                          className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-amber-900"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1 font-sans font-bold bg-white/50" onClick={() => setConfirmAction(null)}>
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      className={`flex-1 font-sans font-bold capitalize ${confirmAction === 'reject' ? '!bg-red-600 hover:!bg-red-700' : ''}`}
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
      className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 cursor-pointer transition-colors border-b border-primary/10 last:border-0 p-4 md:p-0 space-y-3 md:space-y-0 group"
      onClick={onSelect}
    >
      <td className="block md:table-cell md:px-6 md:py-5 text-sm font-sans">
        <div className="font-bold text-primary group-hover:text-gold transition-colors">{subscription.customerName}</div>
        <div className="text-text-muted text-[10px] font-mono truncate max-w-[140px] mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">{subscription.customerId}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-6 md:py-5 text-sm font-sans text-text-muted font-medium">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Phone</span>
        {subscription.customerPhone}
      </td>
      <td className="flex justify-between items-start md:items-center md:table-cell md:px-6 md:py-5 text-sm font-sans text-text-muted font-medium max-w-full md:max-w-[200px]" title={subscription.customerAddress || 'No address'}>
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider mt-0.5">Address</span>
        <div className="truncate text-right md:text-left max-w-[200px] md:max-w-[160px]">{subscription.customerAddress || <span className="italic text-text-muted/50">No address</span>}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-6 md:py-5 text-sm font-sans md:max-w-[140px]">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Plan</span>
        <div className="text-right md:text-left truncate">
          <div className="text-primary font-bold truncate" title={subscription.planName}>{subscription.planName}</div>
          <div className="text-text-muted text-[10px] capitalize font-medium uppercase tracking-wider mt-0.5">{subscription.planTier}</div>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-6 md:py-5 text-text-muted font-medium font-sans text-xs">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Start Date</span>
        <div className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block">{formatDate(subscription.startDate)}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-6 md:py-5 text-text-muted font-medium font-sans text-xs">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">End Date</span>
        <div className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block">{formatDate(subscription.endDate)}</div>
      </td>
      <td className="flex justify-between items-center md:table-cell md:px-6 md:py-5">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Status</span>
        <Badge variant={STATUS_TONE[subscription.status]} className="text-[10px] uppercase font-bold tracking-wider">{subscription.status.replace('_', ' ')}</Badge>
      </td>
      <td className="hidden md:table-cell px-6 py-5 text-right">
        <Button variant="ghost" size="sm" onClick={onSelect} className="font-sans text-xs font-bold text-primary hover:text-gold hover:bg-gold/10">
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

  if (isLoading) return <div className="p-8"><TableSkeleton /></div>;
  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader userName="Subscriptions" subtitle="Dashboard / Subscriptions" />
        <ErrorState title="Could not load subscriptions" description="We had trouble loading subscription records." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader userName="Subscriptions" subtitle="Manage customer subscription plans, approvals, and status" />

      <div className="flex gap-2 mb-4 border-b border-primary/10 pb-1 overflow-x-auto hide-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`shrink-0 px-5 py-2.5 text-sm font-bold font-sans rounded-t-xl transition-all uppercase tracking-wider ${
              activeTab === tab.value
                ? 'bg-background border border-b-background border-primary/10 text-gold-dark -mb-[1px] shadow-sm relative z-10'
                : 'text-text-muted hover:text-primary hover:bg-primary/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, or ID..."
          className="w-full pl-11 pr-4 py-3.5 border border-primary/20 bg-background rounded-xl text-sm font-sans text-primary placeholder:text-text-muted font-medium focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Compass size={48} className="text-primary/40" />}
          title="No subscriptions found"
          description={search ? 'No subscriptions match your search.' : `No ${activeTab === 'all' ? '' : activeTab.replace('_', ' ') + ' '}subscriptions at this time.`}
        />
      ) : (
        <Card className="border-primary/20 overflow-hidden p-0 shadow-md">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left text-sm block md:table font-sans">
              <thead className="hidden md:table-header-group bg-primary/5 border-b border-primary/10 text-text-muted text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 min-w-[160px]">Customer</th>
                  <th className="px-6 py-4 min-w-[120px]">Phone</th>
                  <th className="px-6 py-4 min-w-[180px]">Address</th>
                  <th className="px-6 py-4 min-w-[150px]">Plan</th>
                  <th className="px-6 py-4 min-w-[110px] whitespace-nowrap">Start Date</th>
                  <th className="px-6 py-4 min-w-[110px] whitespace-nowrap">End Date</th>
                  <th className="px-6 py-4 min-w-[100px]">Status</th>
                  <th className="px-6 py-4 text-right min-w-[80px]">Action</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group bg-background divide-y divide-primary/5">
                {rows.map((row) => (
                  <SubscriptionRowView key={row.id} subscription={row} onSelect={() => setSelected(row)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-primary/10 bg-primary/5 text-xs text-text-muted font-sans font-medium flex items-center justify-between">
            <span>Showing <strong className="text-primary">{rows.length}</strong> subscription{rows.length !== 1 ? 's' : ''}</span>
            {hasNextPage && (
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage} className="gap-2 font-sans text-xs font-bold text-primary hover:text-gold hover:bg-gold/10">
                Load more <ChevronDown size={16} />
              </Button>
            )}
          </div>
        </Card>
      )}

      {selected && <SubscriptionDetailDialog subscription={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
