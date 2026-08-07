import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePartnerBoard } from '../hooks/usePartnerBoard';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { Truck, AlertCircle } from 'lucide-react';
import { StaffAttendanceCard } from '@/features/hr/components/StaffAttendanceCard';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { useQuery } from '@tanstack/react-query';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { DeliveryPartnerTable } from '../components/DeliveryPartnerTable';

export function DeliveryPartnerPage() {
  const { firebaseUser } = useAuth();
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { timeZone: APP_CONFIG.timezone }).format(new Date());

  const { orders, session, allTerminal, isLoading, error, updateMutation, completeRouteMutation } = usePartnerBoard(firebaseUser?.uid || '', today);

  const { data: customers = [] } = useQuery({
    queryKey: ['users', 'customers', firebaseUser?.uid],
    queryFn: async () => {
      const { where } = await import('firebase/firestore');
      return userRepository.list(
        where('role', '==', 'customer'),
        where('deliveryPartnerId', '==', firebaseUser?.uid)
      );
    },
    enabled: !!firebaseUser?.uid,
    staleTime: 1000 * 60 * 5,
  });
  
  const customerMap = new Map(customers.map(c => [c.id, c]));

  if (isLoading) return <div className="p-8"><DashboardCardsSkeleton /></div>;

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <EmptyState title="Could not load route" description={(error as Error).message} icon={<AlertCircle className="text-danger" size={40}/>} />
      </div>
    );
  }

  const handleAdvance = async (orderId: string, newStatus: string, result?: { reasonCode: string, notes?: string }) => {
    try {
      await updateMutation.mutateAsync({ orderId, newStatus: newStatus as any, deliveryResult: result });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900 flex items-center gap-2">
          <Truck className="text-leaf-600" />
          My Delivery Route
        </h1>
        <p className="text-sm text-ink-500 font-sans mt-1">
          {today} | {orders?.length || 0} assigned
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-surface rounded-xl p-3 border border-border">
          <p className="text-xs text-text-muted font-medium">Pending</p>
          <p className="text-lg font-bold text-text">
            {orders.filter(o => !['delivered', 'failed_delivery', 'returned_delivery', 'cancelled'].includes(o.status)).length}
          </p>
        </div>
        <div className="bg-success-subtle rounded-xl p-3 border border-success/20">
          <p className="text-xs text-success-dark font-medium">Delivered</p>
          <p className="text-lg font-bold text-success-dark">
            {orders.filter(o => o.status === 'delivered').length}
          </p>
        </div>
        <div className="bg-danger-subtle rounded-xl p-3 border border-danger/20">
          <p className="text-xs text-danger-dark font-medium">Failed / Returned</p>
          <p className="text-lg font-bold text-danger-dark">
            {orders.filter(o => ['failed_delivery', 'returned_delivery'].includes(o.status)).length}
          </p>
        </div>
      </div>

      <StaffAttendanceCard />

      <DeliveryPartnerTable 
        orders={orders}
        customerMap={customerMap}
        onAdvance={handleAdvance}
        isAdvancingId={updateMutation.isPending ? updateMutation.variables?.orderId || null : null}
        allTerminal={allTerminal}
        isCompletingRoute={completeRouteMutation.isPending}
        onCompleteRoute={() => completeRouteMutation.mutate()}
        sessionStatus={session?.status || 'not_started'}
      />
    </div>
  );
}
