import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Filter, Calendar as CalendarIcon, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { useGenerateOrders } from '@/features/admin/hooks/useGenerateOrders';
import { getTodayIST } from '@/features/kitchen/hooks/useKitchenDashboard';
import type { OrderStatus, MealType } from '@/shared/types';
import toast from 'react-hot-toast';

// ----------------------------------------------------------------------------
// Helper Components
// ----------------------------------------------------------------------------

function CustomerName({ customerId }: { customerId: string }) {
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => userRepository.getById(customerId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <span className="animate-pulse text-rice-400">Loading...</span>;
  if (!customer) return <span className="text-ink-400">Unknown</span>;
  return <span className="font-medium text-ink-900">{customer.fullName}</span>;
}

const statusColors: Record<OrderStatus, string> = {
  scheduled: 'bg-leaf-100 text-leaf-800 border-leaf-200',
  preparing: 'bg-sun-100 text-sun-800 border-sun-200',
  ready_for_pickup: 'bg-sky-100 text-sky-800 border-sky-200',
  out_for_delivery: 'bg-chili-100 text-chili-800 border-chili-200',
  delivered: 'bg-rice-100 text-rice-800 border-rice-300',
  skipped: 'bg-ink-100 text-ink-600 border-ink-200',
  cancelled: 'bg-chili-50 text-chili-600 border-chili-200',
  failed_delivery: 'bg-chili-600 text-white border-chili-700',
};

const statusLabels: Record<OrderStatus, string> = {
  scheduled: 'Scheduled',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  failed_delivery: 'Failed',
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statusColors[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------------------

export function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const today = getTodayIST();
  
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType | 'all'>('all');

  const { generateOrders, isGenerating } = useGenerateOrders();

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'orders', selectedDate],
    queryFn: () => orderRepository.getByDate(selectedDate),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string, newStatus: OrderStatus }) => {
      await orderRepository.updateWorkflow(orderId, newStatus, 'Admin override');
    },
    onSuccess: () => {
      toast.success('Status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', selectedDate] });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update status');
    }
  });

  if (error) {
    return <ErrorState title="Failed to load orders" onRetry={() => queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })} />;
  }

  const filteredOrders = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (mealTypeFilter !== 'all' && o.mealType !== mealTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Orders Management"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Orders' }]}
        actions={
          <Button 
            onClick={generateOrders} 
            disabled={isGenerating || selectedDate !== today}
            title={selectedDate !== today ? "Can only generate orders for today" : "Run the daily order generation script"}
          >
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generate Orders (Today)
          </Button>
        }
      />

      {/* Filters Toolbar */}
      <Card className="p-4 border-rice-300">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-ink-600 flex items-center gap-1">
              <CalendarIcon size={14} /> Date
            </label>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="w-full sm:w-auto"
            />
          </div>
          
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-ink-600 flex items-center gap-1">
              <Filter size={14} /> Status
            </label>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
              className="w-full rounded-lg border-rice-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
            >
              <option value="all">All Statuses</option>
              {Object.keys(statusLabels).map(key => (
                <option key={key} value={key}>{statusLabels[key as OrderStatus]}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-ink-600 flex items-center gap-1">
              <Package size={14} /> Meal Type
            </label>
            <select 
              value={mealTypeFilter}
              onChange={(e) => setMealTypeFilter(e.target.value as MealType | 'all')}
              className="w-full rounded-lg border-rice-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
            >
              <option value="all">All Meals</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-rice-300">
          <Loader2 className="h-8 w-8 animate-spin text-leaf-500" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rice-300 py-16 text-center">
          <Package className="mb-4 h-12 w-12 text-rice-400" />
          <h3 className="text-lg font-medium text-ink-900">No Orders Found</h3>
          <p className="mt-1 text-sm text-ink-500">
            No orders match the selected date and filters.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="grid gap-4 md:hidden">
            {filteredOrders.map(order => (
              <Card key={order.id} className="overflow-hidden border-rice-200">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-mono text-xs text-ink-500 mb-1">#{order.id.slice(0, 8)}</div>
                      <CustomerName customerId={order.customerId} />
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="block text-xs text-ink-500">Meal</span>
                      <span className="font-medium capitalize text-ink-900">{order.mealType}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-ink-500">Plan Tier</span>
                      <span className="font-medium capitalize text-ink-900">{order.planTier || 'One-time'}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-ink-500">Amount</span>
                      <span className="font-medium text-ink-900">₹{order.price}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-ink-500">Assigned</span>
                      <span className="font-medium text-ink-900">
                        {order.deliveryPartnerId ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-rice-100 flex items-center justify-between">
                    <span className="text-xs text-ink-500 font-medium">Override Status:</span>
                    <select
                      value={order.status}
                      onChange={(e) => updateStatusMutation.mutate({ orderId: order.id, newStatus: e.target.value as OrderStatus })}
                      disabled={updateStatusMutation.isPending}
                      className="text-xs rounded border-rice-300 py-1 pl-2 pr-6 shadow-sm focus:border-leaf-500 focus:ring-1 focus:ring-leaf-500"
                    >
                      {Object.keys(statusLabels).map(key => (
                        <option key={key} value={key}>{statusLabels[key as OrderStatus]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table Layout */}
          <Card className="hidden overflow-hidden border-rice-300 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-ink-700">
                <thead className="bg-rice-50/50 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-4 py-3">Order ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Meal & Tier</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rice-200 bg-white">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-rice-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-ink-500" title={order.id}>
                          {order.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <CustomerName customerId={order.customerId} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium capitalize text-ink-900">{order.mealType}</div>
                        <div className="text-xs text-ink-500">{order.planTier || 'One-time'}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        ₹{order.price}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={order.status}
                          onChange={(e) => updateStatusMutation.mutate({ orderId: order.id, newStatus: e.target.value as OrderStatus })}
                          disabled={updateStatusMutation.isPending}
                          className="text-xs rounded-md border-rice-300 py-1 pl-2 pr-6 shadow-sm focus:border-leaf-500 focus:ring-1 focus:ring-leaf-500"
                        >
                          {Object.keys(statusLabels).map(key => (
                            <option key={key} value={key}>{statusLabels[key as OrderStatus]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
