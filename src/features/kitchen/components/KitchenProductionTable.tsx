import { useState, useMemo } from 'react';
import type { Order } from '@/shared/types';
import type { OrderStatus } from '@/shared/types';
export type KitchenWorkflowStatus = Extract<
  OrderStatus,
  'scheduled' | 'packing' | 'packed' | 'ready_for_pickup' | 'cancelled'
>;
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { ChefHat, Search } from 'lucide-react';
import { OrderCard } from '@/shared/components/ui/OrderCard';

interface Props {
  orders: Order[];
  zoneMap: Map<string, string>;
  partnerMap: Map<string, string>;
  customerMap: Map<string, string>;
  onAdvanceStatus: (orderId: string, status: string) => Promise<void>;
  advancingOrders: Set<string>;
}

export function KitchenProductionTable({
  orders,
  zoneMap,
  partnerMap,
  customerMap,
  onAdvanceStatus,
  advancingOrders
}: Props) {
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [mealFilter, setMealFilter] = useState<'all' | 'breakfast' | 'lunch' | 'dinner'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | KitchenWorkflowStatus>('all');
  
  // Extract unique areas and partners for filter dropdowns (based on available orders)
  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    orders.forEach(o => {
      const area = o.zoneId ? zoneMap.get(o.zoneId) || o.zoneId : 'Unassigned Area';
      areas.add(area);
    });
    return Array.from(areas).sort();
  }, [orders, zoneMap]);

  const [areaFilter, setAreaFilter] = useState<'all' | string>('all');

  // Filter Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status === 'skipped') return false;
      // When a specific status is selected, apply that filter (including 'cancelled').
      // When 'all' is selected, hide cancelled orders — they must be viewed via the Cancelled filter.
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (statusFilter === 'all' && o.status === 'cancelled') return false;
      // Apply meal type filter against the actual o.mealType field.
      if (mealFilter !== 'all' && o.mealType !== mealFilter) return false;
      
      const area = o.zoneId ? zoneMap.get(o.zoneId) || o.zoneId : 'Unassigned Area';
      if (areaFilter !== 'all' && area !== areaFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customerName = (customerMap.get(o.customerId) || o.customerId).toLowerCase();
        const idMatch = o.displayId?.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
        if (!customerName.includes(q) && !idMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort tier 1: Status (scheduled → packing → packed → ready_for_pickup)
      const statusOrder: Record<string, number> = { scheduled: 1, packing: 2, packed: 3, ready_for_pickup: 4, out_for_delivery: 5, delivered: 6 };
      const aStat = statusOrder[a.status] || 99;
      const bStat = statusOrder[b.status] || 99;
      if (aStat !== bStat) return aStat - bStat;

      // Sort tier 2: Order type — subscription before one_time (more critical to handle first)
      const sourceOrder: Record<string, number> = { subscription: 1, one_time: 2 };
      const aSrc = sourceOrder[a.source] ?? 99;
      const bSrc = sourceOrder[b.source] ?? 99;
      if (aSrc !== bSrc) return aSrc - bSrc;

      // Sort tier 3: Customer name alphabetically
      const aName = customerMap.get(a.customerId) || '';
      const bName = customerMap.get(b.customerId) || '';
      return aName.localeCompare(bName);
    });
  }, [orders, mealFilter, statusFilter, areaFilter, searchQuery, zoneMap, customerMap]);

  return (
    <Card className="flex flex-col border border-rice-200">
      {/* Filters Bar */}
      <div className="p-4 border-b border-rice-200 bg-rice-25 flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            placeholder="Search customer or Order ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-rice-300 bg-white text-sm focus:ring-2 focus:ring-leaf-500 outline-none"
          />
        </div>

        {/* Meal Filter Pills */}
        <div className="flex gap-2 items-center mr-auto">
          {(['all', 'breakfast', 'lunch', 'dinner'] as const).map(meal => (
            <button
              key={meal}
              aria-label="Button action"
              onClick={() => setMealFilter(meal)}
              className={`px-4 py-1.5 rounded-full text-xs tracking-wider font-bold transition-colors uppercase ${
                mealFilter === meal
                  ? 'bg-ink-900 text-white'
                  : 'bg-surface-2 text-ink-500 border border-border hover:bg-surface-3'
              }`}
            >
              {meal}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="h-9 px-3 rounded-lg border border-rice-300 bg-white text-sm focus:ring-2 focus:ring-leaf-500 outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="packing">Packing</option>
          <option value="packed">Packed</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Area Filter */}
        <select
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-rice-300 bg-white text-sm focus:ring-2 focus:ring-leaf-500 outline-none"
        >
          <option value="all">All Areas</option>
          {uniqueAreas.map(area => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      <div className="p-4 bg-background min-h-[400px]">
        {filteredOrders.length === 0 ? (
          <EmptyState
            icon={<ChefHat size={40} className="text-primary/40" />}
            title="No orders found"
            description="No orders match the current filters. Adjust your search or check back later."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOrders.map(order => {
              const customerName = order.customerName || customerMap.get(order.customerId) || order.customerId;
              const area = order.zoneId ? zoneMap.get(order.zoneId) || order.zoneId : undefined;
              const partner = order.deliveryPartnerId ? partnerMap.get(order.deliveryPartnerId) || order.deliveryPartnerId : undefined;
              const plan = order.source === 'subscription' ? order.planTier : 'One-Time';
              
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  variant="kitchen"
                  customer={{
                    fullName: customerName,
                    displayId: order.customerCode,
                  }}
                  partnerName={partner}
                  zoneName={area}
                  planName={plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : undefined}
                  onStatusChange={async (id, st) => {
                    await onAdvanceStatus(id, st);
                  }}
                  isAdvancing={advancingOrders.has(order.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
