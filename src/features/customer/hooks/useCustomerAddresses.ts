import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { userRepository } from '@/shared/services/firestore/userRepository';
import type { Address, CustomerProfile } from '@/shared/types/user.types';

export function useCustomerAddresses() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;

  const customerProfile = profile?.role === 'customer' ? (profile as CustomerProfile) : null;
  const addresses = customerProfile?.addresses || [];
  const defaultAddressId = customerProfile?.defaultAddressId || null;

  const addAddressMutation = useMutation({
    mutationFn: async (addressInput: Omit<Address, 'id'>) => {
      if (!uid || !customerProfile) throw new Error('Not authenticated');

      const newAddress: Address = {
        ...addressInput,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        lat: addressInput.lat ?? null,
        lng: addressInput.lng ?? null,
      };

      const updatedAddresses = [...addresses, newAddress];
      const updates: Partial<CustomerProfile> = {
        addresses: updatedAddresses,
      };

      if (!defaultAddressId || addresses.length === 0) {
        updates.defaultAddressId = newAddress.id;
      }

      await userRepository.update(uid, updates);
      
      const { orderService } = await import('@/shared/services/business/orderService');
      await orderService.syncCustomerActiveOrders(uid);
      
      return newAddress;
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (updated: Address) => {
      if (!uid || !customerProfile) throw new Error('Not authenticated');

      const updatedAddresses = addresses.map((addr) =>
        addr.id === updated.id ? updated : addr
      );

      await userRepository.update(uid, {
        addresses: updatedAddresses,
      });

      const { orderService } = await import('@/shared/services/business/orderService');
      await orderService.syncCustomerActiveOrders(uid);
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!uid || !customerProfile) throw new Error('Not authenticated');

      const updatedAddresses = addresses.filter((addr) => addr.id !== addressId);
      const updates: Partial<CustomerProfile> = {
        addresses: updatedAddresses,
      };

      if (defaultAddressId === addressId) {
        updates.defaultAddressId = updatedAddresses.length > 0 ? updatedAddresses[0].id : null;
      }

      await userRepository.update(uid, updates);

      const { orderService } = await import('@/shared/services/business/orderService');
      await orderService.syncCustomerActiveOrders(uid);
    },
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!uid || !customerProfile) throw new Error('Not authenticated');
      await userRepository.update(uid, {
        defaultAddressId: addressId,
      });

      const { orderService } = await import('@/shared/services/business/orderService');
      await orderService.syncCustomerActiveOrders(uid);
    },
  });

  return {
    addresses,
    defaultAddressId,
    addAddress: addAddressMutation.mutateAsync,
    isAdding: addAddressMutation.isPending,
    updateAddress: updateAddressMutation.mutateAsync,
    isUpdating: updateAddressMutation.isPending,
    deleteAddress: deleteAddressMutation.mutateAsync,
    isDeleting: deleteAddressMutation.isPending,
    setDefaultAddress: setDefaultAddressMutation.mutateAsync,
    isSettingDefault: setDefaultAddressMutation.isPending,
  };
}
