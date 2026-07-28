import { useState, useRef } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { useAnalyticsData, type DateRangeFilter } from '../hooks/useAnalyticsData';
import { RevenueTrendChart, OrderDistributionChart, PlanDistributionChart, PaymentMethodChart } from '../components/AnalyticsCharts';
import { TrendingUp, Users, CreditCard, Package, Download, Clock, Truck, ChefHat, CheckCircle, XCircle } from 'lucide-react';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';

export function BusinessAnalyticsPage() {
  const [filter, setFilter] = useState<DateRangeFilter>('last30');
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const { data, isLoading } = useAnalyticsData(filter);
  const dashboardRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const handleExportPNG = async () => {
    if (!dashboardRef.current) return;
    const toastId = toast.loading('Generating PNG export...');
    try {
      const dataUrl = await toPng(dashboardRef.current, { pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `analytics-dashboard-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Dashboard exported to PNG', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : 'Export failed', { id: toastId });
    }
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    const toastId = toast.loading('Generating PDF report...');
    try {
      const imgData = await toPng(dashboardRef.current, { pixelRatio: 2 });
      
      const img = new Image();
      img.src = imgData;
      await new Promise((resolve) => { img.onload = resolve; });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (img.height * pdfWidth) / img.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`analytics-report-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Dashboard exported to PDF', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : 'Export failed', { id: toastId });
    }
  };

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName="Analytics Dashboard"
        subtitle="Real-time insights and KPIs for your operations."
        actions={
          <div className="flex items-center gap-2">
            <div className="bg-white/10 backdrop-blur-md p-1 rounded-xl">
              <select 
                value={filter} 
                onChange={(e) => {
                  setFilter(e.target.value as DateRangeFilter);
                  setSelectedDateStr(null);
                }}
                className="bg-transparent border-none text-primary font-medium text-sm focus:ring-0 cursor-pointer"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="thisYear">This Year</option>
              </select>
            </div>
            <Button variant="secondary" onClick={handleExportPNG} className="bg-white text-primary hover:bg-gold/10 hover:text-gold shrink-0">
              <Download size={16} className="mr-2" /> PNG
            </Button>
            <Button variant="primary" onClick={handleExportPDF} className="shrink-0">
              <Download size={16} className="mr-2" /> PDF
            </Button>
          </div>
        }
      />

      <div ref={dashboardRef} className="space-y-8 bg-transparent p-1 rounded-xl">
        {/* Drill-down View */}
        {selectedDateStr && (
          <Card className="p-6 bg-primary/5 border-primary/20 shadow-sm relative ring-1 ring-gold/20">
            <button 
              onClick={() => setSelectedDateStr(null)}
              className="absolute top-4 right-4 text-text-muted hover:text-gold transition-colors"
            >
              <XCircle size={24} />
            </button>
            <h3 className="text-lg font-display font-bold text-primary mb-2">Drill-down: {selectedDateStr}</h3>
            <p className="text-sm text-text-muted mb-6">You clicked on a specific date. Here are the detailed metrics for this day.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <MetricCard title="Daily Revenue" value={`₹${data?.revenue.dailyTrend.find(d => d.date === selectedDateStr)?.amount || 0}`} icon={<TrendingUp size={24} />} color="blue" />
              <MetricCard title="Revenue Pending" value={`₹${data?.revenue.pending || 0}`} icon={<Clock size={24} />} color="amber" />
              {/* Note: This is an MVP drill-down showing the selected date's revenue. Real apps would query specific day records here. */}
            </div>
          </Card>
        )}

        {/* Primary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard 
            title="Today's Revenue" 
            value={`₹${data?.revenue.today.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp size={24} />} 
            color="mint" 
          />
          <MetricCard 
            title="Total Revenue (Period)" 
            value={`₹${data?.revenue.total.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp size={24} />} 
            color="blue" 
          />
          <MetricCard 
            title="Monthly Revenue" 
            value={`₹${data?.revenue.monthly.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp size={24} />} 
            color="lavender"
          />
          <MetricCard 
            title="Avg Order Value" 
            value={`₹${Math.round(data?.revenue.averageOrderValue || 0).toLocaleString('en-IN')}`} 
            icon={<CreditCard size={24} />} 
            color="rose"
          />
          <MetricCard 
            title="Active Customers" 
            value={data?.customers.active.toLocaleString() || '0'} 
            icon={<Users size={24} />} 
            color="amber" 
          />
          <MetricCard 
            title="Active Subscriptions" 
            value={data?.subscriptions.active.toLocaleString() || '0'} 
            icon={<CreditCard size={24} />} 
            color="lavender"
          />
          <MetricCard 
            title="Today's Orders" 
            value={data?.orders.todayTotal.toLocaleString() || '0'} 
            icon={<Package size={24} />} 
            color="blue" 
          />
          <MetricCard 
            title="Pending Deliveries" 
            value={data?.orders.pending.toLocaleString() || '0'} 
            icon={<Truck size={24} />} 
            color="rose" 
          />
        </div>

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card hoverLift className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-display font-bold text-primary">Revenue Trend</h2>
              <p className="text-sm text-text-muted">Click a data point to drill down to that specific date.</p>
            </div>
            <RevenueTrendChart 
              data={data?.revenue.dailyTrend || []} 
              onClick={(payload) => {
                if (payload && payload.date) {
                  setSelectedDateStr(payload.date);
                }
              }} 
            />
          </Card>

          <Card hoverLift className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-display font-bold text-primary">Orders by Meal Type</h2>
              <p className="text-sm text-text-muted">Distribution of orders across breakfast, lunch, and dinner</p>
            </div>
            <OrderDistributionChart data={data?.orders.byMealType || {}} />
          </Card>

          <Card hoverLift className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-display font-bold text-primary">Subscription Plans</h2>
              <p className="text-sm text-text-muted">Current active and paused subscriptions by tier</p>
            </div>
            <PlanDistributionChart data={data?.subscriptions.planDistribution || {}} />
          </Card>

          <Card hoverLift className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-display font-bold text-primary">Revenue by Payment Method</h2>
              <p className="text-sm text-text-muted">Total verified collections distributed by method</p>
            </div>
            <PaymentMethodChart data={data?.revenue.methodDistribution || {}} />
          </Card>
        </div>

        {/* Operational Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-gradient-to-br from-background to-amber-50/30 border-gold/20">
            <div className="mb-6 flex items-center gap-2">
              <ChefHat className="text-gold" size={24} />
              <h2 className="text-xl font-display font-bold text-primary">Kitchen Analytics</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-background rounded-xl shadow-sm border border-gold/10">
                <p className="text-sm text-text-muted">Prepared Today</p>
                <p className="text-2xl font-bold text-primary font-display">{data?.kitchen.preparedToday || 0}</p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-gold/10">
                <p className="text-sm text-text-muted">Pending Today</p>
                <p className="text-2xl font-bold text-primary font-display">{data?.kitchen.pendingToday || 0}</p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-gold/10">
                <p className="text-sm text-text-muted">Peak Production Hour</p>
                <p className="text-xl font-bold text-primary font-display">{data?.kitchen.peakHour}</p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-gold/10">
                <p className="text-sm text-text-muted">Completed Orders</p>
                <p className="text-2xl font-bold text-primary font-display">{data?.orders.completed || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-background to-blue-50/30 border-blue-200/50">
            <div className="mb-6 flex items-center gap-2">
              <Truck className="text-blue-600" size={24} />
              <h2 className="text-xl font-display font-bold text-primary">Delivery Analytics</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-background rounded-xl shadow-sm border border-blue-100">
                <p className="text-sm text-text-muted flex items-center gap-1"><CheckCircle size={14} className="text-success" /> Success</p>
                <p className="text-2xl font-bold text-primary font-display">{data?.delivery.success || 0}</p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-blue-100">
                <p className="text-sm text-text-muted flex items-center gap-1"><XCircle size={14} className="text-danger" /> Failed</p>
                <p className="text-2xl font-bold text-primary font-display">{data?.delivery.failed || 0}</p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-blue-100">
                <p className="text-sm text-text-muted">Top Zone</p>
                <p className="text-xl font-bold text-primary font-display">
                  {Object.entries(data?.delivery.byArea || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-background rounded-xl shadow-sm border border-blue-100">
                <p className="text-sm text-text-muted">Top Partner</p>
                <p className="text-xl font-bold text-primary font-display truncate" title={data?.delivery.topPartner}>
                  {data?.delivery.topPartner === 'N/A' ? 'N/A' : 'Partner ID: ' + data?.delivery.topPartner.slice(0,6)}
                </p>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
