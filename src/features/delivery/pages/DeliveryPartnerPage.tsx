import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useDeliveryPartnerOrders, useUpdateDeliveryStatus } from '../hooks/useDelivery';
import { useCustomerNameMap } from '@/features/kitchen/hooks/useProductionBoard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { toast } from 'react-hot-toast';
import { APP_CONFIG } from '@/shared/config/appConfig';
import { Truck, MapPin, Package, Phone, CheckCircle2, Navigation, AlertCircle } from 'lucide-react';
import { StaffAttendanceCard } from '@/features/hr/components/StaffAttendanceCard';

export function DeliveryPartnerPage() {
  const { firebaseUser } = useAuth();
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { timeZone: APP_CONFIG.timezone }).format(new Date());

  const { orders, isLoading, error } = useDeliveryPartnerOrders(firebaseUser?.uid || '', today);
  const updateMutation = useUpdateDeliveryStatus();

  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const customerIds = Array.from(new Set(orders?.map(o => o.customerId) || []));
  const customerNameMap = useCustomerNameMap(customerIds);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <EmptyState title="Could not load route" description={(error as Error).message} icon={<AlertCircle className="text-danger" size={40}/>} />
      </div>
    );
  }

  const handleAdvance = async (orderId: string, currentStatus: string) => {
    let nextStatus = '';
    if (currentStatus === 'ready_for_pickup') nextStatus = 'out_for_delivery';
    else if (currentStatus === 'out_for_delivery') nextStatus = 'delivered';
    else return;

    const action = nextStatus === 'out_for_delivery' ? 'Start Delivery' : 'Mark Delivered';
    if (!window.confirm(`Are you sure you want to ${action}?`)) {
      return;
    }

    setAdvancingId(orderId);
    try {
      await updateMutation.mutateAsync({ orderId, newStatus: nextStatus });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status.');
    } finally {
      setAdvancingId(null);
    }
  };

  const handleFailed = async (orderId: string) => {
    if (!window.confirm(`Are you sure you want to mark this delivery as FAILED?`)) {
      return;
    }
    const notes = prompt('Please enter the reason for failure:');
    if (notes === null) return;

    setAdvancingId(orderId);
    try {
      await updateMutation.mutateAsync({ orderId, newStatus: 'failed_delivery' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status.');
    } finally {
      setAdvancingId(null);
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
          {today} | {orders?.length || 0} stops
        </p>
      </div>

      <StaffAttendanceCard />

      <div className="space-y-4">
        {orders?.length === 0 ? (
          <EmptyState 
            title="No deliveries today" 
            description="You don't have any orders assigned to you yet." 
            icon={<CheckCircle2 size={40} className="text-success" />} 
          />
        ) : (
          orders?.map((order, index) => {
            const customerName = customerNameMap.get(order.customerId) || order.customerId;
            const isTerminal = order.status === 'delivered' || order.status === 'failed_delivery';
            
            return (
              <Card key={order.id} className={`p-4 ${isTerminal ? 'opacity-60 bg-rice-50' : 'bg-rice-25 shadow-sm'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="bg-leaf-100 text-leaf-800 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-ink-900 text-lg">{customerName}</h3>
                      <div className="text-xs text-ink-500 mt-1 flex flex-col gap-1">
                        <span className="flex items-center gap-1"><MapPin size={14}/> {order.deliveryAddressId || 'Address not available'}</span>
                        <span className="flex items-center gap-1"><Package size={14}/> {order.itemsLabel}</span>
                        <span className="flex items-center gap-1"><Navigation size={14}/> Window: {order.deliveryWindow?.start}-{order.deliveryWindow?.end}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={
                      order.status === 'delivered' ? 'success' : 
                      order.status === 'failed_delivery' ? 'danger' : 
                      order.status === 'out_for_delivery' ? 'info' : 'warning'
                    }>
                      {order.status.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                    {!isTerminal && (
                      <Button variant="ghost" size="sm" className="text-leaf-600 h-8 px-2" onClick={() => toast.success('Feature coming soon: Call Customer')}>
                        <Phone size={14}/>
                      </Button>
                    )}
                  </div>
                </div>

                {!isTerminal && (
                  <div className="mt-4 pt-4 border-t border-rice-200 flex gap-2">
                    {order.status === 'ready_for_pickup' && (
                      <Button 
                        className="flex-1" 
                        onClick={() => handleAdvance(order.id, order.status)}
                        isLoading={advancingId === order.id}
                        disabled={advancingId === order.id}
                      >
                        Start Delivery
                      </Button>
                    )}
                    {order.status === 'out_for_delivery' && (
                      <>
                        <Button 
                          className="flex-1 bg-success hover:bg-success/90" 
                          onClick={() => handleAdvance(order.id, order.status)}
                          isLoading={advancingId === order.id}
                          disabled={advancingId === order.id}
                        >
                          Mark Delivered
                        </Button>
                        <Button 
                          variant="secondary"
                          className="text-danger" 
                          onClick={() => handleFailed(order.id)}
                          isLoading={advancingId === order.id}
                          disabled={advancingId === order.id}
                        >
                          Failed
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
