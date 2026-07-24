import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  CreditCard, 
  Banknote, 
  Users, 
  Download, 
  IndianRupee, 
  ReceiptText,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { accountsRepository } from '@/shared/services/firestore/accountsRepository';
import { useAdminPayments } from '@/features/customer/hooks/usePayments';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import toast from 'react-hot-toast';

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function getStartAndEndOfMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ----------------------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------------------

export function AdminAccountsPage() {
  const navigate = useNavigate();
  const today = getTodayIST();
  
  // 1. Fetch current month payments for revenue calculation
  const { start, end } = useMemo(() => getStartAndEndOfMonth(), []);
  const { data: monthPayments = [], isLoading: isLoadingPayments, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'revenue', start.toISOString(), end.toISOString()],
    queryFn: () => accountsRepository.getPaymentsInRange(start, end),
  });

  // Calculate Revenue
  const currentMonthRevenue = useMemo(() => {
    return monthPayments.reduce((total, p) => total + p.amount, 0);
  }, [monthPayments]);

  // 2. Fetch pending verifications count
  const { data: pendingData, isLoading: isLoadingPending } = useAdminPayments('pending');
  const pendingCount = pendingData?.payments.length || 0;
  const hasMorePending = pendingData?.lastDoc != null;

  // 3. Form State for Manual Invoicing
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDesc, setInvoiceDesc] = useState('');

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceCustomerId || !invoiceAmount || !invoiceDesc) {
        throw new Error('All fields are required');
      }
      const amount = parseFloat(invoiceAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Amount must be a valid positive number');
      }
      await accountsRepository.generateInvoice({
        customerId: invoiceCustomerId.trim(),
        amount,
        description: invoiceDesc.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Manual invoice created successfully!');
      setInvoiceCustomerId('');
      setInvoiceAmount('');
      setInvoiceDesc('');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to create invoice');
    }
  });

  // 4. Report Generation Handlers
  const handleDownloadDaily = async () => {
    try {
      const res = await accountsRepository.generateDailyReport(today);
      const a = document.createElement('a');
      a.href = res.downloadUrl;
      a.download = `daily_report_${today}.csv`;
      a.click();
      toast.success('Daily report downloaded');
    } catch (err: unknown) {
      toast.error('Failed to generate daily report');
    }
  };

  const handleDownloadMonthly = async () => {
    try {
      const monthStr = today.substring(0, 7); // YYYY-MM
      const res = await accountsRepository.generateMonthlyReport(monthStr);
      const a = document.createElement('a');
      a.href = res.downloadUrl;
      a.download = `monthly_report_${monthStr}.csv`;
      a.click();
      toast.success('Monthly report downloaded');
    } catch (err: unknown) {
      toast.error('Failed to generate monthly report');
    }
  };

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Accounts & Billing" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Accounts' }]} />
        <ErrorState 
          title="Failed to load accounts data" 
          description={error instanceof Error ? error.message : 'Unknown error occurred'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Accounts & Billing"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Accounts' }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/payroll')} variant="secondary">
              <Users className="mr-2 h-4 w-4" />
              Payroll Processing
            </Button>
            <Button onClick={() => navigate('/admin/payments')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Verify Payments
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Top Metrics Column */}
        <div className="space-y-6 md:col-span-1">
          <Card className="p-5 border-rice-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-100 text-leaf-600">
                <IndianRupee size={20} />
              </div>
              <div>
                <h3 className="font-medium text-ink-900">Current Month</h3>
                <p className="text-sm text-ink-500">Verified Revenue</p>
              </div>
            </div>
            
            <div className="pt-2 border-t border-rice-100">
              {isLoadingPayments ? (
                <div className="animate-pulse h-10 bg-rice-200 rounded w-1/2"></div>
              ) : (
                <span className="text-4xl font-display font-semibold text-leaf-600">
                  ₹{currentMonthRevenue.toLocaleString()}
                </span>
              )}
            </div>
          </Card>

          <Card className="p-5 border-rice-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sun-100 text-sun-600">
                <Banknote size={20} />
              </div>
              <div>
                <h3 className="font-medium text-ink-900">Pending Actions</h3>
                <p className="text-sm text-ink-500">Awaiting Verification</p>
              </div>
            </div>

            <div className="pt-2 border-t border-rice-100 flex items-center justify-between">
              {isLoadingPending ? (
                <div className="animate-pulse h-8 bg-rice-200 rounded w-1/3"></div>
              ) : (
                <>
                  <span className="text-3xl font-display font-semibold text-ink-900">
                    {pendingCount}{hasMorePending ? '+' : ''}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin/payments')}>
                    Review
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Tools Column */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 border-rice-300">
            <div className="mb-5">
              <h3 className="font-medium text-lg text-ink-900">Financial Reports</h3>
              <p className="text-sm text-ink-500">Download system-generated CSV reports</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border border-rice-200 rounded-xl p-4 flex items-center justify-between bg-rice-50/50">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="text-leaf-500" size={24} />
                  <div>
                    <h4 className="font-medium text-ink-900 text-sm">Daily Report</h4>
                    <p className="text-xs text-ink-500">For {today}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleDownloadDaily}>
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
              </div>

              <div className="border border-rice-200 rounded-xl p-4 flex items-center justify-between bg-rice-50/50">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="text-leaf-500" size={24} />
                  <div>
                    <h4 className="font-medium text-ink-900 text-sm">Monthly Report</h4>
                    <p className="text-xs text-ink-500">For {today.substring(0, 7)}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleDownloadMonthly}>
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-rice-300">
            <div className="flex items-center gap-2 mb-5">
              <ReceiptText className="text-ink-500" size={20} />
              <div>
                <h3 className="font-medium text-lg text-ink-900">Generate Manual Invoice</h3>
                <p className="text-sm text-ink-500">Bill a customer directly for one-time services</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-xs font-medium text-ink-600">Customer ID</label>
                <Input 
                  placeholder="e.g. CUST-123" 
                  value={invoiceCustomerId}
                  onChange={(e) => setInvoiceCustomerId(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="w-full sm:w-32 space-y-1">
                <label className="text-xs font-medium text-ink-600">Amount (₹)</label>
                <Input 
                  type="number"
                  placeholder="0.00" 
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-2 space-y-1 w-full">
                <label className="text-xs font-medium text-ink-600">Description</label>
                <Input 
                  placeholder="e.g. Special Event Catering" 
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button 
                onClick={() => createInvoiceMutation.mutate()} 
                disabled={createInvoiceMutation.isPending}
                className="w-full sm:w-auto"
              >
                {createInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
