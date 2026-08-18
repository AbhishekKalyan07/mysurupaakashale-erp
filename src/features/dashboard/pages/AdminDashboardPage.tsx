import { Users, Activity, Settings, ShieldAlert, CreditCard, Package, PackageOpen, IndianRupee, ChefHat, Truck, AlertTriangle, XCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PremiumCard } from '@/shared/components/ui/PremiumCard';
import { PremiumButton } from '@/shared/components/ui/PremiumButton';
import { MetricCard } from '@/shared/components/ui/MetricCard';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboardMetrics } from '../hooks/useAdminDashboardMetrics';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: metrics, isLoading } = useAdminDashboardMetrics();

  const firstName = profile?.fullName?.split(' ')[0] || 'Admin';

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName={firstName}
        subtitle="Run the whole kitchen: plans, staff, zones, and reporting."
        actions={
          <PremiumButton variant="secondary" onClick={() => navigate('/admin/settings')}>
            <Settings size={18} />
            Global Settings
          </PremiumButton>
        }
      />

      <div>
        <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
          <Activity className="text-gold" size={24} /> 
          Real-time Business Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <MetricCard
            title="System Status"
            value={metrics?.systemStatus === 'healthy' ? 'Healthy' : 'Degraded'}
            icon={<ShieldAlert size={24} />}
            color={metrics?.systemStatus === 'healthy' ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Total Customers"
            value={metrics?.totalCustomers ?? 0}
            icon={<Users size={24} />}
            color="blue"
          />
          <MetricCard
            title="Active Drivers"
            value={metrics?.activeDrivers ?? 0}
            icon={<Truck size={24} />}
            color="lavender"
          />
          <MetricCard
            title="Active Subs"
            value={metrics?.activeSubscriptions ?? 0}
            icon={<CreditCard size={24} />}
            color="mint"
          />
          <MetricCard
            title="Revenue Today"
            value={`₹${metrics?.revenueToday?.toLocaleString() ?? 0}`}
            icon={<IndianRupee size={24} />}
            color="gold"
          />
          <MetricCard
            title="Total Orders"
            value={metrics?.todayOrders.total ?? 0}
            icon={<Package size={24} />}
            color="amber"
          />
          <MetricCard
            title="Scheduled"
            value={metrics?.todayOrders.scheduled ?? 0}
            icon={<AlertTriangle size={24} />}
            color="rose"
          />
          <MetricCard
            title="Kitchen SLA"
            value={`${metrics?.kitchenSLA ?? 100}%`}
            icon={<ChefHat size={24} />}
            color={(metrics?.kitchenSLA ?? 100) >= 95 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Delivery SLA"
            value={`${metrics?.deliverySLA ?? 100}%`}
            icon={<PackageOpen size={24} />}
            color={(metrics?.deliverySLA ?? 100) >= 95 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Failed Deliveries"
            value={metrics?.todayOrders.failedDeliveries ?? 0}
            icon={<XCircle size={24} />}
            color={(metrics?.todayOrders.failedDeliveries ?? 0) === 0 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Cancelled Orders"
            value={metrics?.todayOrders.cancelled ?? 0}
            icon={<XCircle size={24} />}
            color="rose"
          />
          <MetricCard
            title="Failed Payments"
            value={metrics?.failedPayments ?? 0}
            icon={<XCircle size={24} />}
            color={(metrics?.failedPayments ?? 0) === 0 ? 'mint' : 'rose'}
          />
          <MetricCard
            title="Open Complaints"
            value={metrics?.openComplaints ?? 0}
            icon={<ShieldAlert size={24} className={metrics?.openComplaints ? "text-warning" : ""} />}
            color={(metrics?.openComplaints ?? 0) === 0 ? 'mint' : 'amber'}
            onClick={() => navigate('/admin/complaints')}
          />
        </div>
      </div>

      {metrics?.kitchenSLAStats && (
        <div className="mb-12">
          <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
            <Activity className="text-gold" size={24} /> 
            Kitchen SLA Metrics
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
            <MetricCard
              title="Avg Prep Time"
              value={`${metrics.kitchenSLAStats.avgPrepTimeMins}m`}
              icon={<Activity size={24} />}
              color="blue"
            />
            <MetricCard
              title="Avg Pack Time"
              value={`${metrics.kitchenSLAStats.avgPackTimeMins}m`}
              icon={<Activity size={24} />}
              color="mint"
            />
            <MetricCard
              title="Kitchen SLA"
              value={`${metrics.kitchenSLA}%`}
              icon={<Activity size={24} className={metrics.kitchenSLA < 95 ? "text-danger" : ""} />}
              color={metrics.kitchenSLA >= 95 ? "mint" : "rose"}
            />
            <MetricCard
              title="Delivery SLA"
              value={`${metrics.deliverySLA}%`}
              icon={<Activity size={24} className={metrics.deliverySLA < 95 ? "text-danger" : ""} />}
              color={metrics.deliverySLA >= 95 ? "mint" : "rose"}
            />
          </div>
          
          <h2 className="text-xl font-display font-bold text-primary mt-12 mb-6 flex items-center gap-2">
            <Truck className="text-gold" size={24} /> 
            Driver Utilization
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Utilization"
              value={`${metrics.driverStats.utilizationPercent}%`}
              icon={<Activity size={24} />}
              color={metrics.driverStats.utilizationPercent >= 80 ? "mint" : "blue"}
            />
            <MetricCard
              title="Avg Orders / Driver"
              value={metrics.driverStats.avgOrdersPerDriver}
              icon={<Package size={24} />}
              color="amber"
            />
            <MetricCard
              title="Busy Drivers"
              value={metrics.driverStats.busy}
              icon={<Truck size={24} />}
              color="rose"
            />
            <MetricCard
              title="Available Drivers"
              value={metrics.driverStats.available}
              icon={<Truck size={24} />}
              color="mint"
            />
            <MetricCard
              title="Avg Delivery Time"
              value={`${metrics.todayOrders.avgDeliveryTimeMins}m`}
              icon={<Activity size={24} />}
              color="blue"
            />
          </div>

          <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
            <ChefHat className="text-gold" size={24} /> 
            Kitchen Stages
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
             <div className="bg-white border-2 border-dashed border-primary/20 rounded-2xl p-4 text-center">
               <p className="text-sm font-bold text-text-muted">Preparing</p>
               <p className="text-3xl font-display font-bold text-primary">{metrics.kitchenSLAStats.preparingCount}</p>
             </div>
             <div className="bg-white border-2 border-dashed border-primary/20 rounded-2xl p-4 text-center">
               <p className="text-sm font-bold text-text-muted">Packing</p>
               <p className="text-3xl font-display font-bold text-primary">{metrics.kitchenSLAStats.packingCount}</p>
             </div>
             <div className="bg-white border-2 border-dashed border-primary/20 rounded-2xl p-4 text-center">
               <p className="text-sm font-bold text-text-muted">Packed</p>
               <p className="text-3xl font-display font-bold text-primary">{metrics.kitchenSLAStats.packedCount}</p>
             </div>
             <div className="bg-white border-2 border-solid border-success/30 bg-success/5 rounded-2xl p-4 text-center">
               <p className="text-sm font-bold text-success">Ready</p>
               <p className="text-3xl font-display font-bold text-success">{metrics.kitchenSLAStats.readyCount}</p>
             </div>
          </div>
        </div>
      )}

      {metrics && metrics.generationRuns && metrics.generationRuns.length > 0 && (
        <div>
          <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
            <Activity className="text-gold" size={24} /> 
            Today's Generation Runs
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {metrics.generationRuns.map(run => (
              <PremiumCard key={run.id} className="p-6 border-primary/20">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-primary capitalize font-display text-lg">{run.mealType} Generation</h3>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    run.status === 'success' ? 'bg-success/10 text-success border border-success/30' :
                    run.status === 'failed' ? 'bg-danger/10 text-danger border border-danger/30' :
                    'bg-warning/10 text-warning border border-warning/30'
                  }`}>
                    {run.status}
                  </div>
                </div>
                
                <div className="space-y-2 text-sm font-sans mb-4">
                  <div className="flex justify-between border-b border-primary/5 pb-2">
                    <span className="text-text-muted font-medium">Generated:</span>
                    <span className="font-bold text-primary">{run.ordersGenerated || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-primary/5 pb-2">
                    <span className="text-text-muted font-medium">Skipped:</span>
                    <span className="font-bold text-primary">{run.ordersSkipped || 0}</span>
                  </div>
                  <div className="flex justify-between border-b border-primary/5 pb-2">
                    <span className="text-text-muted font-medium">Cancelled:</span>
                    <span className="font-bold text-primary">{run.ordersCancelled || 0}</span>
                  </div>
                  <div className="flex justify-between pb-2">
                    <span className="text-text-muted font-medium">Failed:</span>
                    <span className={`font-bold ${run.ordersFailed && run.ordersFailed > 0 ? 'text-danger' : 'text-primary'}`}>
                      {run.ordersFailed || 0}
                    </span>
                  </div>
                </div>
                
                <div className="text-xs text-text-muted bg-background p-3 rounded-xl border border-primary/10">
                  <p>Started: {run.startedAt ? (typeof run.startedAt === 'string' ? new Date(run.startedAt).toLocaleTimeString() : (run.startedAt as any).toDate().toLocaleTimeString()) : 'N/A'}</p>
                  {run.completedAt && <p>Completed: {typeof run.completedAt === 'string' ? new Date(run.completedAt).toLocaleTimeString() : (run.completedAt as any).toDate().toLocaleTimeString()}</p>}
                </div>
                
                {run.error && (
                  <div className="mt-3 text-xs bg-danger/10 text-danger p-3 rounded-xl border border-danger/20 font-bold overflow-hidden text-ellipsis whitespace-nowrap" title={run.error}>
                    Error: {run.error}
                  </div>
                )}
              </PremiumCard>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-display font-bold text-primary mb-6 flex items-center gap-2">
          <Settings className="text-text-muted" size={24} /> 
          Quick Actions &amp; Configuration
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <PremiumCard hoverLift className="p-6 cursor-pointer" onClick={() => navigate('/admin/staff')}>
            <div className="p-3 bg-pastel-blue text-primary rounded-xl w-fit mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Staff Management</h3>
            <p className="text-sm text-text-muted mt-2">Provision and manage Kitchen, Delivery, and Accounts staff roles.</p>
          </PremiumCard>

          <PremiumCard hoverLift className="p-6 cursor-pointer" onClick={() => navigate('/admin/settings')}>
            <div className="p-3 bg-pastel-mint text-primary rounded-xl w-fit mb-4">
              <Settings size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Global Settings</h3>
            <p className="text-sm text-text-muted mt-2">Configure delivery radius, operational holidays, and global parameters.</p>
          </PremiumCard>

          <PremiumCard hoverLift className="p-6 cursor-pointer" onClick={() => navigate('/admin/audit')}>
            <div className="p-3 bg-pastel-amber text-primary rounded-xl w-fit mb-4">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-bold text-primary">Audit Logs</h3>
            <p className="text-sm text-text-muted mt-2">Review operational actions, payments, and workflow transitions.</p>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}
