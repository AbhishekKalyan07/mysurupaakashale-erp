import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HeroBanner } from '@/shared/components/ui/HeroBanner';
import { DashboardCardsSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { getTodayInTimezone } from '@/shared/lib/date';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { useDeliveryBoard } from '../hooks/useDeliveryBoard';
import { DeliverySummaryCards } from '../components/DeliverySummaryCards';
import { DeliveryFilters } from '../components/DeliveryFilters';
import { DeliveryDispatchTable } from '../components/DeliveryDispatchTable';
import { deliveryService } from '@/shared/services/business/deliveryService';
import { MapPin } from 'lucide-react';
import { PremiumCard } from '@/shared/components/ui/PremiumCard';

export function DeliveryDashboardPage() {
  const today = getTodayInTimezone();

  const { allOrders, summary, isLoading, reassignMutation } = useDeliveryBoard(today);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');

  // Fetch Delivery Partners
  const { data: deliveryPartners = [] } = useQuery({
    queryKey: ['users', 'delivery_partner'],
    queryFn: async () => {
      const { where } = await import('firebase/firestore');
      return userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true));
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch Customers (only those in today's orders)
  const customerIds = useMemo(() => Array.from(new Set(allOrders.map(o => o.customerId))), [allOrders]);
  
  const { data: customers = [] } = useQuery({
    queryKey: ['users', 'customers', customerIds],
    queryFn: async () => {
      if (customerIds.length === 0) return [];
      const { where } = await import('firebase/firestore');
      // Firestore 'in' query supports max 10 elements. If we have more, we should chunk them or fetch all customers.
      // For simplicity in this scale, fetch all customers.
      return userRepository.list(where('role', '==', 'customer'));
    },
    staleTime: 1000 * 60 * 5,
  });

  const partnerMap = useMemo(() => new Map(deliveryPartners.map(p => [p.id, p.fullName || p.id])), [deliveryPartners]);
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const zoneMap = useMemo(() => new Map(), []); // Extend with Zone mapping when Zones are implemented

  // Apply filters
  const filteredOrders = useMemo(() => {
    return allOrders.filter(o => {
      // 1. Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'failed' && !['failed_delivery', 'returned_delivery'].includes(o.status)) return false;
        else if (statusFilter !== 'failed' && o.status !== statusFilter) return false;
      }
      
      // 2. Partner Filter
      if (partnerFilter === 'unassigned') {
        if (o.deliveryPartnerId) return false;
      } else if (partnerFilter !== 'all') {
        if (o.deliveryPartnerId !== partnerFilter) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customer = customerMap.get(o.customerId);
        const name = customer?.fullName?.toLowerCase() || '';
        const area = o.zoneId?.toLowerCase() || '';
        if (!name.includes(q) && !area.includes(q)) return false;
      }

      return true;
    });
  }, [allOrders, statusFilter, partnerFilter, searchQuery, customerMap]);

  const groupedOrders = useMemo(() => {
    return deliveryService.getAreaDeliveryGroups(filteredOrders, partnerMap, zoneMap);
  }, [filteredOrders, partnerMap, zoneMap]);

  if (isLoading) return <div className="p-8"><DashboardCardsSkeleton /></div>;

  return (
    <div className="space-y-6 pb-20">
      <HeroBanner 
        userName="Dispatch Team"
        subtitle={`Date: ${today} | Total Orders: ${allOrders.length}`}
      />

      <DeliverySummaryCards summary={summary} />

      <DeliveryFilters 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        partnerFilter={partnerFilter}
        onPartnerChange={setPartnerFilter}
        partners={deliveryPartners}
      />

      {/* Structural placeholder for future Maps integration */}
      <PremiumCard className="p-4 bg-rice-50/50 border-dashed border-2 border-gold/40 hidden md:flex items-center justify-center opacity-70 cursor-not-allowed">
        <div className="text-center">
          <MapPin size={24} className="mx-auto text-gold mb-2" />
          <h3 className="font-display font-semibold text-primary">Live Map View</h3>
          <p className="text-sm text-text-muted max-w-sm">Architecture ready for GPS tracking and Route Optimization.</p>
        </div>
      </PremiumCard>

      <DeliveryDispatchTable 
        groupedOrders={groupedOrders}
        customerMap={customerMap}
        partners={deliveryPartners}
        onReassign={(orderId, partnerId) => reassignMutation.mutate({ orderId, partnerId })}
      />
    </div>
  );
}
