import { useMemo } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCustomerOrderHistoryPaginated } from '../hooks/useMySubscription';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { StatusChip } from '@/shared/components/ui/StatusChip';
import { MealBadge } from '@/shared/components/ui/MealBadge';
import { PackageOpen, Clock, Calendar, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '@/shared/types';
import { format } from 'date-fns';

export function CustomerOrderHistoryPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useCustomerOrderHistoryPaginated(firebaseUser?.uid);

  const orders = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.orders);
  }, [data]);

  // Group orders by date (orders are already sorted descending by date from the hook)
  const groupedOrders = useMemo(() => {
    if (!orders) return {};
    const groups: Record<string, Order[]> = {};
    for (const order of orders) {
      if (!groups[order.date]) {
        groups[order.date] = [];
      }
      groups[order.date].push(order);
    }
    // Sort meals within the date (breakfast -> lunch -> dinner)
    const mealSortOrder: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };
    for (const date in groups) {
      groups[date].sort((a, b) => (mealSortOrder[a.mealType] || 99) - (mealSortOrder[b.mealType] || 99));
    }
    return groups;
  }, [orders]);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <ErrorState
        title="Failed to load order history"
        description="We couldn't retrieve your past orders. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const groupKeys = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button 
          aria-label="Back"
          onClick={() => navigate(-1)} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-2 text-text-muted hover:bg-surface-3 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <span className="text-xs uppercase font-sans tracking-widest text-ink-500 font-semibold">
            My Account
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 mt-0.5">
            Order History
          </h1>
        </div>
      </div>

      {orders && orders.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="bg-surface-1 rounded-xl p-4 border border-border text-center">
            <div className="text-2xl font-bold text-text">{orders.length}</div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mt-1">Total Orders</div>
          </div>
          <div className="bg-success/10 rounded-xl p-4 border border-success/20 text-center">
            <div className="text-2xl font-bold text-success">{orders.filter(o => o.status === 'delivered').length}</div>
            <div className="text-xs font-medium text-success/80 uppercase tracking-wider mt-1">Delivered</div>
          </div>
          <div className="bg-danger/10 rounded-xl p-4 border border-danger/20 text-center">
            <div className="text-2xl font-bold text-danger">{orders.filter(o => o.status === 'cancelled').length}</div>
            <div className="text-xs font-medium text-danger/80 uppercase tracking-wider mt-1">Cancelled</div>
          </div>
        </div>
      )}

      {groupKeys.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={<PackageOpen size={40} className="text-ink-500" />}
            title="No Past Orders"
            description="You haven't received or skipped any orders yet."
          />
        </div>
      ) : (
        <div className="space-y-8">
          {groupKeys.map((date) => {
            const dayOrders = groupedOrders[date];
            // Format date nicely
            const [y, m, d] = date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const formattedDate = isNaN(dateObj.getTime()) ? date : format(dateObj, 'EEEE, MMM do, yyyy');

            return (
              <div key={date} className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-ink-500 flex items-center gap-2 border-b border-rice-300 pb-2">
                  <Calendar size={16} /> {formattedDate}
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCustomerOrderHistoryPaginated } from '../hooks/useMySubscription';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { StatusChip } from '@/shared/components/ui/StatusChip';
import { MealBadge } from '@/shared/components/ui/MealBadge';
import { PackageOpen, Clock, Calendar, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '@/shared/types';
import { format } from 'date-fns';

export function CustomerOrderHistoryPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useCustomerOrderHistoryPaginated(firebaseUser?.uid);

  const orders = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.orders);
  }, [data]);

  // Group orders by date (orders are already sorted descending by date from the hook)
  const groupedOrders = useMemo(() => {
    if (!orders) return {};
    const groups: Record<string, Order[]> = {};
    for (const order of orders) {
      if (!groups[order.date]) {
        groups[order.date] = [];
      }
      groups[order.date].push(order);
    }
    // Sort meals within the date (breakfast -> lunch -> dinner)
    const mealSortOrder: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };
    for (const date in groups) {
      groups[date].sort((a, b) => (mealSortOrder[a.mealType] || 99) - (mealSortOrder[b.mealType] || 99));
    }
    return groups;
  }, [orders]);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <ErrorState
        title="Failed to load order history"
        description="We couldn't retrieve your past orders. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const groupKeys = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button 
          aria-label="Back"
          onClick={() => navigate(-1)} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-2 text-text-muted hover:bg-surface-3 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <span className="text-xs uppercase font-sans tracking-widest text-ink-500 font-semibold">
            My Account
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink-900 mt-0.5">
            Order History
          </h1>
        </div>
      </div>

      {orders && orders.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="bg-surface-1 rounded-xl p-4 border border-border text-center">
            <div className="text-2xl font-bold text-text">{orders.length}</div>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mt-1">Total Orders</div>
          </div>
          <div className="bg-success/10 rounded-xl p-4 border border-success/20 text-center">
            <div className="text-2xl font-bold text-success">{orders.filter(o => o.status === 'delivered').length}</div>
            <div className="text-xs font-medium text-success/80 uppercase tracking-wider mt-1">Delivered</div>
          </div>
          <div className="bg-danger/10 rounded-xl p-4 border border-danger/20 text-center">
            <div className="text-2xl font-bold text-danger">{orders.filter(o => o.status === 'cancelled').length}</div>
            <div className="text-xs font-medium text-danger/80 uppercase tracking-wider mt-1">Cancelled</div>
          </div>
        </div>
      )}

      {groupKeys.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={<PackageOpen size={40} className="text-ink-500" />}
            title="No Past Orders"
            description="You haven't received or skipped any orders yet."
          />
        </div>
      ) : (
        <>
          <div className="space-y-8">
            {groupKeys.map((date) => {
              const dayOrders = groupedOrders[date];
              // Format date nicely
              const [y, m, d] = date.split('-').map(Number);
              const dateObj = new Date(y, m - 1, d);
              const formattedDate = isNaN(dateObj.getTime()) ? date : format(dateObj, 'EEEE, MMM do, yyyy');

              return (
                <div key={date} className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-ink-500 flex items-center gap-2 border-b border-rice-300 pb-2">
                    <Calendar size={16} /> {formattedDate}
                  </h2>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    {dayOrders.map((order) => {
                      const isTerminal = ['delivered', 'failed_delivery', 'cancelled'].includes(order.status);
                      
                      return (
                        <Card 
                          key={order.id} 
                          className={`p-4 transition-all duration-200 border-rice-300 ${!isTerminal ? 'bg-white' : 'bg-surface-1/50 opacity-90'}`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <MealBadge mealType={order.mealType} compact={false} />
                            <StatusChip status={order.status} size="sm" />
                          </div>
                          
                          <div className="space-y-1.5 text-sm font-sans mt-3 border-t border-rice-200 pt-3">
                            <div className="flex justify-between text-ink-600">
                              <span className="font-medium text-xs">Quantity:</span>
                              <span className="font-bold text-ink-900 text-xs">{order.mealQuantity || 1}</span>
                            </div>
                            {order.deliveryWindow && (
                              <div className="flex justify-between text-ink-600">
                                <span className="font-medium text-xs flex items-center gap-1"><Clock size={12}/> Window:</span>
                                <span className="text-xs">{order.deliveryWindow.start}–{order.deliveryWindow.end}</span>
                              </div>
                            )}
                            {order.deliveryResult && order.status === 'failed_delivery' && (
                              <div className="bg-danger/10 p-2 rounded-lg mt-2 text-danger text-xs font-medium">
                                Failed: {order.deliveryResult.reasonCode.replace('_', ' ')}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {hasNextPage && (
            <div className="flex justify-center mt-8">
              <button
                aria-label="Load more"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold rounded-full border border-emerald-200 transition-colors flex items-center justify-center min-w-[140px]"
              >
                {isFetchingNextPage ? (
                  <div className="w-5 h-5 border-2 border-emerald-700/30 border-t-emerald-700 rounded-full animate-spin" />
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
