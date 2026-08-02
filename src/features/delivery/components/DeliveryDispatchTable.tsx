import { OrderCard } from '@/shared/components/ui/OrderCard';

import { User, MapPin } from 'lucide-react';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import type { DeliveryPartnerGroup } from '@/shared/services/business/deliveryService';


interface Props {
  groupedOrders: DeliveryPartnerGroup[];
  customerMap: Map<string, any>;
  onReassign: (orderId: string, partnerId: string | null) => void;
  partners: any[];
}

export function DeliveryDispatchTable({ groupedOrders, customerMap, onReassign, partners }: Props) {
  
  if (groupedOrders.length === 0) {
    return (
      <div className="text-center py-12 bg-surface-2 rounded-[20px] border border-border">
        <p className="text-text-muted font-medium">No assigned orders to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedOrders.map(partnerGroup => (
        <div key={partnerGroup.partnerName} className="space-y-3">
          {/* Partner Header */}
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-sm shadow-xs">
              {partnerGroup.partnerName?.charAt(0) || <User size={14} />}
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-text">
                {partnerGroup.partnerName === 'Unassigned' ? '⚠ Unassigned Orders' : partnerGroup.partnerName}
              </h3>
              <p className="text-xs text-text-muted">
                {partnerGroup.areas.reduce((sum, a) => sum + a.orders.length, 0)} orders
              </p>
            </div>
          </div>

          {partnerGroup.areas.map(areaGroup => (
            <div key={areaGroup.areaName} className="space-y-2">
              {/* Area label */}
              {areaGroup.areaName !== 'Unknown Area' && (
                <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-text-muted">
                  <MapPin size={12} className="text-secondary" />
                  <span>{areaGroup.areaName}</span>
                  <Badge variant="default" className="text-[10px] px-1.5 py-0.5 ml-1">
                    {areaGroup.orders.length}
                  </Badge>
                </div>
              )}

              {areaGroup.orders.map(order => {
                const customer = customerMap.get(order.customerId);
                const addr = customer?.addresses?.find((a: any) => a.id === customer?.defaultAddressId) || customer?.addresses?.[0];
                const addressText = addr ? [addr.line1, addr.line2, addr.city].filter(Boolean).join(', ') : undefined;
                const planName = order.planTier 
                  ? order.planTier.charAt(0).toUpperCase() + order.planTier.slice(1) 
                  : null;

                return (
                  <OrderCard
                    key={order.id}
                    order={order}
                    variant="admin"
                    customer={{
                      fullName: customer?.fullName || 'Unknown Customer',
                      displayId: customer?.displayId,
                      phone: customer?.phone,
                      photoUrl: customer?.photoUrl,
                      address: addressText,
                    }}
                    partnerName={partnerGroup.partnerName !== 'Unassigned' ? partnerGroup.partnerName : null}
                    planName={planName}
                    zoneName={areaGroup.areaName !== 'Unknown Area' ? areaGroup.areaName : undefined}
                    extraActions={
                      <select
                        className="h-8 text-xs border border-border rounded-[10px] bg-white px-2 text-text focus:outline-none focus:ring-1 focus:ring-secondary/40"
                        value={order.deliveryPartnerId || ''}
                        onChange={(e) => onReassign(order.id, e.target.value || null)}
                        title="Reassign partner"
                      >
                        <option value="">Unassign</option>
                        {partners.map(p => (
                          <option key={p.id} value={p.id}>{p.fullName || p.id}</option>
                        ))}
                      </select>
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
