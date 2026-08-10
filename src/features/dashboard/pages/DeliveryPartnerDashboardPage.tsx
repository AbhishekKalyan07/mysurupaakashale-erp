import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePartnerDashboardStats } from '@/features/delivery/hooks/usePartnerDashboardStats';
import { getTodayInTimezone } from '@/shared/lib/date';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { Truck, PackageCheck, AlertCircle, PackageX, Package, XCircle, BarChart3 } from 'lucide-react';

export function DeliveryPartnerDashboardPage() {
  const { firebaseUser } = useAuth();
  const today = getTodayInTimezone();

  const { today: todayStats, month: monthStats, loading, error } = usePartnerDashboardStats(firebaseUser?.uid, today);

  if (loading) {
    return <div className="p-8"><DashboardCardsSkeleton /></div>;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <AlertCircle className="mx-auto text-danger mb-4" size={48} />
        <h2 className="text-xl font-bold font-display text-text">Failed to load statistics</h2>
        <p className="text-text-muted mt-2">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-3">
          <BarChart3 className="text-leaf-600" size={32} />
          Delivery Performance
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-2">
          Your delivery statistics and performance overview.
        </p>
      </div>

      <div className="space-y-6">
        <h2 className="font-display font-bold text-xl text-ink-900 border-b border-rice-300 pb-2">
          Today's Statistics ({today})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-2 border-primary/20 bg-primary/5">
            <Package className="text-primary" size={24} />
            <p className="text-xs text-text-muted font-bold uppercase tracking-wider">Assigned</p>
            <p className="text-3xl font-bold text-primary font-data">{todayStats.assigned}</p>
          </Card>
          
          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-2 border-success/20 bg-success-subtle">
            <PackageCheck className="text-success-dark" size={24} />
            <p className="text-xs text-success-dark font-bold uppercase tracking-wider">Delivered</p>
            <p className="text-3xl font-bold text-success-dark font-data">{todayStats.delivered}</p>
          </Card>

          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-2 border-warning/20 bg-warning-subtle">
            <Truck className="text-warning-dark" size={24} />
            <p className="text-xs text-warning-dark font-bold uppercase tracking-wider">Remaining</p>
            <p className="text-3xl font-bold text-warning-dark font-data">{todayStats.remaining}</p>
          </Card>

          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-2 border-danger/20 bg-danger-subtle">
            <PackageX className="text-danger-dark" size={24} />
            <p className="text-xs text-danger-dark font-bold uppercase tracking-wider">Failed</p>
            <p className="text-3xl font-bold text-danger-dark font-data">{todayStats.failed}</p>
          </Card>

          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-2 border-border bg-surface-2">
            <XCircle className="text-text-muted" size={24} />
            <p className="text-xs text-text-muted font-bold uppercase tracking-wider">Cancelled</p>
            <p className="text-3xl font-bold text-text-muted font-data">{todayStats.cancelled}</p>
          </Card>
        </div>
      </div>

      <div className="space-y-6 pt-6">
        <h2 className="font-display font-bold text-xl text-ink-900 border-b border-rice-300 pb-2">
          Monthly Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-6 flex flex-col sm:flex-row items-center sm:justify-between gap-4 border-gold/30 bg-gradient-to-br from-gold/5 to-gold/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
                <PackageCheck className="text-gold-dark" size={24} />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-sm font-bold text-ink-700 uppercase tracking-wider">Total Delivered</p>
                <p className="text-xs text-ink-500 font-medium">This Calendar Month</p>
              </div>
            </div>
            <p className="text-4xl font-bold text-gold-dark font-data">
              {monthStats.delivered}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
