import { useMyPayments } from '../hooks/usePayments';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import type { BadgeTone } from '@/shared/components/ui/Badge';
import { Receipt, Calendar, Smartphone, Banknote, Building2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { ManualPayment, ManualPaymentStatus, PaymentMethod } from '@/shared/types';

function statusBadgeTone(status: ManualPaymentStatus): BadgeTone {
  switch (status) {
    case 'verified': return 'success';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'neutral';
  }
}

function statusLabel(status: ManualPaymentStatus): string {
  switch (status) {
    case 'verified': return 'Verified';
    case 'pending': return 'Pending Verification';
    case 'rejected': return 'Rejected';
    default: return status;
  }
}

function StatusIcon({ status }: { status: ManualPaymentStatus }) {
  switch (status) {
    case 'verified': return <CheckCircle size={14} className="text-emerald-600" />;
    case 'pending': return <Clock size={14} className="text-amber-600" />;
    case 'rejected': return <XCircle size={14} className="text-red-600" />;
    default: return null;
  }
}

function MethodIcon({ method }: { method: PaymentMethod }) {
  switch (method) {
    case 'upi': return <Smartphone size={14} />;
    case 'cash': return <Banknote size={14} />;
    case 'bank_transfer': return <Building2 size={14} />;
    default: return null;
  }
}

function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'upi': return 'UPI';
    case 'cash': return 'Cash';
    case 'bank_transfer': return 'Bank Transfer';
    default: return method;
  }
}

function PaymentRow({ payment }: { payment: ManualPayment }) {
  const paidAt = payment.createdAt as any;
  const dateStr = paidAt?.toDate ? format(paidAt.toDate(), 'MMM dd, yyyy') : payment.paymentDate;

  return (
    <tr className="hover:bg-rice-50/60 transition-colors border-b border-rice-200 last:border-0">
      <td className="px-5 py-4">
        <div className="flex items-center gap-2 text-ink-800 font-medium font-sans text-sm">
          <Calendar size={13} className="text-ink-400 shrink-0" />
          {dateStr}
        </div>
        <div className="text-ink-400 text-xs font-mono mt-0.5 pl-5">{payment.paymentDate}</div>
      </td>
      <td className="px-5 py-4">
        <span className="font-bold text-ink-900 font-data text-base">₹{payment.amount.toLocaleString('en-IN')}</span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5 text-ink-600 font-sans text-sm capitalize">
          <MethodIcon method={payment.paymentMethod} />
          {methodLabel(payment.paymentMethod)}
        </div>
        {payment.referenceNumber && (
          <div className="text-ink-400 text-xs font-mono mt-0.5 truncate max-w-[150px]">
            {payment.referenceNumber}
          </div>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={payment.status} />
          <Badge tone={statusBadgeTone(payment.status)} className="text-[10px] uppercase">
            {statusLabel(payment.status)}
          </Badge>
        </div>
        {payment.verificationNotes && payment.status === 'rejected' && (
          <p className="text-xs text-red-600 mt-1 font-sans">{payment.verificationNotes}</p>
        )}
      </td>
    </tr>
  );
}

export function PaymentHistoryPage() {
  const { data: payments, isLoading, error, refetch } = useMyPayments();

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <ErrorState
        title="Could not load payment history"
        description="We had trouble retrieving your billing records. Please try again."
        onRetry={refetch}
      />
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={<Receipt size={40} className="text-ink-400" />}
          title="No Payment History"
          description="You have not submitted any payments yet. Once you submit a payment for your subscription it will appear here."
        />
      </div>
    );
  }

  const verified = payments.filter((p) => p.status === 'verified').length;
  const pending = payments.filter((p) => p.status === 'pending').length;
  const rejected = payments.filter((p) => p.status === 'rejected').length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-serif text-amber-950 font-bold">Payment History</h1>
        <p className="text-ink-600 font-sans text-sm mt-1">
          View all your submitted payments and their verification status.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Verified', count: verified, tone: 'success' },
          { label: 'Pending', count: pending, tone: 'warning' },
          { label: 'Rejected', count: rejected, tone: 'danger' },
        ].map(({ label, count, tone }) => (
          <Card key={label} className="p-4 text-center border-rice-300">
            <div className="text-2xl font-bold font-data text-ink-900">{count}</div>
            <Badge tone={tone as BadgeTone} className="mt-1 text-[10px] uppercase">
              {label}
            </Badge>
          </Card>
        ))}
      </div>

      <Card className="border-rice-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-sm">
            <thead className="bg-rice-50 border-b border-rice-300 text-ink-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Method / Ref</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
