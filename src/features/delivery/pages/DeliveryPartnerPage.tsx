import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePartnerBoard } from '../hooks/usePartnerBoard';
import { getTodayInTimezone } from '@/shared/lib/date';
import { Truck, AlertCircle, MapPin } from 'lucide-react';
import { StaffAttendanceCard } from '@/features/hr/components/StaffAttendanceCard';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { DeliveryPartnerTable } from '../components/DeliveryPartnerTable';
import { useReferenceData } from '@/shared/hooks/useReferenceData';

function getDefaultMealType(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false
  });
  const hourStr = formatter.format(new Date());
  // Intl.DateTimeFormat can return '24' for midnight when hourCycle is not set properly, parsing safely.
  const hour = parseInt(hourStr.replace(/[^0-9]/g, ''), 10) % 24;
  
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
}

export function DeliveryPartnerPage() {
  const { firebaseUser, profile } = useAuth();
  const today = getTodayInTimezone();
  const activeMeal = getDefaultMealType();

  const { orders, session, allTerminal, isLoading, error, updateMutation, completeRouteMutation } = usePartnerBoard(firebaseUser?.uid || '', today, activeMeal);
  const { zoneMap } = useReferenceData();

  const assignedZones = profile?.role === 'delivery_partner' && profile.zoneIds?.length > 0 
    ? profile.zoneIds.map((id: string) => zoneMap.get(id) || id).join(', ') 
    : 'None';

  const uniqueCustomersToday = new Set(orders.map(o => o.customerId)).size;

  // Customer details are denormalized onto the order document itself.
  // Firestore rules correctly block delivery partners from querying the entire users collection.
  const customerMap = new Map();

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
          {today} | {orders?.length || 0} assigned orders | {uniqueCustomersToday} unique customers
        </p>
        {profile?.role === 'delivery_partner' && (
          <div className="mt-4 p-3.5 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in zoom-in-95 duration-300">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-xs text-primary/80 font-bold uppercase tracking-wider mb-0.5">Assigned Zones</p>
              <p className="text-lg font-display font-bold text-primary-dark">{assignedZones}</p>
            </div>
          </div>
        )}
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
        orders={orders.filter(o => o.status !== 'cancelled' && o.status !== 'skipped')}
        customerMap={customerMap}
        onAdvance={handleAdvance}
        isAdvancingId={updateMutation.isPending ? updateMutation.variables?.orderId || null : null}
        allTerminal={allTerminal}
        isCompletingRoute={completeRouteMutation.isPending}
        onCompleteRoute={() => completeRouteMutation.mutate()}
        sessionStatus={session?.status || 'not_started'}
        currentDeliveryPartnerId={firebaseUser?.uid || null}
      />
    </div>
  );
}
