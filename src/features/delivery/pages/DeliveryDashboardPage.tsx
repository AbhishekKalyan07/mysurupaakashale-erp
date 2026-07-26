import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useUnassignedOrders, useAssignedOrders, useAssignDelivery, useReassignDelivery } from '../hooks/useDelivery';
import { useCustomerNameMap } from '@/features/kitchen/hooks/useProductionBoard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { MapPin, Truck, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
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

  const allCustomerIds = Array.from(new Set([
    ...(unassignedOrders?.map(o => o.customerId) || []),
    ...(assignedOrders?.map(o => o.customerId) || [])
  ]));
  const customerNameMap = useCustomerNameMap(allCustomerIds);

  if (loadingUnassigned || loadingAssigned) return <LoadingScreen />;

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Truck className="text-leaf-600" />
            Dispatch Dashboard
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Date: {today} | Unassigned: {unassignedOrders?.length || 0} | Assigned: {assignedOrders?.length || 0}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Unassigned Column */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-rice-200 pb-2">
            <h2 className="text-xl font-semibold text-ink-900 flex items-center gap-2">
              <AlertCircle size={20} className="text-warning" />
              Unassigned Orders
            </h2>
            <Button variant="ghost" size="sm" onClick={handleSelectAllUnassigned}>
              {selectedOrders.size > 0 && selectedOrders.size === unassignedOrders?.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="bg-rice-25 p-4 rounded-xl border border-rice-200 min-h-[300px]">
            {unassignedOrders?.length === 0 ? (
              <EmptyState 
                title="All clear!" 
                description="No unassigned orders at the moment." 
                icon={<AlertCircle size={32} className="text-ink-400" />}
              />
            ) : (
              <div className="space-y-3">
                {unassignedOrders?.map(order => (
                  <Card key={order.id} className="p-3 flex items-start gap-3 transition-shadow hover:shadow-card-hover">
                    <input 
                      type="checkbox" 
                      className="mt-1 rounded border-rice-300 text-leaf-600 focus:ring-leaf-600"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => handleSelect(order.id)}
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-ink-900">{customerNameMap.get(order.customerId) || order.customerId}</span>
                        <Badge tone="neutral">{order.status}</Badge>
                      </div>
                      <div className="text-xs text-ink-500 mt-1 flex gap-3">
                        <span className="flex items-center gap-1"><MapPin size={12}/> {order.zoneId || 'No Zone'}</span>
                        <span className="flex items-center gap-1"><Clock size={12}/> {order.deliveryWindow?.start}-{order.deliveryWindow?.end}</span>
                      </div>
                      <div className="text-xs text-ink-700 mt-1 truncate" title={order.itemsLabel}>{order.itemsLabel}</div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {selectedOrders.size > 0 && (
            <Card className="p-4 bg-leaf-50 border-leaf-200 flex flex-col sm:flex-row gap-3 items-end sm:items-center justify-between sticky bottom-4 shadow-xl">
              <div>
                <span className="font-bold text-leaf-900">{selectedOrders.size}</span> orders selected
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="text"
                  placeholder="Partner ID"
                  value={partnerIdInput}
                  onChange={e => setPartnerIdInput(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-rice-300 text-sm focus:ring-2 focus:ring-leaf-600 flex-1 sm:w-40"
                />
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
          <div className="flex items-center justify-between border-b border-rice-200 pb-2">
            <h2 className="text-xl font-semibold text-ink-900 flex items-center gap-2">
              <CheckCircle2 size={20} className="text-success" />
              Assigned Orders
            </h2>
          </div>

          <div className="bg-rice-25 p-4 rounded-xl border border-rice-200 min-h-[300px]">
            {assignedOrders?.length === 0 ? (
              <EmptyState 
                title="No assigned orders" 
                description="Assign orders to partners to see them here." 
                icon={<Truck size={32} className="text-ink-400" />}
              />
            ) : (
              <div className="space-y-3">
                {assignedOrders?.map(order => (
                  <Card key={order.id} className="p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold text-ink-900">{customerNameMap.get(order.customerId) || order.customerId}</span>
                        <div className="text-xs text-ink-500">Partner: <span className="font-data">{order.deliveryPartnerId}</span></div>
                      </div>
                      <Badge tone={order.status === 'delivered' ? 'success' : order.status === 'out_for_delivery' ? 'info' : 'warning'}>
                        {order.status}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-rice-100">
                       <div className="text-xs text-ink-500 flex gap-3">
                        <span className="flex items-center gap-1"><MapPin size={12}/> {order.zoneId || 'No Zone'}</span>
                      </div>
                      
                      {role === 'admin' && (
                        <button 
                          onClick={() => {
                            const newPartner = prompt('Enter new partner ID (or leave blank to unassign):', order.deliveryPartnerId || '');
                            if (newPartner !== null) {
                              handleReassign(order.id, newPartner === '' ? null : newPartner);
                            }
                          }}
                          className="text-xs text-leaf-600 hover:underline"
                        >
                          Reassign
                        </button>
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
