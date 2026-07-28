import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ChefHat, 
  RefreshCw, 
  BookOpen, 
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Package,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Button } from '@/shared/components/ui/Button';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { useGenerateOrders } from '../hooks/useGenerateOrders';
import { useKitchenDashboard, getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import { inventoryRepository } from '@/shared/services/firestore/inventoryRepository';
import type { MealType } from '@/shared/types';

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function ProgressBar({ label, value, max, colorClass }: { label: string, value: number, max: number, colorClass: string }) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-900">{value} / {max}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-rice-200 overflow-hidden">
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
  
  const { generateOrders, isGenerating } = useGenerateOrders();
  const { dashboard, isLoading, isError, error, refetch } = useKitchenDashboard(today);

  // Fetch low stock items
  const { data: inventory = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['admin', 'inventory-alerts'],
    queryFn: () => inventoryRepository.list(),
  });

  const lowStockItems = useMemo(() => {
    return inventory.filter(item => item.quantity <= item.lowStockThreshold);
  }, [inventory]);

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kitchen Operations" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Kitchen Operations' }]} />
        <ErrorState 
          title="Failed to load kitchen dashboard" 
          description={error instanceof Error ? error.message : 'Unknown error occurred'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Kitchen Operations"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Kitchen Operations' }]}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/menus')} variant="secondary">
              <BookOpen className="mr-2 h-4 w-4" />
              Manage Menus
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-rice-300">
          <Loader2 className="h-8 w-8 animate-spin text-leaf-500" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Top Metrics Column */}
          <div className="space-y-6 md:col-span-1">
            <Card className="p-5 border-rice-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-100 text-leaf-600">
                  <ChefHat size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-ink-900">Today's Orders</h3>
                  <p className="text-sm text-ink-500">Overview across all meals</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-rice-100 pb-3">
                  <span className="text-3xl font-display font-semibold text-ink-900">
                    {dashboard?.totalOrders || 0}
                  </span>
                  <span className="text-sm font-medium text-ink-500 mb-1">Scheduled</span>
                </div>
                <div className="flex justify-between items-end border-b border-rice-100 pb-3">
                  <span className="text-3xl font-display font-semibold text-leaf-600">
                    {dashboard?.completedCount || 0}
                  </span>
                  <span className="text-sm font-medium text-ink-500 mb-1">Completed</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-ink-600">Overall Progress</span>
                    <span className="text-ink-900">{Math.round(dashboard?.progressPercent || 0)}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-rice-200 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-leaf-500 transition-all duration-500"
                      style={{ width: `${dashboard?.progressPercent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5 border-rice-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-chili-50 text-chili-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-ink-900">Inventory Alerts</h3>
                  <p className="text-sm text-ink-500">Low stock warnings</p>
                </div>
              </div>

              {isLoadingInventory ? (
                <div className="py-4 text-center text-sm text-ink-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking inventory...
                </div>
              ) : lowStockItems.length === 0 ? (
                <div className="py-4 text-center rounded bg-leaf-50 border border-leaf-100 text-leaf-700 text-sm flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={16} /> Inventory levels look good
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-chili-50 border border-chili-100">
                      <span className="font-medium text-chili-900">{item.name}</span>
                      <span className="text-chili-700 font-semibold">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                  <Button variant="ghost" className="w-full text-xs" onClick={() => navigate('/kitchen/inventory')}>
                    View All Inventory
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Meal Breakdown Column */}
          <div className="md:col-span-2 space-y-6">
            <Card className="p-6 border-rice-300">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-medium text-lg text-ink-900">Meal Production</h3>
                  <p className="text-sm text-ink-500">Live progress of kitchen tasks</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => navigate('/kitchen/production')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Production Board
                </Button>
              </div>

              <div className="grid gap-6 sm:grid-cols-3">
                {(['breakfast', 'lunch', 'dinner'] as MealType[]).map(meal => {
                  const summary = dashboard?.byMealType[meal] || { total: 0, scheduled: 0, preparing: 0, readyForPickup: 0, pickedUp: 0 };
                  const isDone = summary.total > 0 && (summary.readyForPickup + summary.pickedUp) === summary.total;
                  
                  return (
                    <div key={meal} className="space-y-4 p-4 rounded-xl border border-rice-200 bg-rice-50/50">
                      <div className="flex justify-between items-center border-b border-rice-200 pb-2">
                        <h4 className="font-semibold text-ink-900 capitalize">{meal}</h4>
                        {isDone ? (
                          <CheckCircle2 size={18} className="text-leaf-500" />
                        ) : (
                          <span className="text-xs font-medium text-ink-500">{summary.total} Total</span>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <ProgressBar 
                          label="Scheduled" 
                          value={summary.scheduled} 
                          max={summary.total} 
                          colorClass="bg-ink-300"
                        />
                        <ProgressBar 
                          label="Preparing" 
                          value={summary.preparing} 
                          max={summary.total} 
                          colorClass="bg-sun-400"
                        />
                        <ProgressBar 
                          label="Ready / Delivered" 
                          value={summary.readyForPickup + summary.pickedUp} 
                          max={summary.total} 
                          colorClass="bg-leaf-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            
            {/* Additional Operations Card */}
            <div className="grid sm:grid-cols-2 gap-6">
              <Card className="p-5 border-rice-300 flex items-start gap-4 hover:border-leaf-300 transition-colors cursor-pointer" onClick={() => navigate('/admin/orders')}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                  <Package size={20} />
                </div>
                <div>
                  <h4 className="font-medium text-ink-900 mb-1">Manage Orders</h4>
                  <p className="text-sm text-ink-500 leading-snug">View and override order workflows, reassign delivery zones, and track delays.</p>
                </div>
              </Card>

              <Card className="p-5 border-rice-300 flex items-start gap-4 hover:border-leaf-300 transition-colors cursor-pointer" onClick={() => navigate('/admin/menus')}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="font-medium text-ink-900 mb-1">Menu Analytics</h4>
                  <p className="text-sm text-ink-500 leading-snug">Analyze which meals are most popular and plan tomorrow's menu schedule.</p>
                </div>
              </Card>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
