import { useState } from 'react';
import { useAdminPayments, useApprovePayment, useRejectPayment } from '@/features/customer/hooks/usePayments';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import type { ManualPayment, ManualPaymentStatus } from '@/shared/types';
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Smartphone,
  Banknote,
  Building2,
  Receipt,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Payment Detail Dialog ──────────────────────────────────────────────────────
function PaymentDetailDialog({
  payment,
  onClose,
}: {
  payment: ManualPayment;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const approvePayment = useApprovePayment();
  const rejectPayment = useRejectPayment();

  // Fetch extra details needed for PDF / Email
  // These hooks are from `@tanstack/react-query` and standard for this project pattern
  const { useQuery } = require('@tanstack/react-query');
  const { userRepository } = require('@/shared/services/firestore/userRepository');
  const { subscriptionRepository } = require('@/shared/services/firestore/subscriptionRepository');
  const { mealPlanRepository } = require('@/shared/services/firestore/mealPlanRepository');
  const { ExternalLink, Image: ImageIcon } = require('lucide-react');

  const { data: user } = useQuery({
    queryKey: ['user', payment.customerId],
    queryFn: () => userRepository.getById(payment.customerId),
    enabled: !!payment.customerId,
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription', payment.subscriptionId],
    queryFn: () => subscriptionRepository.getById(payment.subscriptionId),
    enabled: !!payment.subscriptionId,
  });

  const { data: plan } = useQuery({
    queryKey: ['plan', subscription?.planId],
    queryFn: () => mealPlanRepository.getById(subscription!.planId),
    enabled: !!subscription?.planId,
  });

  const isLoading = approvePayment.isPending || rejectPayment.isPending;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    if (confirmAction === 'approve') {
      let meta;
      if (user && subscription && plan) {
        meta = {
          customerEmail: user.email,
          customerName: user.fullName,
          planName: plan.name,
          planTier: plan.tier,
          deliveryAddress: `Address ID: ${subscription.deliveryAddressId}`,
          pricePerDay: subscription.pricePerDaySnapshot,
          quantity: subscription.quantity || 1,
        };
      }
      await approvePayment.mutateAsync({ paymentId: payment.id, notes, meta });
    } else {
      await rejectPayment.mutateAsync({ paymentId: payment.id, notes });
    }
    onClose();
  };

  const paidAt = payment.createdAt as any;
  const submittedDate = paidAt?.toDate ? format(paidAt.toDate(), 'MMM dd, yyyy HH:mm') : payment.paymentDate;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-rice-300">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-ink-900 font-sans">Payment Details</h2>
              <p className="text-ink-500 text-xs font-mono mt-1">{payment.id}</p>
            </div>
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-600 p-1"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm font-sans">
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Customer</div>
              <div className="font-semibold text-ink-900">{payment.customerName}</div>
              <div className="text-ink-400 text-xs font-mono">{payment.customerId}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Amount</div>
              <div className="font-bold text-ink-900 text-xl font-data">₹{payment.amount.toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Method</div>
              <div className="font-semibold text-ink-900 capitalize">{payment.paymentMethod.replace('_', ' ')}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Billing Month</div>
              <div className="font-semibold text-ink-900">
                {payment.billingMonth ? payment.billingMonth : 'N/A'}
              </div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Payment Date</div>
              <div className="font-semibold text-ink-900">{payment.paymentDate}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Submitted On</div>
              <div className="font-semibold text-ink-900">{submittedDate}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3 col-span-2">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Reference / Transaction ID</div>
              <div className="font-mono text-ink-900 text-sm break-all">
                {payment.referenceNumber || <span className="text-ink-400 italic font-sans">Not provided</span>}
              </div>
            </div>
          </div>

          {/* Screenshot */}
          {payment.screenshotUrl && (
            <div className="border border-rice-300 rounded-lg overflow-hidden mt-4">
              <div className="bg-rice-50 px-3 py-2 border-b border-rice-300 flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider font-semibold text-ink-600 flex items-center gap-1.5">
                  <ImageIcon size={14} /> Proof of Payment
                </span>
                <a
                  href={payment.screenshotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 hover:text-emerald-700 text-xs flex items-center gap-1 font-semibold"
                >
                  Open Original <ExternalLink size={12} />
                </a>
              </div>
              <div className="bg-rice-100 p-2 flex justify-center">
                <img
                  src={payment.screenshotUrl}
                  alt="Payment Screenshot"
                  className="max-h-64 object-contain rounded border border-rice-200"
                />
              </div>
            </div>
          )}

          {payment.status !== 'pending' && (
            <div className={`rounded-lg p-4 border ${payment.status === 'verified' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5 text-ink-600">
                Verification Outcome
              </div>
              <Badge tone={payment.status === 'verified' ? 'success' : 'danger'} className="mb-2">
                {payment.status}
              </Badge>
              {payment.verificationNotes && (
                <p className="text-ink-700 text-sm font-sans mt-2">{payment.verificationNotes}</p>
              )}
            </div>
          )}

          {/* Action area */}
          {payment.status === 'pending' && (
            <div className="border-t border-rice-300 pt-4">
              {!confirmAction ? (
                <>
                  <label className="block text-xs font-semibold text-ink-700 mb-2 font-sans uppercase tracking-wider">
                    Verification Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this payment verification..."
                    rows={3}
                    className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans text-ink-900 focus:outline-none focus:ring-2 focus:ring-turmeric-400 resize-none mb-4"
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="danger"
                      className="flex-1 gap-2 font-sans font-semibold"
                      onClick={() => setConfirmAction('reject')}
                    >
                      <XCircle size={16} /> Reject
                    </Button>
                    <Button
                      className="flex-1 gap-2 font-sans font-semibold"
                      onClick={() => setConfirmAction('approve')}
                    >
                      <CheckCircle size={16} /> Approve
                    </Button>
                  </div>
                </>
              ) : (
                <div className={`rounded-lg p-4 ${confirmAction === 'approve' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} className={confirmAction === 'approve' ? 'text-emerald-700' : 'text-red-700'} />
                    <span className="font-bold font-sans text-sm">
                      {confirmAction === 'approve'
                        ? 'Confirm Payment Approval'
                        : 'Confirm Payment Rejection'}
                    </span>
                  </div>
                  <p className="text-ink-600 text-xs font-sans mb-4">
                    {confirmAction === 'approve'
                      ? 'This will verify the payment, activate the subscription, generate a PDF invoice, and email the customer.'
                      : 'This will reject the payment. The customer\'s subscription will remain pending and they will be notified.'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 font-sans"
                      onClick={() => setConfirmAction(null)}
                    >
                      Back
                    </Button>
                    <Button
                      variant={confirmAction === 'approve' ? 'primary' : 'danger'}
                      size="sm"
                      className="flex-1 font-sans"
                      onClick={handleConfirm}
                      isLoading={isLoading}
                    >
                      Confirm {confirmAction === 'approve' ? 'Approval' : 'Rejection'}
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

// ── Payment Row ────────────────────────────────────────────────────────────────
function PaymentRow({ payment, onSelect }: { payment: ManualPayment; onSelect: () => void }) {
  const paidAt = payment.createdAt as any;
  const dateStr = paidAt?.toDate ? format(paidAt.toDate(), 'MMM dd, yyyy') : payment.paymentDate;

  const statusTone = payment.status === 'verified' ? 'success' : payment.status === 'rejected' ? 'danger' : 'warning';

  const methodIcon =
    payment.paymentMethod === 'upi' ? <Smartphone size={13} /> :
    payment.paymentMethod === 'cash' ? <Banknote size={13} /> :
    <Building2 size={13} />;

  return (
    <tr
      className="hover:bg-rice-50/70 cursor-pointer transition-colors border-b border-rice-200 last:border-0"
      onClick={onSelect}
    >
      <td className="px-4 py-4 text-sm font-sans">
        <div className="font-semibold text-ink-900">{payment.customerName}</div>
        <div className="text-ink-400 text-xs font-mono truncate max-w-[140px]">{payment.customerId}</div>
      </td>
      <td className="px-4 py-4">
        <span className="font-bold text-ink-900 font-data">₹{payment.amount.toLocaleString('en-IN')}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1.5 text-ink-600 font-sans text-xs capitalize">
          {methodIcon}
          {payment.paymentMethod.replace('_', ' ')}
        </div>
        {payment.referenceNumber && (
          <div className="text-ink-400 text-xs font-mono truncate max-w-[130px] mt-0.5">{payment.referenceNumber}</div>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="text-ink-600 font-sans text-xs">{dateStr}</div>
      </td>
      <td className="px-4 py-4">
        <Badge tone={statusTone} className="text-[10px] uppercase">{payment.status}</Badge>
      </td>
      <td className="px-4 py-4 text-right">
        <Button variant="ghost" size="sm" onClick={onSelect} className="font-sans text-xs">
          View
        </Button>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type StatusFilter = ManualPaymentStatus | 'all';

const TABS: { label: string; value: StatusFilter; icon: React.ReactNode }[] = [
  { label: 'All', value: 'all', icon: <Receipt size={14} /> },
  { label: 'Pending', value: 'pending', icon: <Clock size={14} /> },
  { label: 'Verified', value: 'verified', icon: <CheckCircle size={14} /> },
  { label: 'Rejected', value: 'rejected', icon: <XCircle size={14} /> },
];

export function PaymentVerificationPage() {
  const [activeTab, setActiveTab] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null);
  const [sortField, setSortField] = useState<'createdAt' | 'amount'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: payments, isLoading, error, refetch } = useAdminPayments(activeTab);

  const filtered = (payments ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.customerName.toLowerCase().includes(q) ||
      p.customerId.toLowerCase().includes(q) ||
      (p.referenceNumber ?? '').toLowerCase().includes(q) ||
      p.subscriptionId.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const mult = sortDir === 'desc' ? -1 : 1;
    if (sortField === 'amount') return mult * (a.amount - b.amount);
    const aTs = (a.createdAt as any)?.toMillis?.() ?? 0;
    const bTs = (b.createdAt as any)?.toMillis?.() ?? 0;
    return mult * (aTs - bTs);
  });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field
      ? sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
      : null;

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <ErrorState
        title="Could not load payments"
        description="We had trouble loading the payment records."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-ink-900">Payment Verification</h1>
        <p className="text-ink-500 font-sans text-sm mt-1">
          Review, approve, and reject customer payment submissions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-rice-300 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold font-sans rounded-t-lg transition-all ${
              activeTab === tab.value
                ? 'bg-white border border-b-white border-rice-300 text-ink-900 -mb-px'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, ID, or reference number..."
          className="w-full pl-9 pr-4 py-2.5 border border-ink-400 rounded-lg text-sm font-sans text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Receipt size={40} className="text-ink-300" />}
          title="No payments found"
          description={search ? 'No payments match your search.' : `No ${activeTab === 'all' ? '' : activeTab + ' '}payments at this time.`}
        />
      ) : (
        <Card className="border-rice-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 border-b border-rice-300 text-ink-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink-700"
                    onClick={() => toggleSort('amount')}
                  >
                    <div className="flex items-center gap-1">Amount <SortIcon field="amount" /></div>
                  </th>
                  <th className="px-4 py-3">Method</th>
                  <th
                    className="px-4 py-3 cursor-pointer select-none hover:text-ink-700"
                    onClick={() => toggleSort('createdAt')}
                  >
                    <div className="flex items-center gap-1">Submitted <SortIcon field="createdAt" /></div>
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    onSelect={() => setSelectedPayment(payment)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-rice-200 bg-rice-50/50 text-xs text-ink-500 font-sans">
            Showing {sorted.length} payment{sorted.length !== 1 ? 's' : ''}
          </div>
        </Card>
      )}

      {selectedPayment && (
        <PaymentDetailDialog
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </div>
  );
}
