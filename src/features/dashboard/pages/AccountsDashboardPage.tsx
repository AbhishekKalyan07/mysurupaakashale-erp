import { useState, useMemo } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumTable, PremiumTableRow, PremiumTableCell } from '@/shared/components/ui/PremiumTable';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useAccountsDashboard, useGenerateDailyReport, useGenerateMonthlyReport } from '@/features/accounts/hooks/useAccounts';
import { FileText, IndianRupee, ShoppingBag, Receipt, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { toast } from 'react-hot-toast';

export function AccountsDashboardPage() {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  // Compute start/end as ISO strings so TanStack Query keys change when dateRange changes
  const { startStr, endStr, start, end } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (dateRange === 'week') start.setDate(end.getDate() - 7);
    if (dateRange === 'month') start.setMonth(end.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    return {
      start,
      end,
      startStr: start.toISOString().split('T')[0],
      endStr: end.toISOString().split('T')[0],
    };
  }, [dateRange]);

  const { payments, invoices, orders, isLoading, isError } = useAccountsDashboard(start, end, startStr, endStr);

  const dailyReportMutation = useGenerateDailyReport();
  const monthlyReportMutation = useGenerateMonthlyReport();

  if (isLoading) return <LoadingScreen />;
  if (isError) return <div className="p-8 text-danger">Failed to load accounts data.</div>;

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const outstandingInvoices = invoices.filter(inv => inv.status === 'issued' || inv.status === 'overdue').length;

  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
  const failedOrders = orders.filter(o => o.status === 'failed_delivery').length;
  const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

  const handleGenerateReport = async (type: 'daily' | 'monthly') => {
    setGeneratingReport(type);
    try {
      if (type === 'daily') {
        const todayStr = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { timeZone: APP_CONFIG.timezone }).format(new Date());
        const result = await dailyReportMutation.mutateAsync(todayStr);
        toast.success(`Report generated: ${result.downloadUrl}`);
      } else {
        const monthStr = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { year: 'numeric', month: '2-digit', timeZone: APP_CONFIG.timezone }).format(new Date()).slice(0, 7);
        const result = await monthlyReportMutation.mutateAsync(monthStr);
        toast.success(`Report generated: ${result.downloadUrl}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report.');
    } finally {
      setGeneratingReport(null);
    }
  };

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName="Accounts Team"
        subtitle="Financial overview and operational reporting."
        actions={
          <>
            <Button variant="secondary" onClick={() => handleGenerateReport('daily')} isLoading={generatingReport === 'daily'}>
              <FileText size={16} className="mr-2"/> Daily Report
            </Button>
            <Button onClick={() => handleGenerateReport('monthly')} isLoading={generatingReport === 'monthly'}>
              <FileText size={16} className="mr-2"/> Monthly Report
            </Button>
          </>
        }
      />

      <div className="flex gap-2 p-1 bg-white border border-gold/20 rounded-lg w-fit shadow-sm">
        {(['today', 'week', 'month'] as const).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
              dateRange === range ? 'bg-primary shadow-sm text-white' : 'text-text-muted hover:text-primary hover:bg-background'
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 flex flex-col gap-2 border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-text-muted text-sm font-medium">
            <IndianRupee size={18} className="text-success" /> Revenue Captured
          </div>
          <div className="text-3xl font-display font-bold text-primary mt-1">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-text-muted/80 mt-1">From {payments.length} successful payments</div>
        </Card>

        <Card className="p-6 flex flex-col gap-2 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-2 text-text-muted text-sm font-medium">
            <Receipt size={18} className="text-amber-500" /> Total Invoiced
          </div>
          <div className="text-3xl font-display font-bold text-primary mt-1">
            {formatCurrency(totalInvoiced)}
          </div>
          <div className="text-xs text-text-muted/80 mt-1">{invoices.length} invoices generated</div>
        </Card>

        <Card className="p-6 flex flex-col gap-2 border-l-4 border-l-warning">
          <div className="flex items-center gap-2 text-text-muted text-sm font-medium">
            <AlertCircle size={18} className="text-warning" /> Outstanding Invoices
          </div>
          <div className="text-3xl font-display font-bold text-primary mt-1">
            {outstandingInvoices}
          </div>
          <div className="text-xs text-warning mt-1">Requires follow-up</div>
        </Card>

        <Card className="p-6 flex flex-col gap-2 border-l-4 border-l-info">
          <div className="flex items-center gap-2 text-text-muted text-sm font-medium">
            <ShoppingBag size={18} className="text-info" /> Orders Generated
          </div>
          <div className="text-3xl font-display font-bold text-primary mt-1">
            {orders.length}
          </div>
          <div className="text-xs text-text-muted/80 mt-1">In selected period</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-primary">Operational Summary</h2>
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-background rounded-xl border border-gold/10">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-success" size={20}/>
                  <span className="font-medium text-primary">Delivered Successfully</span>
                </div>
                <span className="text-xl font-bold font-display text-primary">{deliveredOrders}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-background rounded-xl border border-gold/10">
                <div className="flex items-center gap-3">
                  <XCircle className="text-danger" size={20}/>
                  <span className="font-medium text-primary">Failed Deliveries</span>
                </div>
                <span className="text-xl font-bold font-display text-primary">{failedOrders}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-background rounded-xl border border-gold/10">
                <div className="flex items-center gap-3">
                  <RefreshCw className="text-text-muted" size={20}/>
                  <span className="font-medium text-primary">Cancelled / Skipped</span>
                </div>
                <span className="text-xl font-bold font-display text-primary">{cancelledOrders}</span>
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-display font-semibold text-primary">Recent Invoices</h2>
          <PremiumTable 
            columns={['Invoice #', 'Date', 'Amount', 'Status']} 
            isEmpty={invoices.length === 0}
            emptyState="No invoices in this period"
          >
            {invoices.slice(0, 5).map(inv => (
              <PremiumTableRow key={inv.id}>
                <PremiumTableCell className="font-medium">{inv.invoiceNumber}</PremiumTableCell>
                <PremiumTableCell className="text-text-muted">
                  {inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : 'N/A'}
                </PremiumTableCell>
                <PremiumTableCell className="font-semibold">{formatCurrency(inv.totalAmount)}</PremiumTableCell>
                <PremiumTableCell>
                  <Badge variant={
                    inv.status === 'paid' ? 'success' :
                    inv.status === 'issued' ? 'warning' :
                    'default'
                  }>
                    {inv.status}
                  </Badge>
                </PremiumTableCell>
              </PremiumTableRow>
            ))}
          </PremiumTable>
        </section>
      </div>
    </div>
  );
}
