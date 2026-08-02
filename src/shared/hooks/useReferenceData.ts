import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { deliveryZoneRepository } from '@/shared/services/firestore/deliveryZoneRepository';
import { where } from 'firebase/firestore';
/**
 * A shared reference-data hook for fetching and mapping Zones, Partners, and Customers.
 * Highly reusable across Kitchen and Delivery modules to resolve IDs to display names.
 */
export function useReferenceData(customerIds: string[] = []) {
  // 1. Fetch Zones
  const zonesQuery = useQuery({
    queryKey: ['reference', 'zones'],
    queryFn: () => deliveryZoneRepository.list(),
    staleTime: 10 * 60_000, // 10 minutes
  });

  const zoneMap = useMemo(() => {
    const map = new Map<string, string>();
    if (zonesQuery.data) {
      for (const z of zonesQuery.data) {
        map.set(z.id, z.name); // Resolve ID to Zone Name
      }
    }
    return map;
  }, [zonesQuery.data]);

  // 2. Fetch Delivery Partners
  const partnersQuery = useQuery({
    queryKey: ['reference', 'delivery_partners'],
    queryFn: () => userRepository.list(where('role', '==', 'delivery_partner'), where('isActive', '==', true)),
    staleTime: 10 * 60_000,
  });

  const partnerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (partnersQuery.data) {
      for (const p of partnersQuery.data) {
        map.set(p.id, p.fullName || p.id);
      }
    }
    return map;
  }, [partnersQuery.data]);

  // 3. Fetch Customers (batch)
  const customerIdsStr = customerIds.join(',');
  const uniqueCustomerIds = useMemo(() => {
    return customerIdsStr ? [...new Set(customerIdsStr.split(','))] : [];
  }, [customerIdsStr]);

  const customerQueries = useQuery({
    queryKey: ['reference', 'customerProfiles', ...uniqueCustomerIds],
    queryFn: async () => {
      if (uniqueCustomerIds.length === 0) return {};
      const profiles = await Promise.all(
        uniqueCustomerIds.map((uid) => userRepository.getById(uid).catch(() => null))
      );
      const map: Record<string, string> = {};
      uniqueCustomerIds.forEach((uid, i) => {
        map[uid] = profiles[i]?.fullName ?? uid;
      });
      return map;
    },
    enabled: uniqueCustomerIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (customerQueries.data) {
      for (const [uid, name] of Object.entries(customerQueries.data)) {
        map.set(uid, name);
      }
    }
    return map;
  }, [customerQueries.data]);

  return {
    zoneMap,
    partnerMap,
    customerMap,
    isReferenceLoading: zonesQuery.isLoading || partnersQuery.isLoading,
  };
}
