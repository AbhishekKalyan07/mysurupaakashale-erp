import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliveryZoneRepository } from '@/shared/services/firestore/deliveryZoneRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import type { DeliveryZone } from '@/shared/types';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import toast from 'react-hot-toast';

export const ZONES_QUERY_KEY = ['deliveryZones'];

export function useDeliveryZones() {
  return useQuery({
    queryKey: ZONES_QUERY_KEY,
    queryFn: async () => {
      const zones = await deliveryZoneRepository.list();
      return zones.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        return nameA.localeCompare(nameB);
      });
    },
  });
}

export function useCreateZone() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Omit<DeliveryZone, 'id' | 'createdAt'>) => {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      const newZoneData = {
        ...data,
        createdAt: serverTimestamp() as unknown as Timestamp,
      };
      
      const zoneId = await deliveryZoneRepository.create(newZoneData as any);
      
      if (currentUser) {
        await auditRepository.logAction(
          'zone_created',
          currentUser.uid,
          currentUser.displayName || 'Admin',
          zoneId,
          'zone',
          { name: data.name }
        );
      }
      return zoneId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ZONES_QUERY_KEY });
      toast.success('Delivery Zone created successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to create zone');
    },
  });
}

export function useUpdateZone() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DeliveryZone> }) => {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      await deliveryZoneRepository.update(id, data);
      
      if (currentUser) {
        await auditRepository.logAction(
          'zone_updated',
          currentUser.uid,
          currentUser.displayName || 'Admin',
          id,
          'zone',
          { updatedKeys: Object.keys(data) }
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ZONES_QUERY_KEY });
      toast.success('Delivery Zone updated successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update zone');
    },
  });
}

export function useDeleteZone() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      await deliveryZoneRepository.delete(id);
      
      if (currentUser) {
        await auditRepository.logAction(
          'zone_deleted',
          currentUser.uid,
          currentUser.displayName || 'Admin',
          id,
          'zone'
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ZONES_QUERY_KEY });
      toast.success('Delivery Zone deleted successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to delete zone');
    },
  });
}
