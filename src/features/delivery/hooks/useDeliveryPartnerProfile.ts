import { useQuery } from '@tanstack/react-query';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { DeliveryPartnerProfile } from '@/shared/types';

export function useDeliveryPartnerProfile(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'deliveryPartner', partnerId],
    queryFn: async () => {
      if (!partnerId) return null;
      const doc = await userRepository.getById(partnerId);
      if (!doc || doc.role !== 'delivery_partner') return null;
      return doc as DeliveryPartnerProfile;
    },
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
