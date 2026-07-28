import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Filter, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';

import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { orderRepository } from '@/shared/services/firestore/orderRepository';
import { userRepository } from '@/shared/services/firestore/userRepository';
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

  if (isLoading) return <span className="animate-pulse text-text-muted">Loading...</span>;
  if (!customer) return <span className="text-text-muted">Unknown</span>;
  return <span className="font-bold font-sans text-primary">{customer.fullName}</span>;
}

const statusColors: Record<OrderStatus, string> = {
  scheduled: 'bg-primary/10 text-primary border-primary/20',
  preparing: 'bg-gold/20 text-gold-dark border-gold/30',
  ready_for_pickup: 'bg-blue-100 text-blue-800 border-blue-200',
  out_for_delivery: 'bg-amber-100 text-amber-800 border-amber-200',
  delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  skipped: 'bg-background-alt text-text-muted border-primary/10',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  failed_delivery: 'bg-red-600 text-white border-red-700',
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
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider border ${statusColors[status]}`}>
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
    <div className="space-y-8">
      <PageHeader 
        userName="Orders Management"
        subtitle="Dashboard / Orders"
      />

      {/* Filters Toolbar */}
      <Card className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon size={14} /> Date
            </label>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="w-full sm:w-auto bg-background"
            />
          </div>
          
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Filter size={14} /> Status
            </label>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
              className="w-full rounded-xl border border-primary/20 bg-background px-4 py-2.5 text-sm font-sans shadow-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold text-primary font-medium transition-colors hover:border-gold/50"
            >
              <option value="all">All Statuses</option>
              {Object.keys(statusLabels).map(key => (
                <option key={key} value={key}>{statusLabels[key as OrderStatus]}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Package size={14} /> Meal Type
            </label>
            <select 
              value={mealTypeFilter}
              onChange={(e) => setMealTypeFilter(e.target.value as MealType | 'all')}
              className="w-full rounded-xl border border-primary/20 bg-background px-4 py-2.5 text-sm font-sans shadow-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold text-primary font-medium transition-colors hover:border-gold/50"
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
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-primary/5">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gold/30 bg-primary/5 py-16 text-center">
          <Package className="mb-4 h-12 w-12 text-primary/40" />
          <h3 className="text-lg font-display font-bold text-primary">No Orders Found</h3>
          <p className="mt-1 text-sm font-sans text-text-muted">
            No orders match the selected date and filters.
          </p>
        </div>
      ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto md:overflow-visible">
              <table className="w-full text-left text-sm block md:table font-sans">
                <thead className="hidden md:table-header-group bg-primary/5 text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-primary/10">
                  <tr>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Meal & Tier</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group divide-y divide-primary/5 bg-background">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="block md:table-row hover:bg-primary/5 p-4 md:p-0 space-y-3 md:space-y-0 transition-colors">
                      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Order ID</span>
                        <div className="font-mono text-xs text-text-muted font-medium bg-background-alt px-2 py-1 rounded border border-primary/10" title={order.id}>
                          {order.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Customer</span>
                        <div className="text-right md:text-left">
                          <CustomerName customerId={order.customerId} />
                        </div>
                      </td>
                      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Meal & Tier</span>
                        <div className="text-right md:text-left">
                          <div className="font-bold capitalize text-primary">{order.mealType}</div>
                          <div className="text-xs font-medium text-text-muted">{order.planTier || 'One-time'}</div>
                        </div>
                      </td>
                      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 font-bold text-primary">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Amount</span>
                        ₹{order.price}
                      </td>
                      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Status</span>
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="flex justify-between items-center md:table-cell px-0 pt-3 md:pt-0 md:px-6 md:py-4 text-right border-t border-primary/10 md:border-0 mt-3 md:mt-0">
                        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Actions</span>
                        <select
                          value={order.status}
                          onChange={(e) => updateStatusMutation.mutate({ orderId: order.id, newStatus: e.target.value as OrderStatus })}
                          disabled={updateStatusMutation.isPending}
                          className="text-xs rounded-lg border border-primary/20 bg-background py-1.5 pl-3 pr-8 shadow-sm focus:border-gold focus:ring-1 focus:ring-gold text-primary font-bold w-full md:w-auto cursor-pointer hover:border-gold/50 transition-colors"
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
      )}
    </div>
  );
}
