import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { Search, Filter } from 'lucide-react';

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusChange: (s: string) => void;
  partnerFilter: string;
  onPartnerChange: (p: string) => void;
  partners: any[];
}

export function DeliveryFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  partnerFilter,
  onPartnerChange,
  partners
}: Props) {
  return (
    <Card className="p-4 bg-rice-50/50 border-rice-200 flex flex-col md:flex-row gap-4 items-center justify-between">
      <div className="flex-1 w-full relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
        <input
          type="text"
          placeholder="Search by customer or area..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-rice-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/30 outline-none text-sm transition-all"
        />
      </div>

      <div className="flex w-full md:w-auto gap-3 items-center">
        <Filter className="text-text-muted w-4 h-4 hidden md:block" />
        
        <select
          value={partnerFilter}
          onChange={(e) => onPartnerChange(e.target.value)}
          className="flex-1 md:w-48 border border-rice-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary/30 outline-none text-sm"
        >
          <option value="all">All Partners</option>
          <option value="unassigned">Unassigned Only</option>
          {partners.map(p => (
            <option key={p.id} value={p.id}>{p.fullName || p.id}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="flex-1 md:w-48 border border-rice-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary/30 outline-none text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="ready_for_pickup">Ready for Pickup (Assigned)</option>
          <option value="picked_up">Picked Up</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed / Returned</option>
        </select>
      </div>
    </Card>
  );
}
