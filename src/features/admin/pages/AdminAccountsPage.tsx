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
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { accountsRepository } from '@/shared/services/firestore/accountsRepository';
import { useAdminPayments } from '@/features/customer/hooks/usePayments';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import toast from 'react-hot-toast';

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function getStartAndEndOfMonth() {
  const today = getTodayIST();
  const year = parseInt(today.substring(0, 4), 10);
  const month = parseInt(today.substring(5, 7), 10);
  const paddedMonth = month.toString().padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate().toString().padStart(2, '0');

  // Boundaries in Asia/Kolkata (UTC+05:30)
  const start = new Date(`${year}-${paddedMonth}-01T00:00:00+05:30`);
  const end = new Date(`${year}-${paddedMonth}-${lastDay}T23:59:59.999+05:30`);
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
  const triggerDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDaily = async () => {
    try {
      const csvString = await accountsRepository.generateDailyReport(today);
      triggerDownload(csvString, `daily_report_${today}.csv`);
      toast.success('Daily report downloaded');
    } catch {
      toast.error('Failed to generate daily report');
    }
  };

  const handleDownloadMonthly = async () => {
    try {
      const monthStr = today.substring(0, 7); // YYYY-MM
      const csvString = await accountsRepository.generateMonthlyReport(monthStr);
      triggerDownload(csvString, `monthly_report_${monthStr}.csv`);
      toast.success('Monthly report downloaded');
    } catch {
      toast.error('Failed to generate monthly report');
    }
  };

  if (isError) {
    return (
      <div className="space-y-8">
        <PageHeader userName="Accounts & Billing" subtitle="Dashboard / Accounts" />
        <ErrorState 
          title="Failed to load accounts data" 
          description={error instanceof Error ? error.message : 'Unknown error occurred'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader 
        userName="Accounts & Billing"
        subtitle="Manage revenue, invoices, and financial reports"
        actions={
          <div className="flex gap-4">
            <Button onClick={() => navigate('/admin/payroll')} variant="secondary" className="bg-white/10 text-primary hover:bg-gold/10 hover:text-gold">
              <Users className="mr-2 h-4 w-4" />
              Payroll Processing
            </Button>
            <Button onClick={() => navigate('/admin/payments')} variant="primary">
              <CreditCard className="mr-2 h-4 w-4" />
              Verify Payments
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Top Metrics Column */}
        <div className="space-y-6 md:col-span-1">
          {isLoadingPayments ? (
            <div className="animate-pulse h-32 bg-primary/10 rounded-xl"></div>
          ) : (
            <MetricCard 
              title="Current Month Revenue"
              value={`₹${currentMonthRevenue.toLocaleString()}`}
              icon={<IndianRupee size={24} />}
              color="mint"
            />
          )}

          {isLoadingPending ? (
            <div className="animate-pulse h-32 bg-primary/10 rounded-xl"></div>
          ) : (
            <Card hoverLift className="p-5 border-amber-200/50 bg-gradient-to-br from-background to-amber-50/30 cursor-pointer" onClick={() => navigate('/admin/payments')}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-sm border border-amber-200/50">
                  <Banknote size={24} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-primary">Pending Actions</h3>
                  <p className="text-sm text-text-muted">Awaiting Verification</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gold/10 flex items-center justify-between">
                <span className="text-4xl font-display font-bold text-primary">
                  {pendingCount}{hasMorePending ? '+' : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate('/admin/payments'); }}>
                  Review <CreditCard size={14} className="ml-2" />
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Tools Column */}
        <div className="md:col-span-2 space-y-6">
          <Card hoverLift className="p-6">
            <div className="mb-6">
              <h3 className="font-display font-bold text-xl text-primary">Financial Reports</h3>
              <p className="text-sm text-text-muted">Download system-generated CSV reports</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="border border-gold/20 rounded-xl p-5 flex items-center justify-between bg-gradient-to-br from-background to-primary/5 transition-all hover:border-gold/40">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                    <FileSpreadsheet className="text-primary" size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-primary">Daily Report</h4>
                    <p className="text-xs text-text-muted">For {today}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleDownloadDaily} className="bg-white hover:bg-gold/10 hover:text-gold border-gold/20 shadow-sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <div className="border border-gold/20 rounded-xl p-5 flex items-center justify-between bg-gradient-to-br from-background to-primary/5 transition-all hover:border-gold/40">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                    <FileSpreadsheet className="text-primary" size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-primary">Monthly Report</h4>
                    <p className="text-xs text-text-muted">For {today.substring(0, 7)}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={handleDownloadMonthly} className="bg-white hover:bg-gold/10 hover:text-gold border-gold/20 shadow-sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          <Card hoverLift className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/5 p-2.5 rounded-xl border border-primary/10">
                <ReceiptText className="text-primary" size={22} />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-primary">Generate Manual Invoice</h3>
                <p className="text-sm text-text-muted">Bill a customer directly for one-time services</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              <div className="flex-1 space-y-1.5 w-full">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Customer ID</label>
                <Input 
                  placeholder="e.g. CUST-123" 
                  value={invoiceCustomerId}
                  onChange={(e) => setInvoiceCustomerId(e.target.value)}
                  className="w-full bg-background"
                />
              </div>
              <div className="w-full sm:w-32 space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Amount (₹)</label>
                <Input 
                  type="number"
                  placeholder="0.00" 
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-full bg-background font-display"
                />
              </div>
              <div className="flex-[1.5] space-y-1.5 w-full">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Description</label>
                <Input 
                  placeholder="e.g. Special Event Catering" 
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  className="w-full bg-background"
                />
              </div>
              <Button 
                onClick={() => createInvoiceMutation.mutate()} 
                disabled={createInvoiceMutation.isPending}
                className="w-full sm:w-32 h-[42px]"
              >
                {createInvoiceMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Create Invoice'}
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
