import { useMyPayments } from '../hooks/usePayments';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { Receipt, Calendar, Smartphone, Banknote, Building2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { ManualPayment, ManualPaymentStatus, PaymentMethod } from '@/shared/types';

function statusBadgeVariant(status: ManualPaymentStatus): 'success' | 'warning' | 'danger' | 'default' {
  switch (status) {
    case 'verified': return 'success';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'default';
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
    case 'verified': return <CheckCircle size={14} className="text-success" />;
    case 'pending': return <Clock size={14} className="text-warning" />;
    case 'rejected': return <XCircle size={14} className="text-danger" />;
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
  const parsedDate = parseFirestoreDate(payment.createdAt);
  const dateStr = parsedDate ? format(parsedDate, 'MMM dd, yyyy') : payment.paymentDate;

  return (
    <tr className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 transition-colors border-b border-primary/10 last:border-0 p-4 md:p-0 space-y-3 md:space-y-0">
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">Date</span>
        <div className="flex items-center gap-2 text-primary font-bold font-sans text-sm">
          <Calendar size={14} className="text-gold shrink-0 hidden md:block" />
          {dateStr}
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">Amount</span>
        <span className="font-bold text-primary font-data text-base">₹{payment.amount.toLocaleString('en-IN')}</span>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">Method / Ref</span>
        <div className="text-right md:text-left">
          <div className="flex items-center justify-end md:justify-start gap-2 text-text-muted font-sans font-medium text-sm capitalize">
            <MethodIcon method={payment.paymentMethod} />
            {methodLabel(payment.paymentMethod)}
          </div>
          {payment.referenceNumber && (
            <div className="text-gold text-xs font-data mt-1 truncate max-w-[150px]">
              {payment.referenceNumber}
            </div>
          )}
        </div>
      </td>
      <td className="flex justify-between items-start md:items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans mt-0.5">Status</span>
        <div className="flex flex-col items-end md:items-start">
          <div className="flex items-center gap-2">
            <StatusIcon status={payment.status} />
            <Badge variant={statusBadgeVariant(payment.status)} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 shadow-sm">
              {statusLabel(payment.status)}
            </Badge>
          </div>
          {payment.verificationNotes && payment.status === 'rejected' && (
            <p className="text-xs text-danger mt-1.5 font-sans font-medium text-right md:text-left max-w-[200px]">{payment.verificationNotes}</p>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PaymentHistoryPage() {
  const { data: payments, isLoading, error, refetch } = useMyPayments();

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <ErrorState
          title="Could not load payment history"
          description="We had trouble retrieving your billing records. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <EmptyState
          icon={<Receipt size={48} className="text-primary/40" />}
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
    <div className="space-y-8 pb-12 pt-6">
      <div className="max-w-5xl mx-auto space-y-8 px-4 md:px-0">
        <div className="mb-8">
          <h1 className="text-3xl font-display text-primary font-bold">Payment History</h1>
          <p className="text-text-muted mt-2 font-sans font-medium">
            View all your submitted payments and their verification status.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[
            { label: 'Verified', count: verified, variant: 'success' },
            { label: 'Pending', count: pending, variant: 'warning' },
            { label: 'Rejected', count: rejected, variant: 'danger' },
          ].map(({ label, count, variant }) => (
            <Card key={label} className="p-6 text-center border-primary/20 shadow-sm bg-gradient-to-b from-primary/5 to-transparent">
              <div className="text-3xl font-bold font-data text-primary mb-2">{count}</div>
              <Badge variant={variant as any} className="mt-1 text-[10px] uppercase font-bold tracking-widest shadow-sm">
                {label}
              </Badge>
            </Card>
          ))}
        </div>

        <Card className="border-primary/20 overflow-hidden shadow-sm p-0">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left font-sans text-sm block md:table">
              <thead className="hidden md:table-header-group bg-primary/5 border-b border-primary/10 text-primary font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-5">Date</th>
                  <th className="px-6 py-5">Amount</th>
                  <th className="px-6 py-5">Method / Ref</th>
                  <th className="px-6 py-5">Status</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group bg-background divide-y divide-primary/5">
                {payments.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
