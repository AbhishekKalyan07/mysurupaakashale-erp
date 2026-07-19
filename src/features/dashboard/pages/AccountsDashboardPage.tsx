import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { useAccountsDashboard, useGenerateDailyReport, useGenerateMonthlyReport } from '@/features/accounts/hooks/useAccounts';
import { FileText, IndianRupee, ShoppingBag, Receipt, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currency';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { toast } from 'react-hot-toast';

export function AccountsDashboardPage() {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  const getRangeDates = () => {
    const end = new Date();
    const start = new Date();
    if (dateRange === 'week') start.setDate(end.getDate() - 7);
    if (dateRange === 'month') start.setMonth(end.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  };

  const { start, end } = getRangeDates();
  const { payments, invoices, orders, isLoading, isError } = useAccountsDashboard(start, end);

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Receipt className="text-leaf-600" />
            Accounts & Billing
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Financial overview and operational reporting
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => handleGenerateReport('daily')} isLoading={generatingReport === 'daily'}>
            <FileText size={16} className="mr-2"/> Daily Report
          </Button>
          <Button onClick={() => handleGenerateReport('monthly')} isLoading={generatingReport === 'monthly'}>
            <FileText size={16} className="mr-2"/> Monthly Report
          </Button>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-rice-100 rounded-lg w-fit">
        {(['today', 'week', 'month'] as const).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              dateRange === range ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex flex-col gap-1 border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-ink-500 text-sm font-medium">
            <IndianRupee size={16} /> Revenue Captured
          </div>
          <div className="text-3xl font-display font-bold text-ink-900 mt-1">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-ink-400 mt-2">From {payments.length} successful payments</div>
        </Card>

        <Card className="p-5 flex flex-col gap-1 border-l-4 border-l-turmeric-500">
          <div className="flex items-center gap-2 text-ink-500 text-sm font-medium">
            <Receipt size={16} /> Total Invoiced
          </div>
          <div className="text-3xl font-display font-bold text-ink-900 mt-1">
            {formatCurrency(totalInvoiced)}
          </div>
          <div className="text-xs text-ink-400 mt-2">{invoices.length} invoices generated</div>
        </Card>

        <Card className="p-5 flex flex-col gap-1 border-l-4 border-l-warning">
          <div className="flex items-center gap-2 text-ink-500 text-sm font-medium">
            <AlertCircle size={16} /> Outstanding Invoices
          </div>
          <div className="text-3xl font-display font-bold text-ink-900 mt-1">
            {outstandingInvoices}
          </div>
          <div className="text-xs text-warning mt-2">Requires follow-up</div>
        </Card>

        <Card className="p-5 flex flex-col gap-1 border-l-4 border-l-info">
          <div className="flex items-center gap-2 text-ink-500 text-sm font-medium">
            <ShoppingBag size={16} /> Orders Generated
          </div>
          <div className="text-3xl font-display font-bold text-ink-900 mt-1">
            {orders.length}
          </div>
          <div className="text-xs text-ink-400 mt-2">In selected period</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ink-900">Operational Summary</h2>
          <Card className="p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-rice-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-success" size={20}/>
                  <span className="font-medium text-ink-900">Delivered Successfully</span>
                </div>
                <span className="text-xl font-bold font-data text-ink-900">{deliveredOrders}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-rice-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <XCircle className="text-danger" size={20}/>
                  <span className="font-medium text-ink-900">Failed Deliveries</span>
                </div>
                <span className="text-xl font-bold font-data text-ink-900">{failedOrders}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-rice-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <RefreshCw className="text-ink-400" size={20}/>
                  <span className="font-medium text-ink-900">Cancelled / Skipped</span>
                </div>
                <span className="text-xl font-bold font-data text-ink-900">{cancelledOrders}</span>
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ink-900">Recent Invoices</h2>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-rice-50 text-ink-500 font-medium">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rice-100">
                  {invoices.slice(0, 5).map(inv => (
                    <tr key={inv.id} className="hover:bg-rice-25">
                      <td className="px-4 py-3 font-data text-ink-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-ink-500">
                        {inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inv.status === 'paid' ? 'bg-success-subtle text-success' :
                          inv.status === 'issued' ? 'bg-warning-subtle text-warning' :
                          'bg-rice-200 text-ink-600'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-ink-400">No invoices in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
