// import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useQuery } from '@tanstack/react-query';
import {
  ChefHat,
  BookOpen,

  ClipboardList,
  CheckCircle2,
  Package,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { ErrorState } from '@/shared/components/feedback/ErrorState';

import { useKitchenDashboard, getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import type { MealType } from '@/shared/types';

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function ProgressBar({ label, value, max, colorClass }: { label: string, value: number, max: number, colorClass: string }) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold font-sans uppercase tracking-wider">
        <span className="text-text-muted">{label}</span>
        <span className="text-primary">{value} / {max}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-primary/10 overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------------------

export function AdminKitchenPage() {
  const navigate = useNavigate();
  const today = getTodayIST();

  const { dashboard, isLoading, isError, error, refetch } = useKitchenDashboard(today);

  if (isError) {
    return (
      <div className="space-y-8">
        <PageHeader userName="Kitchen Operations" subtitle="Dashboard / Kitchen" />
        <ErrorState
          title="Failed to load kitchen dashboard"
          description={error instanceof Error ? error.message : 'Unknown error occurred'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        userName="Kitchen Operations"
        subtitle="Live production dashboard, inventory alerts, and menus"
        actions={
          <div className="flex gap-4">
            <Button onClick={() => navigate('/admin/menus')} variant="primary">
              <BookOpen className="mr-2 h-4 w-4" />
              Manage Menus
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-primary/5">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">

          {/* Top Metrics Column */}
          <div className="space-y-6 md:col-span-1">
            <Card hoverLift className="p-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 left-0 bg-gold/10 h-1"></div>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/5 text-primary border border-primary/10">
                  <ChefHat size={24} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-primary">Today's Orders</h3>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Across all meals</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex justify-between items-end border-b border-gold/10 pb-3">
                  <span className="text-4xl font-display font-bold text-primary">
                    {dashboard?.totalOrders || 0}
                  </span>
                  <span className="text-sm font-bold text-text-muted mb-1">Scheduled</span>
                </div>
                <div className="flex justify-between items-end border-b border-gold/10 pb-3">
                  <span className="text-4xl font-display font-bold text-emerald-600">
                    {dashboard?.completedCount || 0}
                  </span>
                  <span className="text-sm font-bold text-text-muted mb-1">Completed</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                    <span className="text-text-muted">Overall Progress</span>
                    <span className="text-primary">{dashboard?.totalOrders ? Math.round(((dashboard.completedCount || 0) / dashboard.totalOrders) * 100) : 0}%</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-primary/10 overflow-hidden shadow-inner">
                    <div
                      className="h-full rounded-full bg-gold transition-all duration-500"
                      style={{ width: `${dashboard?.totalOrders ? Math.round(((dashboard.completedCount || 0) / dashboard.totalOrders) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

          </div>

          {/* Meal Breakdown Column */}
          <div className="md:col-span-2 space-y-6">
            <Card hoverLift className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-display font-bold text-2xl text-primary">Meal Production</h3>
                  <p className="text-sm font-sans text-text-muted mt-1">Live progress of kitchen tasks</p>
                </div>
                <Button variant="primary" onClick={() => navigate('/kitchen/production')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Production Board
                </Button>
              </div>

              <div className="grid gap-6 sm:grid-cols-3">
                {(['breakfast', 'lunch', 'dinner'] as MealType[]).map(meal => {
                  const summary = dashboard?.byMealType[meal] || { total: 0, scheduled: 0, packing: 0, readyForPickup: 0, pickedUp: 0 };
                  const isDone = summary.total > 0 && (summary.readyForPickup + summary.pickedUp) === summary.total;

                  return (
                    <div key={meal} className="space-y-5 p-5 rounded-2xl border border-gold/20 bg-gradient-to-b from-background to-primary/5 transition-all hover:border-gold/40">
                      <div className="flex justify-between items-center border-b border-gold/10 pb-3">
                        <h4 className="font-display font-bold text-lg text-primary capitalize">{meal}</h4>
                        {isDone ? (
                          <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-full shadow-sm">
                            <CheckCircle2 size={16} />
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-text-muted bg-white px-2 py-1 rounded-md shadow-sm border border-gold/10">{summary.total} Total</span>
                        )}
                      </div>

                      <div className="space-y-4">
                        <ProgressBar
                          label="Scheduled"
                          value={summary.scheduled}
                          max={summary.total}
                          colorClass="bg-primary/40"
                        />
                        <ProgressBar
                          label="Packing"
                          value={summary.packing}
                          max={summary.total}
                          colorClass="bg-gold"
                        />
                        <ProgressBar
                          label="Ready / Delivered"
                          value={summary.readyForPickup + summary.pickedUp}
                          max={summary.total}
                          colorClass="bg-emerald-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Additional Operations Card */}
            <div className="grid sm:grid-cols-2 gap-6">
              <Card hoverLift className="p-6 flex items-start gap-5 cursor-pointer group" onClick={() => navigate('/admin/orders')}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary border border-primary/10 transition-colors group-hover:bg-gold/10 group-hover:text-gold group-hover:border-gold/30">
                  <Package size={28} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-lg text-primary mb-1.5 group-hover:text-gold transition-colors">Manage Orders</h4>
                  <p className="text-sm text-text-muted font-sans leading-relaxed">View and override order workflows, reassign delivery zones, and track delays.</p>
                </div>
              </Card>

              <Card hoverLift className="p-6 flex items-start gap-5 cursor-pointer group" onClick={() => navigate('/admin/menus')}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary border border-primary/10 transition-colors group-hover:bg-gold/10 group-hover:text-gold group-hover:border-gold/30">
                  <TrendingUp size={28} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-lg text-primary mb-1.5 group-hover:text-gold transition-colors">Menu Analytics</h4>
                  <p className="text-sm text-text-muted font-sans leading-relaxed">Analyze which meals are most popular and plan tomorrow's menu schedule.</p>
                </div>
              </Card>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
