import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { userRepository } from "@/shared/services/firestore/userRepository";
import type { Address, CustomerProfile } from "@/shared/types/user.types";

export function useCustomerAddresses() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;

  const customerProfile =
    profile?.role === "customer" ? (profile as CustomerProfile) : null;
  const addresses = customerProfile?.addresses || [];
  const defaultAddressId = customerProfile?.defaultAddressId || null;

  const addAddressMutation = useMutation({
    mutationFn: async (addressInput: Omit<Address, "id">) => {
      if (!uid || !customerProfile) throw new Error("Not authenticated");

      const newAddress: Address = {
        ...addressInput,
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2),
        lat: addressInput.lat ?? null,
        lng: addressInput.lng ?? null,
      };

      const updatedAddresses = [...addresses, newAddress];
      const existingAddressIds = customerProfile.addressIds || addresses.map((a) => a.id);
      const updatedAddressIds = [...existingAddressIds, newAddress.id];
      const updates: Partial<CustomerProfile> = {
        addresses: updatedAddresses,
        addressIds: updatedAddressIds,
      };

      if (!defaultAddressId || addresses.length === 0) {
        updates.defaultAddressId = newAddress.id;
      }

      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/shared/lib/firebase");
      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      const addrRef = doc(db, "users", uid, "addresses", newAddress.id);

      batch.update(userRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      batch.set(addrRef, newAddress);

      await batch.commit();

      return newAddress;
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (updated: Address) => {
      if (!uid || !customerProfile) throw new Error("Not authenticated");

      const updatedAddresses = addresses.map((addr) =>
        addr.id === updated.id ? updated : addr,
      );
      const existingAddressIds = customerProfile.addressIds || addresses.map((a) => a.id);
      const updatedAddressIds = existingAddressIds.includes(updated.id)
        ? existingAddressIds
        : [...existingAddressIds, updated.id];

      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/shared/lib/firebase");
      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      const addrRef = doc(db, "users", uid, "addresses", updated.id);

      batch.update(userRef, {
        addresses: updatedAddresses,
        addressIds: updatedAddressIds,
        updatedAt: serverTimestamp(),
      });
      batch.set(addrRef, updated);

      await batch.commit();
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!uid || !customerProfile) throw new Error("Not authenticated");

      const updatedAddresses = addresses.filter(
        (addr) => addr.id !== addressId,
      );
      const existingAddressIds = customerProfile.addressIds || addresses.map((a) => a.id);
      const updatedAddressIds = existingAddressIds.filter((id) => id !== addressId);
      const updates: Partial<CustomerProfile> = {
        addresses: updatedAddresses,
        addressIds: updatedAddressIds,
      };

      if (defaultAddressId === addressId) {
        updates.defaultAddressId =
          updatedAddresses.length > 0 ? updatedAddresses[0].id : null;
      }

      const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/shared/lib/firebase");
      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      const addrRef = doc(db, "users", uid, "addresses", addressId);

      batch.update(userRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      batch.delete(addrRef);

      await batch.commit();
    },
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!uid || !customerProfile) throw new Error("Not authenticated");
      await userRepository.update(uid, {
        defaultAddressId: addressId,
      });
    },
  });

  return {
    addresses,
    addressIds: customerProfile?.addressIds || addresses.map((a) => a.id),
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
