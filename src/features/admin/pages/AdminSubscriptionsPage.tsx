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
  Truck,
  MoreVertical,
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
  useUpdateDeliveryPartner,
  type AdminStatusFilter,
  type SubscriptionRow,
} from '../hooks/useAdminSubscriptions';
import { useSubscriptionStats } from '@/features/customer/hooks/useMySubscription';
import { usePaymentDetail } from '@/features/customer/hooks/usePayments';
import { useQuery } from '@tanstack/react-query';
import { userRepository } from '@/shared/services/firestore/userRepository';

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
  const updateDP = useUpdateDeliveryPartner();

  const { data: subStats, isLoading: isStatsLoading } = useSubscriptionStats(subscription.id, subscription.customerId);
  const { data: payment } = usePaymentDetail(subscription.latestPaymentId ?? null);

  const { data: deliveryPartners } = useQuery({
    queryKey: ['users', 'delivery_partner'],
    queryFn: async () => {
      const { where } = await import('firebase/firestore');
      return userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true));
    },
    staleTime: 5 * 60_000,
  });

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
              {subscription.customerDisplayId && (
                <p className="text-text-muted text-xs font-mono mt-1 bg-background px-2 py-1 rounded inline-block border border-primary/10">{subscription.customerDisplayId}</p>
              )}
            </div>
            <button aria-label="Button action" onClick={onClose} className="text-text-muted hover:text-red-500 transition-colors p-1 bg-background rounded-full border border-primary/10">
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
              {subscription.customerDisplayId && (
                <div className="text-text-muted text-[10px] font-mono mt-2">{subscription.customerDisplayId}</div>
              )}
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-1">Plan & Preferences</div>
              <div className="font-bold text-primary">{subscription.planName}</div>
              <div className="text-text-muted text-xs font-medium capitalize">{subscription.planTier} · Qty {subscription.quantity}</div>
              {subscription.preferencesText && (
                <div className="text-primary text-[11px] mt-2 font-medium bg-background border border-primary/5 px-2 py-1 rounded inline-block">
                  {subscription.preferencesText}
                </div>
              )}
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
            
            {/* Stats */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 col-span-2 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-2">Delivery Statistics</div>
              {isStatsLoading ? (
                <div className="text-xs text-text-muted animate-pulse">Loading stats...</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-4 text-sm font-medium">
                    <span><strong className="text-primary">{subStats?.daysOrdered || 0}</strong> Days Delivered</span>
                    <span><strong className="text-primary">{subStats?.pausedDates?.length || 0}</strong> Paused Days</span>
                  </div>
                  {subStats && subStats.pausedDates.length > 0 && (
                    <div className="text-xs text-text-muted">Paused on: {subStats.pausedDates.join(', ')}</div>
                  )}
                </div>
              )}
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
                {payment?.screenshotUrl && (
                  <div className="mt-2 border-t border-primary/10 pt-3">
                    <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-2">Payment Screenshot</div>
                    <a href={payment.screenshotUrl} target="_blank" rel="noreferrer" className="block w-full max-w-sm rounded-xl overflow-hidden shadow-sm hover:opacity-90 transition-opacity">
                      <img src={payment.screenshotUrl} alt="Payment" className="w-full h-auto object-contain max-h-64 bg-black/5" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Partner Assignment */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 col-span-2 shadow-sm">
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
                <Truck size={12} /> Delivery Partner
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <select
                  value={subscription.deliveryPartnerId || ''}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    updateDP.mutate({ subscriptionId: subscription.id, deliveryPartnerId: value });
                  }}
                  disabled={updateDP.isPending}
                  className="flex-1 w-full border border-primary/20 bg-background rounded-lg px-3 py-2 text-sm font-sans text-primary focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
                >
                  <option value="">Not Assigned</option>
                  {deliveryPartners?.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName || p.id}</option>
                  ))}
                </select>
                {subscription.deliveryPartnerName && (
                  <Badge variant="info" className="text-[10px] shrink-0">Current: {subscription.deliveryPartnerName}</Badge>
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

// ── Subscription Card (Responsive Grid) ───────────────────────────────────────────────────
function SubscriptionCardView({ subscription, onSelect }: { subscription: SubscriptionRow; onSelect: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Card elevated className="relative bg-card transition-colors hover:border-secondary/40 group overflow-visible">
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
      )}
      
      <div 
        className="p-3.5 flex flex-col gap-2 cursor-pointer min-h-[140px]" 
        onClick={() => { if(!menuOpen) onSelect(); }}
      >
        {/* Top Header Row */}
        <div className="flex justify-between items-start">
          <div className="flex gap-2 items-center mt-1">
            {subscription.customerDisplayId && (
              <Badge variant="default" className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 shadow-sm bg-primary/5 text-primary border border-primary/10">
                {subscription.customerDisplayId}
              </Badge>
            )}
            <Badge variant={STATUS_TONE[subscription.status]} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 shadow-sm">
              {subscription.status.replace('_', ' ')}
            </Badge>
          </div>
          
          <button 
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-12 h-12 -mr-3 -mt-3 flex items-center justify-center text-text-muted hover:text-primary transition-colors z-20 relative rounded-full hover:bg-surface-2 shrink-0"
            aria-label="More actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Overflow Menu Dropdown */}
        {menuOpen && (
          <div className="absolute top-11 right-3 z-30 bg-card border border-border shadow-xl rounded-xl w-44 overflow-hidden flex flex-col py-1">
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}>View Details</button>
          </div>
        )}
        
        {/* Name Row */}
        <h3 className="font-bold text-text text-[15px] leading-snug group-hover:text-primary transition-colors line-clamp-2 -mt-1 pr-6">
          👤 {subscription.customerName}
        </h3>
        
        {/* Contact Info Inline */}
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-medium truncate mt-0.5">
          <span className="flex items-center gap-1 shrink-0"><span className="text-[13px] leading-none">📞</span> {subscription.customerPhone}</span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1 truncate"><span className="text-[13px] leading-none">📍</span> <span className="truncate">{subscription.customerAddress || 'No address'}</span></span>
        </div>

        {/* Chips Row (Bottom) */}
        <div className="flex gap-2 items-center mt-auto overflow-hidden pb-0.5">
          <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-surface-2 text-text font-semibold shrink-0 whitespace-nowrap truncate max-w-[120px]" title={subscription.planName}>
            🍛 {subscription.planName}
          </Badge>
          
          {subscription.deliveryPartnerName ? (
            <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 shrink-0 whitespace-nowrap truncate max-w-[90px]">
              🚚 {subscription.deliveryPartnerName}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 shadow-sm shrink-0 whitespace-nowrap">
              ⚠ No Driver
            </Badge>
          )}

          <div className="text-[10px] font-semibold text-text-muted shrink-0 ml-auto mr-1 truncate">
            End: {formatDate(subscription.endDate)}
          </div>
        </div>
      </div>
    </Card>
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
          <button aria-label="Button action"
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
        <div className="space-y-4">
          {/* Desktop Table View */}
          <Card className="p-0 overflow-hidden shadow-md border-primary/20 hidden lg:block">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                <tr>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Plan Details</th>
                  <th className="px-6 py-4">Dates</th>
                  <th className="px-6 py-4">Status & Partner</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5 bg-background">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-primary/5 transition-colors group cursor-pointer" onClick={() => setSelected(row)}>
                    <td className="px-6 py-4">
                      <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">{row.customerName}</div>
                      <div className="text-text-muted text-xs flex items-center gap-1 mt-0.5">
                        <span className="text-[13px] leading-none">📞</span> {row.customerPhone}
                      </div>
                      {row.customerDisplayId && <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">{row.customerDisplayId}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-primary font-medium">{row.planName}</div>
                      <div className="text-text-muted text-xs mt-0.5 capitalize">{row.planTier}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">{row.preferencesText}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-primary font-medium">Start: {formatDate(row.startDate)}</div>
                      <div className="text-xs text-text-muted mt-0.5">End: {formatDate(row.endDate)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-1.5">
                        <Badge variant={STATUS_TONE[row.status]} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 shadow-sm">
                          {row.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      {row.deliveryPartnerName ? (
                        <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 whitespace-nowrap">
                          🚚 {row.deliveryPartnerName}
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 shadow-sm whitespace-nowrap">
                          ⚠ No Driver
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(row); }}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile / Tablet Card View */}
          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {rows.map((row) => (
              <SubscriptionCardView key={row.id} subscription={row} onSelect={() => setSelected(row)} />
            ))}
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 pt-4 border-t border-primary/10 mt-4 text-center sm:text-left">
            <span className="text-xs font-medium text-text-muted">
              Showing <strong className="text-primary">{rows.length}</strong> subscription{rows.length !== 1 ? 's' : ''}
            </span>
            {hasNextPage && (
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage} className="gap-2 font-sans text-xs font-bold text-primary hover:text-gold hover:bg-gold/10">
                Load more <ChevronDown size={16} />
              </Button>
            )}
          </div>
        </div>
      )}

      {selected && <SubscriptionDetailDialog subscription={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
