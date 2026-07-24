import { useState, useRef } from 'react';
import { Card } from '@/shared/components/ui/Card';
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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Business Analytics</h1>
          <p className="text-ink-500 mt-1">Real-time insights and KPIs for your operations.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={filter} 
            onChange={(e) => {
              setFilter(e.target.value as DateRangeFilter);
              setSelectedDateStr(null);
            }}
            className="px-4 py-2 border border-ink-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-leaf-500 text-sm font-medium"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisYear">This Year</option>
          </select>
          <button 
            onClick={handleExportPNG}
            className="flex items-center gap-2 px-4 py-2 bg-ink-100 text-ink-900 rounded-lg shadow-sm hover:bg-ink-200 transition-colors text-sm font-medium"
          >
            <Download size={16} />
            PNG
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-leaf-600 text-white rounded-lg shadow-sm hover:bg-leaf-700 transition-colors text-sm font-medium"
          >
            <Download size={16} />
            PDF
          </button>
        </div>
      </div>

      <div ref={dashboardRef} className="space-y-6 bg-rice-50 p-2 -mx-2 rounded-xl">
        {/* Drill-down View */}
        {selectedDateStr && (
          <Card className="p-6 bg-leaf-50 border-leaf-200 shadow-sm relative">
            <button 
              onClick={() => setSelectedDateStr(null)}
              className="absolute top-4 right-4 text-ink-400 hover:text-ink-700"
            >
              <XCircle size={24} />
            </button>
            <h3 className="text-lg font-bold text-ink-900 mb-2">Drill-down: {selectedDateStr}</h3>
            <p className="text-sm text-ink-600 mb-4">You clicked on a specific date. Here are the detailed metrics for this day.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard title="Daily Revenue" value={`₹${data?.revenue.dailyTrend.find(d => d.date === selectedDateStr)?.amount || 0}`} icon={<TrendingUp className="text-leaf-600" size={20} />} />
              <KPICard title="Revenue Pending" value={`₹${data?.revenue.pending || 0}`} icon={<Clock className="text-amber-600" size={20} />} />
              {/* Note: This is an MVP drill-down showing the selected date's revenue. Real apps would query specific day records here. */}
            </div>
          </Card>
        )}

        {/* Primary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <KPICard 
            title="Today's Revenue" 
            value={`₹${data?.revenue.today.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp className="text-leaf-600" size={20} />} 
            colorClass="border-l-4 border-leaf-500" 
          />
          <KPICard 
            title="Total Revenue (Period)" 
            value={`₹${data?.revenue.total.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp className="text-leaf-600" size={20} />} 
            colorClass="border-l-4 border-leaf-400" 
          />
          <KPICard 
            title="Monthly Revenue" 
            value={`₹${data?.revenue.monthly.toLocaleString('en-IN') || 0}`} 
            icon={<TrendingUp className="text-emerald-600" size={20} />} 
          />
          <KPICard 
            title="Avg Order Value" 
            value={`₹${Math.round(data?.revenue.averageOrderValue || 0).toLocaleString('en-IN')}`} 
            icon={<CreditCard className="text-purple-600" size={20} />} 
          />
          <KPICard 
            title="Active Customers" 
            value={data?.customers.active.toLocaleString() || '0'} 
            icon={<Users className="text-blue-600" size={20} />} 
            colorClass="border-l-4 border-blue-500" 
          />
          <KPICard 
            title="Active Subscriptions" 
            value={data?.subscriptions.active.toLocaleString() || '0'} 
            icon={<CreditCard className="text-purple-600" size={20} />} 
          />
          <KPICard 
            title="Today's Orders" 
            value={data?.orders.todayTotal.toLocaleString() || '0'} 
            icon={<Package className="text-amber-600" size={20} />} 
          />
          <KPICard 
            title="Pending Deliveries" 
            value={data?.orders.pending.toLocaleString() || '0'} 
            icon={<Truck className="text-orange-500" size={20} />} 
          />
        </div>

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-ink-900">Revenue Trend</h2>
              <p className="text-sm text-ink-500">Click a data point to drill down to that specific date.</p>
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

          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-ink-900">Orders by Meal Type</h2>
              <p className="text-sm text-ink-500">Distribution of orders across breakfast, lunch, and dinner</p>
            </div>
            <OrderDistributionChart data={data?.orders.byMealType || {}} />
          </Card>

          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-ink-900">Subscription Plans</h2>
              <p className="text-sm text-ink-500">Current active and paused subscriptions by tier</p>
            </div>
            <PlanDistributionChart data={data?.subscriptions.planDistribution || {}} />
          </Card>

          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-ink-900">Revenue by Payment Method</h2>
              <p className="text-sm text-ink-500">Total verified collections distributed by method</p>
            </div>
            <PaymentMethodChart data={data?.revenue.methodDistribution || {}} />
          </Card>
        </div>

        {/* Operational Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-amber-50/50">
            <div className="mb-6 flex items-center gap-2">
              <ChefHat className="text-amber-600" />
              <h2 className="text-lg font-bold text-ink-900">Kitchen Analytics</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Prepared Today</p>
                <p className="text-2xl font-bold text-ink-900">{data?.kitchen.preparedToday || 0}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Pending Today</p>
                <p className="text-2xl font-bold text-ink-900">{data?.kitchen.pendingToday || 0}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Peak Production Hour</p>
                <p className="text-xl font-bold text-ink-900">{data?.kitchen.peakHour}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Completed Orders</p>
                <p className="text-2xl font-bold text-ink-900">{data?.orders.completed || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-blue-50/50">
            <div className="mb-6 flex items-center gap-2">
              <Truck className="text-blue-600" />
              <h2 className="text-lg font-bold text-ink-900">Delivery Analytics</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500 flex items-center gap-1"><CheckCircle size={14} className="text-success" /> Success</p>
                <p className="text-2xl font-bold text-ink-900">{data?.delivery.success || 0}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500 flex items-center gap-1"><XCircle size={14} className="text-danger" /> Failed</p>
                <p className="text-2xl font-bold text-ink-900">{data?.delivery.failed || 0}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Top Zone</p>
                <p className="text-xl font-bold text-ink-900">
                  {Object.entries(data?.delivery.byArea || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'N/A'}
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-black/5">
                <p className="text-sm text-ink-500">Top Partner</p>
                <p className="text-xl font-bold text-ink-900 truncate" title={data?.delivery.topPartner}>
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

function KPICard({ title, value, icon, colorClass }: { title: string; value: string | number; icon: React.ReactNode; colorClass?: string }) {
  return (
    <Card className={`p-4 ${colorClass}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold text-ink-900 mt-1">{value}</h3>
        </div>
        <div className="p-1.5 bg-ink-50 rounded-lg shrink-0">
          {icon}
        </div>
      </div>
    </Card>
  );
}
