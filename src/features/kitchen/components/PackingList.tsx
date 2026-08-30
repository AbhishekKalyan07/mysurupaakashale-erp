import type { AreaPackingGroup } from '@/shared/services/business/productionService';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { MapPin } from 'lucide-react';

interface Props {
  areaGroups: AreaPackingGroup[];
}

export function PackingList({ areaGroups }: Props) {
  if (areaGroups.length === 0) {
    return <div className="text-sm text-ink-500 py-8 text-center bg-rice-50 rounded-xl border border-rice-200">No orders for packing.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {areaGroups.map((group) => {
        const total = group.breakfast + group.lunch + group.dinner;
        if (total === 0) return null;

        return (
          <Card key={group.areaName} className="flex flex-col border-t-4 border-t-turmeric-400">
            <div className="p-4 border-b border-rice-100 flex justify-between items-center bg-rice-25">
              <div className="flex items-center gap-2 text-ink-900 font-display font-bold">
                <MapPin size={16} className="text-turmeric-600" />
                {group.areaName}
              </div>
              <Badge variant="default" className="text-[10px] font-data">Total {total}</Badge>
            </div>
            
            <div className="p-4 flex-1">
              <div className="grid grid-cols-2 gap-4 h-full">
                {/* Meal Breakdown */}
                <div className="space-y-3 pr-4 border-r border-rice-100">
                  <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">By Meal</h4>
                  {group.breakfast > 0 && <div className="flex justify-between text-sm text-ink-700"><span>Breakfast</span> <span className="font-data font-bold">{group.breakfast}</span></div>}
                  {group.lunch > 0 && <div className="flex justify-between text-sm text-ink-700"><span>Lunch</span> <span className="font-data font-bold">{group.lunch}</span></div>}
                  {group.dinner > 0 && <div className="flex justify-between text-sm text-ink-700"><span>Dinner</span> <span className="font-data font-bold">{group.dinner}</span></div>}
                </div>

                {/* Plan Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">By Plan</h4>
                  {group.basic > 0 && <div className="flex justify-between text-sm text-ink-700"><span>Basic</span> <span className="font-data font-bold">{group.basic}</span></div>}
                  {group.regular > 0 && <div className="flex justify-between text-sm text-ink-700"><span>Regular</span> <span className="font-data font-bold">{group.regular}</span></div>}
                  {group.oneTime > 0 && <div className="flex justify-between text-sm text-ink-700"><span>One-Time</span> <span className="font-data font-bold">{group.oneTime}</span></div>}
                </div>
              </div>

              {/* Customer Packing List */}
              <div className="mt-6">
                <h4 className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-2 border-b border-rice-100 pb-1">Customer Packing List</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {group.orders.map(order => (
                    <div key={order.id} className="flex items-start justify-between bg-rice-25 p-2 rounded border border-rice-100">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`w-2 h-2 rounded-full ${order.mealType === 'breakfast' ? 'bg-orange-500' : order.mealType === 'lunch' ? 'bg-sky-500' : 'bg-purple-500'}`} />
                          <span className="font-bold text-sm text-ink-900 leading-tight">{order.customerName}</span>
                          <span className="text-[10px] font-mono text-ink-500 ml-1 bg-rice-100 px-1 rounded">{order.displayId}</span>
                        </div>
                        <div className="text-xs text-ink-700 font-medium ml-3.5">
                          {order.mealName}
                        </div>
                        {(order.specialInstructions || order.packingNotes) && (
                          <div className="ml-3.5 mt-1 space-y-0.5">
                            {order.specialInstructions && <div className="text-[10px] text-warning-dark font-medium bg-warning-subtle px-1.5 py-0.5 rounded inline-block">⚠️ {order.specialInstructions}</div>}
                            {order.packingNotes && <div className="text-[10px] text-info-dark font-medium bg-info-subtle px-1.5 py-0.5 rounded inline-block ml-1">📝 {order.packingNotes}</div>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-center shrink-0 w-6 h-6 rounded bg-turmeric-100 text-turmeric-800 font-bold text-xs border border-turmeric-200 ml-2">
                        {order.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
