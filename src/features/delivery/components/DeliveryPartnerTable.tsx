import { CheckCircle2 } from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { OrderCard } from '@/shared/components/ui/OrderCard';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import type { Order, OrderStatus } from '@/shared/types';

interface Props {
  orders: Order[];
  customerMap: Map<string, any>;
  onAdvance: (orderId: string, newStatus: Order['status'], result?: { reasonCode: string, notes?: string }) => Promise<void>;
  isAdvancingId: string | null;
  allTerminal: boolean;
  isCompletingRoute: boolean;
  onCompleteRoute: () => void;
  sessionStatus: string;
}

export function DeliveryPartnerTable({ 
  orders, 
  customerMap, 
  onAdvance, 
  isAdvancingId,
  allTerminal,
  isCompletingRoute,
  onCompleteRoute,
  sessionStatus
}: Props) {

  if (orders.length === 0) {
    return (
      <EmptyState 
        title="No deliveries today" 
        description="You don't have any orders assigned to you yet." 
        icon={<CheckCircle2 size={40} className="text-success" />} 
      />
    );
  }

  const handleStatusChange = async (
    orderId: string, 
    newStatus: OrderStatus, 
    extra?: { reasonCode: string, notes?: string }
  ) => {
    await onAdvance(orderId, newStatus, extra);
  };

  return (
    <div className="space-y-3">
      {orders.map((order, index) => {
        const customer = customerMap.get(order.customerId);
        const customerName = customer?.fullName || 'Unknown Customer';
        const addr = customer?.addresses?.find((a: any) => a.id === customer?.defaultAddressId) || customer?.addresses?.[0];
        const addressText = addr ? [addr.line1, addr.line2, addr.city].filter(Boolean).join(', ') : order.deliveryAddressId || undefined;
        const addressCoords = addr && addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null;

        return (
          <OrderCard
            key={order.id}
            order={order}
            variant="delivery"
            sequenceNumber={index + 1}
            customer={{
              fullName: customerName,
              displayId: customer?.displayId,
              phone: customer?.phone,
              photoUrl: customer?.photoUrl,
              address: addressText,
              addressCoords: addressCoords,
            }}
            onStatusChange={handleStatusChange}
            isAdvancing={isAdvancingId === order.id}
          />
        );
      })}

      {/* All Terminal → Complete Route */}
      {allTerminal && sessionStatus !== 'completed' && (
        <Card elevated className="p-6 bg-success-subtle border-success/20 flex flex-col items-center justify-center text-center gap-4 mt-4">
          <CheckCircle2 size={44} className="text-success" />
          <div>
            <h3 className="font-display font-bold text-lg text-text">All deliveries completed!</h3>
            <p className="text-sm text-text-muted mt-1">Please finalize your session to log the route completion.</p>
          </div>
          <Button
            variant="success"
            size="lg"
            className="w-full sm:w-auto"
            onClick={onCompleteRoute}
            isLoading={isCompletingRoute}
          >
            Complete Route
          </Button>
        </Card>
      )}

      {sessionStatus === 'completed' && (
        <Card className="p-6 bg-surface-2 text-center border-border mt-4">
          <CheckCircle2 size={32} className="mx-auto text-success mb-2" />
          <h3 className="font-display font-bold text-base text-text">Route Completed</h3>
          <p className="text-sm text-text-muted mt-1">You have successfully finished today's route.</p>
        </Card>
      )}
    </div>
  );
}
