import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useUnassignedOrders, useAssignedOrders, useAssignDelivery, useReassignDelivery } from '../hooks/useDelivery';
import { useCustomerNameMap } from '@/features/kitchen/hooks/useProductionBoard';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { MapPin, Truck, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { APP_CONFIG } from '@/shared/config/appConfig';

export function DeliveryDashboardPage() {
  const { role } = useAuth();
  const today = new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system, { timeZone: APP_CONFIG.timezone }).format(new Date());

  const { data: unassignedOrders, isLoading: loadingUnassigned } = useUnassignedOrders(today);
  const { data: assignedOrders, isLoading: loadingAssigned } = useAssignedOrders(today);

  const assignMutation = useAssignDelivery();
  const reassignMutation = useReassignDelivery();

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [partnerIdInput, setPartnerIdInput] = useState('');

  const { data: deliveryPartners } = useQuery({
    queryKey: ['users', 'delivery_partner'],
    queryFn: async () => {
      const { where } = await import('firebase/firestore');
      return userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true));
    }
  });

  const allCustomerIds = Array.from(new Set([
    ...(unassignedOrders?.map(o => o.customerId) || []),
    ...(assignedOrders?.map(o => o.customerId) || [])
  ]));
  const customerNameMap = useCustomerNameMap(allCustomerIds);

  if (loadingUnassigned || loadingAssigned) return <div className="p-8"><DashboardCardsSkeleton /></div>;

  const handleSelect = (id: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOrders(newSet);
  };

  const handleSelectAllUnassigned = () => {
    if (unassignedOrders && selectedOrders.size === unassignedOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(unassignedOrders?.map(o => o.id) || []));
    }
  };

  const handleAssign = async () => {
    if (selectedOrders.size === 0 || !partnerIdInput) return;
    try {
      await assignMutation.mutateAsync({
        orderIds: Array.from(selectedOrders),
        partnerId: partnerIdInput,
      });
      setSelectedOrders(new Set());
      setPartnerIdInput('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to assign orders.');
    }
  };

  const handleReassign = async (orderId: string, newPartnerId: string | null) => {
    try {
      await reassignMutation.mutateAsync({ orderId, partnerId: newPartnerId });
    } catch (err) {
      console.error(err);
      toast.error('Failed to reassign order.');
    }
  };

  return (
    <div className="space-y-8">
      <HeroBanner 
        userName="Dispatch Team"
        subtitle={`Date: ${today} | Unassigned: ${unassignedOrders?.length || 0} | Assigned: ${assignedOrders?.length || 0}`}
      />

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Unassigned Column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gold/20 pb-2">
            <h2 className="text-xl font-display font-semibold text-primary flex items-center gap-2">
              <AlertCircle size={20} className="text-warning" />
              Unassigned Orders
            </h2>
            <Button variant="ghost" size="sm" onClick={handleSelectAllUnassigned}>
              {selectedOrders.size > 0 && selectedOrders.size === unassignedOrders?.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="bg-background p-4 rounded-xl border border-gold/20 shadow-sm min-h-[300px]">
            {unassignedOrders?.length === 0 ? (
              <EmptyState 
                title="All clear!" 
                description="No unassigned orders at the moment." 
                icon={<AlertCircle size={32} className="text-text-muted/60" />}
              />
            ) : (
              <div className="space-y-3">
                {unassignedOrders?.map(order => (
                  <Card key={order.id} hoverLift className="p-4 flex items-start gap-4">
                    <input 
                      type="checkbox" 
                      className="mt-1 rounded border-gold/40 text-primary focus:ring-primary"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => handleSelect(order.id)}
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold font-display text-primary">{customerNameMap.get(order.customerId) || order.customerId}</span>
                        <Badge variant="default">{order.status}</Badge>
                      </div>
                      <div className="text-xs text-text-muted mt-1 flex gap-4">
                        <span className="flex items-center gap-1"><MapPin size={14}/> {order.zoneId || 'No Zone'}</span>
                        <span className="flex items-center gap-1"><Clock size={14}/> {order.deliveryWindow?.start}-{order.deliveryWindow?.end}</span>
                      </div>
                      <div className="text-xs text-primary mt-2 p-2 bg-background rounded-lg border border-gold/10 truncate" title={order.itemsLabel}>{order.itemsLabel}</div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {selectedOrders.size > 0 && (
            <Card className="p-4 bg-primary/5 border-primary/20 flex flex-col sm:flex-row gap-3 items-end sm:items-center justify-between sticky bottom-4 shadow-xl ring-1 ring-gold/20">
              <div>
                <span className="font-bold font-display text-primary">{selectedOrders.size}</span> <span className="text-text-muted">orders selected</span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={partnerIdInput}
                  onChange={e => setPartnerIdInput(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gold/30 text-sm focus:ring-2 focus:ring-gold/50 flex-1 sm:w-48 bg-white text-text shadow-sm"
                >
                  <option value="">Select Partner</option>
                  {deliveryPartners?.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName || p.id}</option>
                  ))}
                </select>
                <Button 
                  onClick={handleAssign} 
                  disabled={!partnerIdInput || assignMutation.isPending}
                  isLoading={assignMutation.isPending}
                >
                  Assign
                </Button>
              </div>
            </Card>
          )}
        </section>

        {/* Assigned Column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gold/20 pb-2">
            <h2 className="text-xl font-display font-semibold text-primary flex items-center gap-2">
              <CheckCircle2 size={20} className="text-success" />
              Assigned Orders
            </h2>
          </div>

          <div className="bg-background p-4 rounded-xl border border-gold/20 shadow-sm min-h-[300px]">
            {assignedOrders?.length === 0 ? (
              <EmptyState 
                title="No assigned orders" 
                description="Assign orders to partners to see them here." 
                icon={<Truck size={32} className="text-text-muted/60" />}
              />
            ) : (
              <div className="space-y-3">
                {assignedOrders?.map(order => (
                  <Card key={order.id} hoverLift className="p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold font-display text-primary">{customerNameMap.get(order.customerId) || order.customerId}</span>
                        <div className="text-xs text-text-muted mt-0.5">Partner: <span className="font-data text-primary">{order.deliveryPartnerId}</span></div>
                      </div>
                      <Badge variant={order.status === 'delivered' ? 'success' : order.status === 'out_for_delivery' ? 'info' : 'warning'}>
                        {order.status}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-gold/10">
                       <div className="text-xs text-text-muted flex gap-3">
                        <span className="flex items-center gap-1"><MapPin size={14}/> {order.zoneId || 'No Zone'}</span>
                      </div>
                      
                      {role === 'admin' && (
                        <select
                          className="text-xs text-primary bg-transparent border-b border-gold/40 outline-none cursor-pointer py-1 font-medium hover:text-gold transition-colors"
                          value=""
                          onChange={(e) => {
                            if (e.target.value === 'unassign') {
                              handleReassign(order.id, null);
                            } else if (e.target.value) {
                              handleReassign(order.id, e.target.value);
                            }
                          }}
                        >
                          <option value="">Reassign...</option>
                          <option value="unassign">Unassign</option>
                          {deliveryPartners?.map(p => (
                            <option key={p.id} value={p.id}>{p.fullName || p.id}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
